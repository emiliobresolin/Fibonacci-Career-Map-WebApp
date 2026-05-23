import Link from 'next/link';
import type { JSX } from 'react';

/**
 * Story 7-11 — /settings index page. Lists the configurable surfaces
 * with one-line descriptions, with the deferred-as-F7-11a tree
 * surfaces marked clearly.
 */
export default function SettingsIndexPage(): JSX.Element {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Configure org-level visibility, approval workflow, and rollout mode. Tree-shaped
          configuration (tracks, levels, layers, requirements, promotion rules) ships in a
          subsequent story (F7-11a) — the API endpoints are live today (Epic 7).
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SurfaceCard
          href="/settings/visibility"
          title="Visibility default"
          description="Org-wide default for non-self employee data exposure: OWN_ONLY / TEAM / ORG_SUMMARY / ORG_FULL. Drives the Map Data Contract (Epic 10)."
        />
        <SurfaceCard
          href="/settings/approval-workflow"
          title="Approval workflow"
          description="Default promotion-approval chain: SINGLE / DUAL_MANAGER / HR_GATE. Per-level overrides land with F7-7a."
        />
        <SurfaceCard
          href="/settings/promotion-mode"
          title="Rollout mode"
          description="CALIBRATION while the org tunes thresholds; flip to ACTIVE to expose eligibility. Forward transition requires rationale ≥ 100 chars."
        />
      </div>
    </section>
  );
}

function SurfaceCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <Link
      href={href}
      className="block rounded border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-700 focus-visible:border-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm text-neutral-400">{description}</p>
    </Link>
  );
}
