'use client';

import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { authedPatch, isError } from '../../../lib/settings-api';

type Mode = 'CALIBRATION' | 'ACTIVE';

const RATIONALE_MIN_FORWARD = 100;

export function PromotionModeForm({
  initial,
  token,
}: {
  initial: Mode;
  token: string;
}): JSX.Element {
  const router = useRouter();
  const [target, setTarget] = useState<Mode>(initial);
  const [rationale, setRationale] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [currentMode, setCurrentMode] = useState<Mode>(initial);

  const dirty = target !== currentMode;
  const isForward = currentMode === 'CALIBRATION' && target === 'ACTIVE';
  const rationaleLong = rationale.trim().length;
  const rationaleOk = !isForward || rationaleLong >= RATIONALE_MIN_FORWARD;
  const canSave = dirty && rationaleOk && status !== 'saving';

  async function save(): Promise<void> {
    setStatus('saving');
    setMessage('');
    const result = await authedPatch<{ promotionMode: Mode; changedAt: string | null; changedBy: string | null }>(
      '/v1/organizations/me/promotion-mode',
      { promotionMode: target, rationale: rationale.trim() || null },
      token,
    );
    if (isError(result)) {
      setStatus('error');
      setMessage(result.error);
      return;
    }
    setCurrentMode(result.promotionMode);
    setStatus('done');
    setMessage(`Mode transitioned to ${result.promotionMode}.`);
    setRationale(''); // clear the textarea for safety
    // Reviewer M2: refresh the server-rendered CurrentStateCard so
    // changedAt / changedBy reflect the just-saved transition.
    router.refresh();
  }

  return (
    <form
      className="space-y-4 rounded border border-neutral-800 bg-neutral-950 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void save();
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Transition to</legend>
        <div className="flex gap-3">
          {(['CALIBRATION', 'ACTIVE'] as Mode[]).map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer rounded border border-neutral-800 px-3 py-1.5 hover:border-neutral-700">
              <input
                type="radio"
                name="promotionMode"
                value={m}
                checked={target === m}
                onChange={() => setTarget(m)}
              />
              <span className="font-mono text-xs">{m}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="rationale" className="block text-sm font-medium">
          Rationale {isForward && <span className="text-amber-400">(required, ≥ {RATIONALE_MIN_FORWARD} chars)</span>}
        </label>
        <textarea
          id="rationale"
          name="rationale"
          rows={5}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          aria-describedby="rationale-counter"
          className="block w-full rounded border border-neutral-800 bg-neutral-900 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          placeholder={
            isForward
              ? 'Why is the org ready for ACTIVE? This rationale is permanently audited.'
              : 'Optional. ACTIVE → CALIBRATION accepts an empty rationale.'
          }
        />
        <div id="rationale-counter" className="flex items-center justify-between text-xs">
          <span className="text-neutral-500">
            Audit log captures the full rationale verbatim.
          </span>
          <span className={isForward && rationaleLong < RATIONALE_MIN_FORWARD ? 'text-rose-400' : 'text-neutral-500'}>
            {rationaleLong} / {isForward ? RATIONALE_MIN_FORWARD : 'optional'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSave}
          className="rounded bg-indigo-700 px-3 py-1.5 text-sm hover:bg-indigo-600 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        >
          {status === 'saving' ? 'Transitioning…' : 'Transition mode'}
        </button>
        {message && (
          <span
            role="status"
            aria-live="polite"
            className={status === 'error' ? 'text-rose-400 text-sm' : 'text-emerald-400 text-sm'}
          >
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
