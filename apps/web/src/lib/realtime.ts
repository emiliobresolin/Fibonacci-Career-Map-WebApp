'use client';

import { useEffect, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

import {
  type RealtimeEvent,
  safeParseRealtimeEvent,
} from '@fcm/domain-contracts';

/**
 * Story 5-5: client-side realtime hook.
 *
 * Connects to the FCM API Socket.IO server with the caller's bearer
 * token, joins `user:<userId>` on connect, exposes a per-employee
 * subscribe API, invalidates the right TanStack Query keys when
 * server events arrive, and falls back to polling when the socket
 * has been disconnected for more than 10 seconds.
 *
 * Single-instance pattern: the hook is intended to be mounted once
 * at the root layout. Mounting in multiple components would create
 * multiple sockets — acceptable functionally (server fans out to
 * both) but wasteful.
 *
 * The metrics surface (AC4) collects {connected, disconnects,
 * pollingFallbackActive} in a module-level singleton; the
 * end-of-session beacon (Story 11-8) reads them via the exported
 * `getRealtimeMetrics()` function.
 */

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:3001';
const RECONNECT_GRACE_MS = 10_000;
const POLLING_INTERVAL_MS = 30_000;

type Metrics = {
  connected: boolean;
  totalDisconnects: number;
  pollingFallbackActive: boolean;
  /** Number of events the hook has invalidated queries for. */
  eventsApplied: number;
};

const metrics: Metrics = {
  connected: false,
  totalDisconnects: 0,
  pollingFallbackActive: false,
  eventsApplied: 0,
};

export function getRealtimeMetrics(): Readonly<Metrics> {
  return { ...metrics };
}

export type UseRealtimeArgs = {
  /** Bearer token for the Socket.IO handshake. Hook waits for a
   *  non-empty value before connecting; passing '' / undefined
   *  defers connect until the session is ready. */
  token: string | null | undefined;
  /** The signed-in user's user_id — the hook auto-joins
   *  `user:<userId>` on connect. */
  userId: string | null | undefined;
};

export type UseRealtimeApi = {
  /** Subscribe to an employee's events. Returns an unsubscribe fn. */
  subscribeEmployee: (employeeId: string) => () => void;
  /** Current connection state — handy for UI banners. */
  state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'polling';
};

export function useRealtime({ token, userId }: UseRealtimeArgs): UseRealtimeApi {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedEmployees = useRef<Set<string>>(new Set());
  const [state, setState] = useState<UseRealtimeApi['state']>('idle');

  useEffect(() => {
    if (!token || !userId) {
      setState('idle');
      return;
    }
    setState('connecting');
    const socket = io(API_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      metrics.connected = true;
      stopPolling();
      clearReconnectTimer();
      setState('connected');
      // Auto-join user:<userId> on connect (AC1).
      socket.emit('join', `user:${userId}`);
      // Re-join previously subscribed employee rooms after a reconnect
      // (the server doesn't preserve room membership across socket ids).
      for (const empId of subscribedEmployees.current) {
        socket.emit('join', `employee:${empId}`);
      }
    });

    socket.on('disconnect', () => {
      metrics.connected = false;
      metrics.totalDisconnects += 1;
      setState('disconnected');
      // AC3: after 10s without reconnect, start polling.
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        startPolling(queryClient);
        setState('polling');
      }, RECONNECT_GRACE_MS);
    });

    socket.onAny((eventName: string, payload: unknown) => {
      // Validate every received event against the contract before
      // mutating the query cache. A drift between server + client
      // contracts is caught here rather than producing a silent
      // mis-rendered UI.
      const parsed = safeParseRealtimeEvent({ ...(payload as object), eventType: eventName });
      if (!parsed.ok) return;
      applyEvent(parsed.event, queryClient);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      stopPolling();
      clearReconnectTimer();
    };
  }, [token, userId, queryClient]);

  function clearReconnectTimer(): void {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function stopPolling(): void {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    metrics.pollingFallbackActive = false;
  }

  function startPolling(qc: QueryClient): void {
    if (pollingTimerRef.current) return;
    metrics.pollingFallbackActive = true;
    let sinceIso: string | null = null;
    const tick = async (): Promise<void> => {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token ?? ''}`,
        };
        if (sinceIso) headers['If-Modified-Since'] = sinceIso;
        const res = await fetch(
          `${API_BASE}/v1/latest-snapshots${sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : ''}`,
          { headers },
        );
        if (res.status === 200) {
          // Treat the polling response as "something changed" and
          // invalidate all subscribed-employee query keys. The
          // endpoint itself ships with Story 9-7; until then, the
          // fetch will 404 and the catch swallows it.
          for (const empId of subscribedEmployees.current) {
            await qc.invalidateQueries({ queryKey: ['employee', empId] });
          }
          sinceIso = new Date().toUTCString();
        }
      } catch {
        // Network blip — try again next tick.
      }
    };
    pollingTimerRef.current = setInterval(() => void tick(), POLLING_INTERVAL_MS);
    void tick(); // fire-and-forget initial tick
  }

  function subscribeEmployee(employeeId: string): () => void {
    subscribedEmployees.current.add(employeeId);
    socketRef.current?.emit('join', `employee:${employeeId}`);
    return () => {
      subscribedEmployees.current.delete(employeeId);
      // No server-side leave message in this story — the room
      // auto-cleans when the socket disconnects. A future story
      // can add an explicit leave handler.
    };
  }

  return { subscribeEmployee, state };
}

/**
 * Apply a received realtime event to the TanStack Query cache.
 * Exported separately so unit tests can exercise it without booting
 * a Socket.IO client.
 */
export function applyEvent(event: RealtimeEvent, queryClient: QueryClient): void {
  metrics.eventsApplied += 1;
  switch (event.eventType) {
    case 'snapshot.updated':
      // AC2: invalidate the affected employee's keys. The 3D-map
      // instance-attribute updater (Story 11-3) wires its own
      // listener on top — this hook only handles the query layer.
      void queryClient.invalidateQueries({ queryKey: ['employee', event.employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['snapshot', event.employeeId] });
      break;
    case 'evidence.submitted':
    case 'evidence.approved':
    case 'evidence.rejected':
      void queryClient.invalidateQueries({ queryKey: ['evidence', event.employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['employee', event.employeeId] });
      break;
    case 'promotion.initiated':
    case 'promotion.decided':
    case 'promotion.completed':
      void queryClient.invalidateQueries({ queryKey: ['promotion', event.promotionId] });
      void queryClient.invalidateQueries({ queryKey: ['employee', event.employeeId] });
      break;
    case 'recalc.pending':
    case 'recalc.completed':
    case 'recalc.failed':
      void queryClient.invalidateQueries({ queryKey: ['recalc-status', event.employeeId] });
      break;
    case 'config.changed':
      void queryClient.invalidateQueries({ queryKey: ['config', event.configurationAggregate] });
      break;
    case 'organization.promotion_mode.changed':
      void queryClient.invalidateQueries({ queryKey: ['organization', event.organizationId] });
      break;
  }
}
