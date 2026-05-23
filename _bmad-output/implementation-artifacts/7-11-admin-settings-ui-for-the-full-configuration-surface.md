# Story 7.11: Admin Settings UI for the full configuration surface

Status: done (org-level surfaces shipped; tree surfaces deferred F7-11a)

## Story

As an **ADMIN**, I want to **read and update my org's three org-level configuration surfaces (visibility / approval workflow / rollout mode) from a dedicated admin UI**, so that **I don't have to drop to `curl` to operate them and have clear feedback when a change requires special handling (e.g. CALIBRATION → ACTIVE rationale)**.

## Acceptance Criteria

### Shipped in this story

1. `/settings` index + dedicated pages for **Visibility**, **Approval workflow**, **Rollout mode**. Each surface renders a radio form bound to the current org-level value, with a save button disabled until the selection differs from the committed state.
3. All forms are keyboard-navigable (native `<input type="radio">` semantics) and screen-reader labeled (`aria-describedby` for each option's help text; `aria-live="polite"` + `role="status"` on the save feedback line).
4. **AC4 enforced via `redirect('/map')`** — when the API returns 401/403 on the read, the page redirects via Next's `redirect()` rather than rendering a panel (reviewer BLOCKER B1 fix).

### Out of scope / deferred

- **F7-11a — tree surfaces (Tracks, Levels, Layers, Requirements, Promotion rules)**: API endpoints are live (Epics 7-1..7-5 + 7-9), UI shells deferred. The settings index nav and the index page both clearly mark the gap.
- **F7-11b — bearer-token-in-client-bundle security hardening**: the existing DLQ admin page (Story 4-5) ships the bearer token as a prop to client components — same pattern as the new settings forms. Reviewer flagged this as M1 (XSS exfiltration risk). The right fix is a server-action proxy that keeps the token server-side; that's a project-wide refactor including the DLQ admin and lands in a dedicated security-hardening story.

### AC2 (change-impact preview)

The original spec called for change-impact preview before save. For the **org-level surfaces shipped here** (visibility, approval workflow, rollout mode), the impact is "every employee in the org" by definition — the visibility form surfaces this as a static banner. Per-entity change-impact preview (E7.8) becomes meaningful when the tree surfaces ship (F7-11a) — that's where the "deactivating this track affects 42 employees" UX lives.

## Tasks / Subtasks

- [x] `apps/web/src/lib/settings-api.ts` shared fetchers (typed GET + PATCH for the three surfaces, structured `FetchResult<T>` with `status` for 401/403/etc).
- [x] `apps/web/src/lib/settings-auth.ts` server-side token retrieval (matches DLQ page pattern).
- [x] `apps/web/src/app/settings/layout.tsx` left nav + section structure; clearly marks F7-11a deferred section.
- [x] `apps/web/src/app/settings/page.tsx` index with surface cards.
- [x] `apps/web/src/app/settings/visibility/{page.tsx,visibility-form.tsx}` — radio form for 4 enum values, idempotent no-op detection, `router.refresh()` on save.
- [x] `apps/web/src/app/settings/approval-workflow/{page.tsx,approval-workflow-form.tsx}` — radio form for 3 enum values.
- [x] `apps/web/src/app/settings/promotion-mode/{page.tsx,promotion-mode-form.tsx}` — radio + rationale textarea, client-side ≥100-char gate for CALIBRATION → ACTIVE (API enforces independently as defense-in-depth), current-state card showing `changedAt` / `changedBy`.
- [x] `redirect('/map')` on 401/403 across all three pages (AC4 BLOCKER fix).
- [x] `router.refresh()` on PATCH success across all three forms (reviewer M2 fix — keeps server-rendered current-state card in sync).
- [x] `isError()` helper used consistently across all three forms (reviewer m6).
- [x] Typecheck clean (`pnpm --filter @fcm/web run typecheck`). API tests stay at 475 pass / 3 skip / 0 fail.

## Dev Notes

### Manual UI verification gap

**Per CLAUDE.md guidance: "if you can't test the UI, say so explicitly rather than claiming success."** This story ships React components against the API but I cannot open a browser in this environment to verify:

- Layout / contrast renders correctly in dark mode
- Tab order matches the visual reading order
- Focus indicators are visible on all interactive elements
- Screen-reader announcement timing for `aria-live="polite"` actually works
- Touch / pointer hit targets at mobile breakpoints

The static checks pass (typecheck clean, server/client component split correct, AC4 redirect goes through Next's `redirect()`). The next step is a manual QA pass before this surface is exposed to real admins.

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 1 BLOCKER / 2 MAJOR / 6 MINOR. Fixed:

- **BLOCKER B1**: AC4 said "redirect non-Admins to /map" but pages rendered an "Admin only" panel. **FIXED** — all three pages call `redirect('/map')` on 401/403.
- **MAJOR M2**: stale server state after PATCH (CurrentStateCard wouldn't update). **FIXED** — all three forms now call `router.refresh()` on success.
- **MINOR m6**: `'error' in result` ad-hoc check bypassed `isError`. **FIXED** — every callsite uses `isError(result)`.

Not changed (deliberate / registered as follow-up):

- **MAJOR M1** (bearer-token-in-client-bundle XSS risk): real concern but matches the existing DLQ admin precedent. Registered as **F7-11b**. Fix requires a server-action proxy that keeps the token server-side — out of scope for this story.
- **MINOR m1** (no tests): web package has no test infra. Next web story should pull in Vitest + RTL.
- **MINOR m2, m3, m4, m5**: cosmetic / a11y polish; manual UI pass will catch them.

### Architecture Compliance

- §4.2 — server components for data fetching, client components for stateful forms; matches the existing DLQ pattern.
- §10.3 — RBAC enforcement is server-side (every API endpoint is `@Roles('ADMIN')`); the UI redirect is a courtesy, not the security boundary.

### Dependencies

- E7.6 (visibility API), E7.7 (approval-workflow API), E7.10 (rollout-mode API) — all live.
- E7.1–E7.5 + E7.8 + E7.9 — tree-surface APIs exist; UI shells deferred F7-11a.

### References

- PRD FR-6.1–6.10
- Arch §4.2, §10.3, NFR-10.4, NFR-10.5
- DLQ precedent: [apps/web/src/app/settings/ops/dlq/page.tsx](apps/web/src/app/settings/ops/dlq/page.tsx)

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References
- `pnpm --filter @fcm/web run typecheck` → clean (`tsc --noEmit`)
- `pnpm test` → API suite still 475 pass / 3 skip / 0 fail (no API regressions)
- `pnpm --filter @fcm/web run lint` → blocked by pre-existing missing ESLint config (interactive prompt); not a 7-11 regression
- **Browser verification skipped** — see "Manual UI verification gap" above

### File List
Added
- `apps/web/src/lib/settings-api.ts`
- `apps/web/src/lib/settings-auth.ts`
- `apps/web/src/app/settings/layout.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/app/settings/visibility/page.tsx`
- `apps/web/src/app/settings/visibility/visibility-form.tsx`
- `apps/web/src/app/settings/approval-workflow/page.tsx`
- `apps/web/src/app/settings/approval-workflow/approval-workflow-form.tsx`
- `apps/web/src/app/settings/promotion-mode/page.tsx`
- `apps/web/src/app/settings/promotion-mode/promotion-mode-form.tsx`

Modified
- `_bmad-output/implementation-artifacts/deferred-work.md` — added F7-11a + F7-11b under the Epic-7 section
