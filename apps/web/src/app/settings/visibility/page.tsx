import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getVisibility, isError } from '../../../lib/settings-api';
import { getServerToken } from '../../../lib/settings-auth';
import { VisibilityForm } from './visibility-form';

/**
 * Story 7-11 — /settings/visibility page.
 *
 * AC4 (reviewer BLOCKER B1 fix): non-admins are redirected to `/map`
 * via Next's `redirect()` rather than rendering an "Admin only" panel.
 * The API still returns 403 if the redirect somehow misfires.
 */
export default async function VisibilityPage(): Promise<JSX.Element> {
  const token = (await getServerToken()) ?? '';
  if (!token) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Visibility default</h1>
        <p className="mt-3 text-sm text-neutral-400">Not signed in.</p>
      </section>
    );
  }
  const result = await getVisibility(token);
  if (isError(result)) {
    if (result.status === 401 || result.status === 403) {
      redirect('/map');
    }
    return (
      <section>
        <h1 className="text-2xl font-semibold">Visibility default</h1>
        <div className="mt-3 rounded border border-red-700 bg-red-950 p-4 text-sm">
          {result.error}
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Visibility default</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Org-wide default for non-self employee data exposure. Drives the Map Data Contract
          (Epic 10) and the per-employee detail panel (Epic 12).
        </p>
      </header>
      <VisibilityForm initial={result.visibilityDefault} token={token} />
    </section>
  );
}
