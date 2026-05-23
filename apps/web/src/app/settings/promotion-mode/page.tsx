import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getPromotionMode, isError } from '../../../lib/settings-api';
import { getServerToken } from '../../../lib/settings-auth';
import { PromotionModeForm } from './promotion-mode-form';

/**
 * Story 7-11 — /settings/promotion-mode page.
 *
 * Renders the current mode + last-transition metadata, with a form to
 * trigger CALIBRATION ↔ ACTIVE with mandatory rationale on the forward
 * transition (Arch §6.2, enforced server-side at 100 chars).
 */
export default async function PromotionModePage(): Promise<JSX.Element> {
  const token = (await getServerToken()) ?? '';
  if (!token) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Rollout mode</h1>
        <p className="mt-3 text-sm text-neutral-400">Not signed in.</p>
      </section>
    );
  }
  const result = await getPromotionMode(token);
  if (isError(result)) {
    if (result.status === 401 || result.status === 403) {
      redirect('/map');
    }
    return (
      <section>
        <h1 className="text-2xl font-semibold">Rollout mode</h1>
        <div className="mt-3 rounded border border-red-700 bg-red-950 p-4 text-sm">
          {result.error}
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Rollout mode</h1>
        <p className="mt-1 text-sm text-neutral-400">
          CALIBRATION while the org tunes thresholds; flip to ACTIVE to expose eligibility
          + the promotion workflow (Epic 13). The forward transition requires a rationale of
          at least 100 characters (audited).
        </p>
      </header>
      <CurrentStateCard
        mode={result.promotionMode}
        changedAt={result.changedAt}
        changedBy={result.changedBy}
      />
      <PromotionModeForm initial={result.promotionMode} token={token} />
    </section>
  );
}

function CurrentStateCard({
  mode,
  changedAt,
  changedBy,
}: {
  mode: 'CALIBRATION' | 'ACTIVE';
  changedAt: string | null;
  changedBy: string | null;
}): JSX.Element {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-neutral-400">Current mode</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-mono ${
            mode === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'
          }`}
        >
          {mode}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-400">
        <div>
          <div className="text-neutral-500">Last transition</div>
          <div className="text-neutral-300">{changedAt ?? 'Never transitioned'}</div>
        </div>
        <div>
          <div className="text-neutral-500">Changed by</div>
          <div className="font-mono text-neutral-300">{changedBy ?? '—'}</div>
        </div>
      </div>
    </div>
  );
}
