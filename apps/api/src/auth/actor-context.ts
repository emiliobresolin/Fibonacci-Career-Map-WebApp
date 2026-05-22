import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { ROLES, type Role } from './auth.types.js';
import type { RequestUser } from './auth.types.js';

/**
 * Layer-2 authorization primitive (Arch §10.3 Layer 2, Story 2-5).
 *
 * The unified "who is acting?" object that every domain service method
 * receives. Constructed once per request from the verified JWT (Story 2-4
 * AuthGuard) and propagated through:
 *
 *   • REST handlers → `@ActorContext() actor: ActorContext`
 *   • BullMQ jobs   → `JobPayloadWithActor<T>` wraps job data with an
 *                     `actor` field; consumers read it back via
 *                     `actorFromJobData(job.data)`.
 *   • WebSocket     → reserved for Story 5-2 (`socket.data.actor`).
 *
 * The shape is intentionally lean: only the fields a domain service is
 * allowed to act on. Anything that can change between login and the
 * service call (role assignments, organization mutations) must be
 * re-fetched at the service layer rather than trusted from this object.
 */
export type ActorContext = {
  user_id: string;
  organization_id: string;
  role: Role;
  display_name: string;
};

/** Adapter: turn the AuthGuard-stamped `request.user` into an ActorContext.
 *  Centralised so REST + WS + cron-emitted jobs share one mapping. */
export function actorContextFromRequestUser(user: RequestUser): ActorContext {
  return {
    user_id: user.user_id,
    organization_id: user.organization_id,
    role: user.role,
    display_name: user.display_name,
  };
}

/**
 * `@ActorContext()` parameter decorator. Reads the AuthGuard-populated
 * `request.user` and returns an ActorContext.
 *
 *   @Post('foo')
 *   handle(@ActorContext() actor: ActorContext) { ... }
 *
 * Throws 401 if used on a route the AuthGuard didn't populate (typically
 * a `@Public()` route — the decorator is meaningless there).
 */
export const ActorContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    if (ctx.getType() !== 'http') {
      // Non-http transport landed on `@ActorContext()` — surface as 401
      // rather than a 500 leaking the internal-invariant message. The
      // BullMQ + WS surfaces have their own actor extractors.
      throw new UnauthorizedException('Authentication context missing');
    }
    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (!req.user) {
      throw new UnauthorizedException('Authentication context missing');
    }
    return actorContextFromRequestUser(req.user);
  },
);

// ─── BullMQ propagation ──────────────────────────────────────────────
//
// Background jobs frequently mutate state on behalf of a user (evidence
// approval, score recalc triggered by a manager save, etc.). The
// audit-event row for that mutation must reference the originating
// actor, not the worker process. We bake the actor into the job payload
// at enqueue time and read it back at consume time.
//
// Producers MUST go through `withActor()` (or another helper that
// guarantees the field is present). Consumers extract the actor via
// `actorFromJobData(job.data)`, which validates the shape AND the
// `role` field against the ROLES enum so a poisoned/forged payload
// can't bypass the same enum check `JwtService.verifyAccess` does.

export type JobPayloadWithActor<T> = T & { actor: ActorContext };

/**
 * Helper to build a job payload that carries the actor. Use at the
 * call site of every `queue.add(...)`:
 *
 *   await queue.add('recalc', withActor(actor, { employeeId }));
 *
 * Cannot be skipped accidentally — a producer that forgets returns
 * `T` (no actor field), which fails the consumer-side `actorFromJobData`
 * check immediately.
 */
export function withActor<T extends object>(actor: ActorContext, data: T): JobPayloadWithActor<T> {
  return { ...data, actor };
}

/** Parse the actor from a BullMQ job's data field. Asserts the actor
 *  is present + well-shaped + role ∈ ROLES — a job that landed without
 *  one indicates a producer-side bug (someone bypassed `withActor`),
 *  and a forged role would otherwise propagate through audit
 *  attribution. */
export function actorFromJobData(data: unknown): ActorContext {
  if (!data || typeof data !== 'object') {
    throw new Error('job data missing actor context (data is not an object)');
  }
  const candidate = (data as { actor?: unknown }).actor;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('job data missing actor context (no `actor` field)');
  }
  const a = candidate as Partial<ActorContext>;
  if (
    typeof a.user_id !== 'string' ||
    typeof a.organization_id !== 'string' ||
    typeof a.role !== 'string' ||
    typeof a.display_name !== 'string'
  ) {
    throw new Error('job data actor context has malformed fields');
  }
  if (!(ROLES as readonly string[]).includes(a.role)) {
    throw new Error(`job data actor context has unknown role: ${a.role}`);
  }
  return {
    user_id: a.user_id,
    organization_id: a.organization_id,
    role: a.role as Role,
    display_name: a.display_name,
  };
}

// ─── WebSocket propagation (stub for Story 5-2) ──────────────────────
//
// Story 5-2 will authenticate the Socket.IO handshake against the same
// JWT contract. The actor will live at `socket.data.actor` so per-event
// handlers can read it the same way REST handlers read `req.user`.
//
// This type lives here so Story 5-2 inherits a load-bearing shape
// rather than re-inventing it. The handshake adapter itself ships with
// 5-2 — until then this is the only artifact.

export type SocketWithActor = {
  data: { actor: ActorContext };
};

/** Extract the actor from a socket whose handshake adapter has
 *  populated `socket.data.actor`. Validates the shape with the same
 *  rules as `actorFromJobData`. */
export function actorFromSocket(socket: unknown): ActorContext {
  if (!socket || typeof socket !== 'object') {
    throw new Error('socket missing actor context (socket is not an object)');
  }
  const data = (socket as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    throw new Error('socket missing actor context (no socket.data)');
  }
  return actorFromJobData(data); // reuse the same shape-validator
}
