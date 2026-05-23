'use client';

import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { authedPatch, isError } from '../../../lib/settings-api';

type Setting = 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';

const OPTIONS: { value: Setting; label: string; help: string }[] = [
  { value: 'OWN_ONLY', label: 'Own only', help: 'Each employee sees only themselves. Map renders peers as anonymous placeholders.' },
  { value: 'TEAM', label: 'Team', help: 'Managers see their direct reports; everyone else is hidden.' },
  { value: 'ORG_SUMMARY', label: 'Org summary', help: 'Aggregated org-wide view; per-employee detail still hidden.' },
  { value: 'ORG_FULL', label: 'Org full', help: 'Every employee row visible to every authenticated user.' },
];

/**
 * Story 7-11 — VisibilityForm.
 *
 * AC1: form for the four enum values, save button, success/error state.
 * AC2: visibility is org-wide; the affect-N-employees preview is
 * functionally "all employees" so we render that as static copy rather
 * than calling the preview endpoint per option click.
 * AC3: keyboard nav via native <input type="radio">; aria-describedby
 * ties each help text to its option. Save button is disabled until
 * the selection differs from the current value, mirroring the
 * server-side no-op (no audit emit, no map-cache invalidation).
 */
export function VisibilityForm({
  initial,
  token,
}: {
  initial: Setting;
  token: string;
}): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<Setting>(initial);
  const [committed, setCommitted] = useState<Setting>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const dirty = selected !== committed;

  async function save(): Promise<void> {
    setStatus('saving');
    setMessage('');
    const result = await authedPatch<{ visibilityDefault: Setting }>(
      '/v1/organizations/me/visibility',
      { visibilityDefault: selected },
      token,
    );
    if (isError(result)) {
      setStatus('error');
      setMessage(result.error);
      return;
    }
    setCommitted(result.visibilityDefault);
    setStatus('done');
    setMessage(`Visibility set to ${result.visibilityDefault}.`);
    // Reviewer M2: refresh the server component so any sibling page
    // (or this page on revisit) sees the new value.
    router.refresh();
  }

  return (
    <form
      className="space-y-4 rounded border border-neutral-800 bg-neutral-950 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Choose a visibility default</legend>
        {OPTIONS.map((opt) => {
          const helpId = `visibility-help-${opt.value}`;
          return (
            <div key={opt.value} className="rounded p-2 hover:bg-neutral-900">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="visibilityDefault"
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                  aria-describedby={helpId}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{opt.label}</span>
                  <span id={helpId} className="block text-xs text-neutral-400">
                    {opt.help}
                  </span>
                </span>
              </label>
            </div>
          );
        })}
      </fieldset>

      <div
        role="note"
        className="rounded border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-400"
      >
        <strong className="text-neutral-200">Change impact:</strong> visibility is an org-wide
        setting. A change applies to every authenticated user immediately and invalidates the
        Map Data Contract cache (Epic 10). No per-employee preview is meaningful here.
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!dirty || status === 'saving'}
          className="rounded bg-indigo-700 px-3 py-1.5 text-sm hover:bg-indigo-600 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
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
