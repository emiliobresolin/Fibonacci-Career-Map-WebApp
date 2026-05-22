'use client';

import { useState, type JSX } from 'react';

export type DlqFailure = {
  jobId: string;
  name: string;
  originalQueue: string;
  attemptsMade: number;
  failureReason: string;
  enqueuedAt: string | null;
};

export type DlqQueueEntry = {
  queue: string;
  depth: number;
  recentFailures: DlqFailure[];
};

export function DlqQueueCard({
  entry,
  apiBase,
  token,
}: {
  entry: DlqQueueEntry;
  apiBase: string;
  token: string;
}): JSX.Element {
  return (
    <section className="rounded border border-neutral-800 bg-neutral-950 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="font-mono text-sm">{entry.queue}</h2>
        <span
          className={`text-xs ${entry.depth === 0 ? 'text-emerald-500' : 'text-amber-400'}`}
        >
          depth: {entry.depth}
        </span>
      </header>
      {entry.recentFailures.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No failures.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {entry.recentFailures.map((f) => (
            <FailureRow key={f.jobId} failure={f} queue={entry.queue} apiBase={apiBase} token={token} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FailureRow({
  failure,
  queue,
  apiBase,
  token,
}: {
  failure: DlqFailure;
  queue: string;
  apiBase: string;
  token: string;
}): JSX.Element {
  const [state, setState] = useState<'idle' | 'replaying' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function replay(): Promise<void> {
    setState('replaying');
    try {
      const res = await fetch(
        `${apiBase}/v1/dlq/${encodeURIComponent(queue)}/${encodeURIComponent(failure.jobId)}/replay`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const body = await res.text();
        setState('error');
        setMessage(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        return;
      }
      const body = (await res.json()) as { newJobId: string };
      setState('done');
      setMessage(`Re-enqueued as ${body.newJobId}`);
    } catch (err) {
      setState('error');
      setMessage((err as Error).message);
    }
  }

  return (
    <li className="rounded border border-neutral-800 bg-neutral-900 p-3 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono">{failure.jobId}</span>
        <button
          type="button"
          disabled={state === 'replaying' || state === 'done'}
          onClick={() => void replay()}
          className="rounded bg-indigo-700 px-2 py-1 text-xs hover:bg-indigo-600 disabled:opacity-50"
        >
          {state === 'replaying' ? 'Replaying…' : state === 'done' ? 'Replayed' : 'Re-enqueue'}
        </button>
      </div>
      <div className="mt-1 text-muted-foreground">
        attempts: {failure.attemptsMade} · enqueued: {failure.enqueuedAt ?? '—'}
      </div>
      {failure.failureReason && (
        <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-black p-2 text-rose-300">
          {failure.failureReason}
        </pre>
      )}
      {message && (
        <div
          className={`mt-1 ${state === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}
        >
          {message}
        </div>
      )}
    </li>
  );
}
