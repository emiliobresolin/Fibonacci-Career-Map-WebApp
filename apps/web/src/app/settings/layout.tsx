import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

/**
 * Story 7-11 — Admin Settings layout (AC1).
 *
 * Provides a left nav across the configurable surfaces. Admin-redirect
 * (AC4) is enforced per-page since the dev token flow doesn't yet
 * expose `role` server-side (NextAuth session is scaffold-only); each
 * page checks the API's 403 response and renders an access-denied
 * panel, so a non-admin sees "Admin only" rather than the form.
 *
 * The nav links to the three surfaces shipped in 7-11; the five
 * tree-shaped surfaces (tracks/levels/layers/requirements/promotion-
 * rules) are deferred to F7-11a — see deferred-work.md.
 */
export default function SettingsLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mx-auto max-w-6xl p-6 grid grid-cols-[200px_1fr] gap-6">
      <nav aria-label="Admin Settings navigation" className="space-y-1 text-sm">
        <SettingsNavSection title="Configuration domain">
          <SettingsNavLink href="/settings/visibility">Visibility</SettingsNavLink>
          <SettingsNavLink href="/settings/approval-workflow">Approval workflow</SettingsNavLink>
          <SettingsNavLink href="/settings/promotion-mode">Rollout mode</SettingsNavLink>
        </SettingsNavSection>
        <SettingsNavSection title="Ops">
          <SettingsNavLink href="/settings/ops/dlq">DLQ admin</SettingsNavLink>
        </SettingsNavSection>
        <SettingsNavSection title="Coming soon (F7-11a)">
          <span className="block px-2 py-1 text-xs text-neutral-500">
            Tracks · Levels · Layers · Requirements · Promotion rules
          </span>
        </SettingsNavSection>
      </nav>
      <main className="min-w-0">{children}</main>
    </div>
  );
}

function SettingsNavSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="mb-4">
      <h2 className="px-2 py-1 text-xs uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </div>
  );
}

function SettingsNavLink({ href, children }: { href: string; children: ReactNode }): JSX.Element {
  return (
    <Link
      href={href}
      className="block rounded px-2 py-1 hover:bg-neutral-900 focus-visible:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      {children}
    </Link>
  );
}
