import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getApprovalWorkflow, isError } from '../../../lib/settings-api';
import { getServerToken } from '../../../lib/settings-auth';
import { ApprovalWorkflowForm } from './approval-workflow-form';

/**
 * Story 7-11 — /settings/approval-workflow page. AC4 redirect on 403.
 */
export default async function ApprovalWorkflowPage(): Promise<JSX.Element> {
  const token = (await getServerToken()) ?? '';
  if (!token) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Approval workflow</h1>
        <p className="mt-3 text-sm text-neutral-400">Not signed in.</p>
      </section>
    );
  }
  const result = await getApprovalWorkflow(token);
  if (isError(result)) {
    if (result.status === 401 || result.status === 403) {
      redirect('/map');
    }
    return (
      <section>
        <h1 className="text-2xl font-semibold">Approval workflow</h1>
        <div className="mt-3 rounded border border-red-700 bg-red-950 p-4 text-sm">
          {result.error}
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Approval workflow</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Default promotion-approval chain. Per-level overrides ship with F7-7a (the schema
          needs a new column).
        </p>
      </header>
      <ApprovalWorkflowForm initial={result.approvalWorkflowDefault} token={token} />
    </section>
  );
}
