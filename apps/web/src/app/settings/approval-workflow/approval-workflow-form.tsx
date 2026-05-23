'use client';

import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

import { authedPatch, isError } from '../../../lib/settings-api';

type Kind = 'SINGLE' | 'DUAL_MANAGER' | 'HR_GATE';

const OPTIONS: { value: Kind; label: string; help: string }[] = [
  { value: 'SINGLE', label: 'Single manager', help: 'One manager approval ends the chain.' },
  { value: 'DUAL_MANAGER', label: 'Dual manager', help: 'Two manager-level approvals required before promotion commits.' },
  { value: 'HR_GATE', label: 'HR gate', help: 'Manager approval plus an HR sign-off.' },
];

export function ApprovalWorkflowForm({
  initial,
  token,
}: {
  initial: Kind;
  token: string;
}): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<Kind>(initial);
  const [committed, setCommitted] = useState<Kind>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const dirty = selected !== committed;

  async function save(): Promise<void> {
    setStatus('saving');
    setMessage('');
    const result = await authedPatch<{ approvalWorkflowDefault: Kind }>(
      '/v1/organizations/me/approval-workflow',
      { approvalWorkflowDefault: selected },
      token,
    );
    if (isError(result)) {
      setStatus('error');
      setMessage(result.error);
      return;
    }
    setCommitted(result.approvalWorkflowDefault);
    setStatus('done');
    setMessage(`Approval workflow set to ${result.approvalWorkflowDefault}.`);
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
        <legend className="text-sm font-medium">Choose an approval workflow</legend>
        {OPTIONS.map((opt) => {
          const helpId = `aw-help-${opt.value}`;
          return (
            <div key={opt.value} className="rounded p-2 hover:bg-neutral-900">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="approvalWorkflowDefault"
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
