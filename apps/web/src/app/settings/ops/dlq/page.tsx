// Story 4-5 AC1: admin-only DLQ admin UI.
//
// Server component that fetches GET /v1/dlq from the FCM API using the
// caller's bearer token. The API enforces @Roles('ADMIN') server-side
// (Story 2-4), so a non-admin reaching this page gets a 403 from the
// fetch and the UI renders an access-denied state.
//
// Re-enqueue is a client-side fetch against POST /v1/dlq/:queue/:jobId/replay
// — the ReplayButton component below.

import type { JSX } from 'react';

import { DlqQueueCard, type DlqQueueEntry } from './dlq-card';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:3001';

async function fetchDlq(token: string): Promise<{ queues: DlqQueueEntry[] } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}/v1/dlq?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      return { error: 'Admin role required to view this page.' };
    }
    if (!res.ok) {
      return { error: `API returned ${res.status}` };
    }
    return (await res.json()) as { queues: DlqQueueEntry[] };
  } catch (err) {
    return { error: `Failed to reach API: ${(err as Error).message}` };
  }
}

export default async function DlqAdminPage(): Promise<JSX.Element> {
  // Token comes from the NextAuth session in a fully-wired build. For
  // now we read from a cookie set by the dev shortcut flow; production
  // wiring lands when NextAuth's session module is finalized.
  const token = (await getServerToken()) ?? '';
  if (!token) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">DLQ admin</h1>
        <p className="mt-3 text-sm text-muted-foreground">Not signed in.</p>
      </main>
    );
  }
  const result = await fetchDlq(token);
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">DLQ admin</h1>
        <p className="text-sm text-muted-foreground">
          Inspect dead-letter queues and re-enqueue failed jobs. Admin role required.
        </p>
      </header>
      {'error' in result ? (
        <div className="rounded border border-red-700 bg-red-950 p-4 text-sm">
          {result.error}
        </div>
      ) : (
        <div className="space-y-3">
          {result.queues.map((q) => (
            <DlqQueueCard key={q.queue} entry={q} apiBase={API_BASE} token={token} />
          ))}
        </div>
      )}
    </main>
  );
}

// Minimal server-side token fetcher. The full NextAuth integration
// (Story 2-2 + 2-3) wraps this with a real session module — for now,
// the value flows through a dev cookie. Documented as scaffold.
async function getServerToken(): Promise<string | null> {
  const { cookies } = await import('next/headers');
  const store = cookies();
  return store.get('fcm-access-token')?.value ?? null;
}
