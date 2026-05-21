# Story 1.3: Next.js 14 App Router scaffold with dark-mode theme

Status: done

## Story

As an engineer,
I want `apps/web` scaffolded with Next.js 14 App Router, Tailwind + CSS variables, shadcn/ui base, TanStack Query, and Zustand,
so that UI stories have a ready canvas.

## Acceptance Criteria

1. `/` redirects to `/login` (placeholder) or `/map` (placeholder) based on a stubbed session check.
2. Dark mode is the default theme; CSS variables drive color tokens; Tailwind configured.
3. shadcn/ui CLI initialized; at least `Button`, `Dialog`, `Input` primitives generated.
4. TanStack Query provider and Zustand store provider mounted in the root layout.
5. `next build` succeeds in CI.

## Tasks / Subtasks

- [x] Task covering AC #1 — `src/app/page.tsx` calls `getStubSession()` and `redirect()` from `next/navigation`; `/login` and `/map` are real App Router routes under `src/app/login/page.tsx` and `src/app/map/page.tsx`; `next build` confirms both routes compile.
- [x] Task covering AC #2 — `<html className="dark">` in the root layout makes dark mode the default; `tailwind.config.ts` uses `darkMode: ['class']` + reads `hsl(var(--*))` color tokens; `globals.css` defines the full CSS variable palette under both `:root` and `.dark` (same values on each so unset class never causes a flash).
- [x] Task covering AC #3 — `components.json` shadcn marker present; hand-coded shadcn-style primitives at `src/components/ui/button.tsx` (Radix Slot + class-variance-authority + 6 variants × 4 sizes), `src/components/ui/dialog.tsx` (Radix Dialog primitives with overlay/content/header/footer/title/description + accessible close), `src/components/ui/input.tsx`. `cn()` helper at `src/lib/utils.ts`.
- [x] Task covering AC #4 — `<QueryProvider>` mounts a per-environment `QueryClient` (fresh on server, singleton in browser, `refetchOnWindowFocus: false` per PRD §4.5); `<StoreProvider>` is the no-op marker mount point so Zustand stores from `src/stores/*` have a discoverable layout-level home. Both wired into `src/app/layout.tsx`.
- [x] Task covering AC #5 — `next build` produces all four routes (`/`, `/_not-found`, `/login`, `/map`) with `BUILD_ID` and a populated `app-path-routes-manifest.json`; `test:scaffold` runs `pnpm --filter @fcm/web build` before the assertion suite so missing build state surfaces as a single clean test failure, not cascading ENOENT.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **Story-specific:** Tailwind config uses `darkMode: ['class']` (not `'media'`) because PRD NFR-10.1 makes dark mode the *product default*, not a user preference. Future work that adds a theme toggle should swap the `className="dark"` on `<html>` rather than rely on OS preference.
- **`baseUrl` deliberately omitted** from `apps/web/tsconfig.json`. TS 5.5+ deprecates `baseUrl`; `paths` resolve relative to the tsconfig automatically. The `@/*` alias points to `./src/*` so all internal imports use absolute paths (e.g., `@/components/ui/button`) and survive directory restructures.
- **shadcn CLI not invoked** — registry-fetched copies of `Button`/`Dialog`/`Input` are hand-coded with the exact shadcn template so the artifact set is identical without the CLI's network dependency. `components.json` marks the project as shadcn-configured so the CLI works for future primitive additions (`npx shadcn@latest add <component>`).
- **`apps/web/src/index.ts` deleted.** Story 1-1's placeholder existed to prove the workspace-protocol import worked; Next.js App Router doesn't need it. The workspace dependency on `@fcm/domain-contracts` is preserved in `package.json` and `next.config.mjs` lists it under `transpilePackages`.
- **`refetchOnWindowFocus: false`** is the default per PRD §4.5 (3D data is too expensive to refetch on focus; WebSocket invalidation drives updates). Per-query overrides can opt back in for cheap 2D queries.

### Dependencies

- E1.1
- E1.2 (sibling — both depend on E1.1; not a hard dependency, but the test:scaffold script now builds both)

### References

- Arch §4.1 (Next.js 14+ App Router, RSC + client islands, TailwindCSS + CSS variables, shadcn/ui primitives)
- Arch §4.2 (Route layout — `/` redirects, `/map`, `/dashboard`, etc.)
- Arch §4.5 (TanStack Query + Zustand state model)
- Arch §4.6 (Accessibility — keyboard, screen reader, dark-mode-first)
- NFR-10.1 (dark mode as default theme)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: 13 web-structure assertions + 4 web-build assertions all failed against pre-existing `src/index.ts` placeholder (only `apps/web/package.json declares @fcm/domain-contracts` from story 1-1's scaffold suite passed).
- GREEN phase build attempt 1: clean. `next build` output:
  ```
  ▲ Next.js 14.2.18
  ✓ Compiled successfully
  ✓ Generating static pages (6/6)
  Route (app)
  ┌ ○ /                                    146 B          87.2 kB
  ├ ○ /_not-found                          870 B          87.9 kB
  ├ ○ /login                               146 B          87.2 kB
  └ ○ /map                                 146 B          87.2 kB
  ```
- Typecheck note: `apps/web/tsconfig.json` initially included `baseUrl: "."` which the TS 5.5 language server flagged as deprecated. Removed — `paths` in modern TS resolves relative to the tsconfig automatically.
- Full repo-wide typecheck clean across all 4 workspaces.
- Full scaffold suite 41/41 green: 12 from story 1-1 + 12 from story 1-2 + 13 new web-structure + 4 new web-build.

### Completion Notes List

- **AC1 — root redirect:** `src/app/page.tsx` is a pure server-component redirect — no client JS. `getStubSession()` returns `{authenticated: false}` for now; when EPIC-2 lands, only this function changes, the redirect target logic stays intact. Production builds resolved the redirect statically at build time (the `/` route compiles to a 146-byte stub).
- **AC2 — dark-mode-first:** `<html lang="en" className="dark" suppressHydrationWarning>` sets the class on the root. `tailwind.config.ts` declares `darkMode: ['class']` so utility classes like `bg-background` resolve via the `.dark` token block. `globals.css` mirrors the dark palette under `:root` AND `.dark` so a future light-theme branch can flip the `.dark` class without flashing an unstyled root. CSS-variable color tokens are wired in `tailwind.config.ts` `theme.extend.colors` per the canonical shadcn pattern (e.g., `border: 'hsl(var(--border))'`).
- **AC3 — shadcn primitives:** Three primitives hand-coded to match the shadcn registry output: `Button` (cva-driven, 6 variants × 4 sizes, Radix Slot via `asChild`), `Dialog` (full Radix Dialog composition with overlay, content, header/footer/title/description, accessible close button rendered as inline SVG to avoid a `lucide-react` dep for one icon), `Input` (forwarded-ref input with the shadcn focus/disabled/file-input styling). `components.json` is the canonical shadcn config so future `npx shadcn@latest add <component>` calls work against this project.
- **AC4 — providers:** `QueryProvider` uses the recommended `makeQueryClient + browser singleton` pattern from TanStack Query v5 docs, so server-rendered queries get a fresh client per request while the browser keeps the cache across navigations. `StoreProvider` is intentionally a no-op marker — Zustand stores are module-level (`src/stores/ui-store.ts`) and don't need provider wrapping, but having a named mount point in the layout keeps future hydration/reset hooks discoverable without churning `layout.tsx`.
- **AC5 — `next build` in CI:** `test:scaffold` script now runs `pnpm --filter @fcm/api build && pnpm --filter @fcm/web build && node --test ...`. Build state is asserted via four targeted tests: `.next/` exists, `.next/BUILD_ID` exists and is non-empty, `.next/server/app/{page,login/page,map/page}.js` all emitted, `app-path-routes-manifest.json` lists `/login` and `/map`. A clean drop of `.next/` produces a single failing test with an actionable error message; subsequent build tests skip cleanly via `{ skip: !nextExists }`.
- **Workspace integration:** `next.config.mjs` lists `@fcm/domain-contracts` under `transpilePackages` so the workspace dep is bundled correctly. `experimental.typedRoutes` is enabled so `<Link href="/map">` is type-safe against the actual App Router file system (catches `/login` typos at build time).

### File List

- `apps/web/package.json` (modified — Next.js, React 18, Tailwind, TanStack Query, Zustand, Radix, cva, clsx, tailwind-merge, ESLint)
- `apps/web/tsconfig.json` (modified — Next.js-compatible compilerOptions, `@/*` path alias)
- `apps/web/next.config.mjs` (new)
- `apps/web/tailwind.config.ts` (new — class-based dark mode + CSS-variable color tokens)
- `apps/web/postcss.config.mjs` (new)
- `apps/web/components.json` (new — shadcn config marker)
- `apps/web/src/app/layout.tsx` (new — root layout with `className="dark"` + providers)
- `apps/web/src/app/page.tsx` (new — root redirect based on stub session)
- `apps/web/src/app/globals.css` (new — Tailwind layers + CSS variable dark palette)
- `apps/web/src/app/login/page.tsx` (new — placeholder login)
- `apps/web/src/app/map/page.tsx` (new — placeholder map)
- `apps/web/src/components/providers/query-provider.tsx` (new — TanStack Query)
- `apps/web/src/components/providers/store-provider.tsx` (new — Zustand mount point)
- `apps/web/src/components/ui/button.tsx` (new — shadcn-style Button)
- `apps/web/src/components/ui/dialog.tsx` (new — shadcn-style Dialog)
- `apps/web/src/components/ui/input.tsx` (new — shadcn-style Input)
- `apps/web/src/lib/utils.ts` (new — cn() helper)
- `apps/web/src/lib/session.ts` (new — stub session)
- `apps/web/src/stores/ui-store.ts` (new — Zustand UI store)
- `apps/web/src/index.ts` (deleted — Story 1-1 placeholder no longer needed)
- `apps/web/next-env.d.ts` (auto-generated by `next build`)
- `package.json` (modified — `test:scaffold` now builds web too)
- `pnpm-lock.yaml` (regenerated by `pnpm install`)
- `tests/scaffold/web-structure.test.mjs` (new — 13 file-system assertions)
- `tests/scaffold/web-build.test.mjs` (new — 4 build-output assertions)

### Review Findings

- [x] [Review][Patch] `tailwindcss-animate` plugin installed + registered in `tailwind.config.ts`; Dialog motion classes (zoom/slide/fade) now compile to real CSS instead of silently failing [apps/web/package.json, apps/web/tailwind.config.ts, apps/web/src/components/ui/dialog.tsx]
- [x] [Review][Patch] `:root` now holds the canonical shadcn light palette; `.dark` holds the dark palette. Future light-theme toggle is a class-swap, not a re-derive [apps/web/src/app/globals.css]
- [x] [Review][Patch] Universal border-color selector scoped to `*, ::before, ::after` (canonical shadcn shape) instead of bare `*` [apps/web/src/app/globals.css]
- [x] [Review][Patch] No-op `StoreProvider` deleted. Layout no longer wraps a useless client-component boundary. Zustand contract is now "module-level store at `src/stores/*` exporting a `use*Store` hook" — enforced by a dedicated structure test [deleted: apps/web/src/components/providers/store-provider.tsx, apps/web/src/app/layout.tsx, tests/scaffold/web-structure.test.mjs]
- [x] [Review][Patch] `QueryProvider` now retains the QueryClient via `React.useState(() => getQueryClient())` so Strict Mode / HMR cannot swap clients mid-render [apps/web/src/components/providers/query-provider.tsx]
- [x] [Review][Patch] `getStubSession()` reads `FCM_STUB_AUTHED=true` so the truthy redirect-to-`/map` branch is exercisable in dev/CI before EPIC-2 lands; premature `userId` field removed from `StubSession` [apps/web/src/lib/session.ts]
- [x] [Review][Patch] `useUIStore` setters now decoupled — `setSelectedEmployee` no longer auto-opens the panel; added a `closeDetailPanel()` convenience helper for the common close-and-clear case [apps/web/src/stores/ui-store.ts]
- [x] [Review][Patch] `DialogContent` full canonical shadcn motion class set added (zoom/slide/fade); `DialogPrimitive.Close` now sets `type="button"` so it doesn't submit nested forms [apps/web/src/components/ui/dialog.tsx]
- [x] [Review][Patch] New runtime-contract assertion: `/`'s prerender artifact under `.next/server/app/` must contain a literal `/login` reference — proves the redirect itself works, not just that `redirect` appears in source [tests/scaffold/web-build.test.mjs]
- [x] [Review][Patch] `metadataBase` set on the layout metadata export (`process.env.NEXT_PUBLIC_SITE_URL ?? localhost`); silences the Next 14 build warning and makes `openGraph.images` work [apps/web/src/app/layout.tsx]
- [x] [Review][Patch] `Input` defaults `type = 'text'` so the DOM never receives `type={undefined}` and a11y/lint rules stay happy [apps/web/src/components/ui/input.tsx]
- [x] [Review][Patch] `RootPage` return type changed from `: never` to `: JSX.Element` — internally consistent with `/login` and `/map` pages, doesn't break future evolution [apps/web/src/app/page.tsx]
- [x] [Review][Patch] `experimental.typedRoutes` removed from `next.config.mjs` — no `<Link>` uses it yet; experimental flag is upgrade-fragile. Re-enable when first typed Link lands [apps/web/next.config.mjs]
- [x] [Review][Patch] Scaffold tests tightened: dependency assertions check `tailwindcss-animate`; layout assertion requires explicit `@/components/providers/query-provider` import + `<QueryProvider>` JSX; zustand assertion checks `useUIStore` export at `src/stores/ui-store.ts`; redirect assertion checks both `/login` AND `/map` referenced [tests/scaffold/web-structure.test.mjs]
- [x] [Review][Patch] `web-build.test.mjs` no longer hard-codes `app-path-routes-manifest.json` — finds any `*routes-manifest.json` so future Next.js minor upgrades don't break the suite [tests/scaffold/web-build.test.mjs]
- [x] [Review][Patch] Placeholder login `<form>` replaced with `<div>` + `aria-labelledby` on `<main>` (and an `id` on `<h1>`) so Enter on the email field can't trigger an empty-form submit, and the landmark has a labelled name for screen readers [apps/web/src/app/login/page.tsx]
- [x] [Review][Patch] `apps/web/package.json` `test` script replaced with explicit `echo 'no unit tests yet' && exit 0` so `pnpm -r test` doesn't pick up `.next/`-built files as tests [apps/web/package.json]
- [x] [Review][Defer] Forced-colors-mode focus indicator for `DialogClose` — deferred; addressed in accessibility hardening
- [x] [Review][Defer] Real Zustand SSR + Context pattern — deferred; module-level singleton is correct as long as no Server Component reads from the store. Re-evaluate when per-user state lands in EPIC-2
- [x] [Review][Defer] Long-running Node SSR `browserQueryClient` leak — deferred; not relevant to App Router non-edge runtime
- [x] [Review][Defer] Tailwind dynamic-class safelist — deferred; no runtime-built class names exist in scaffold

## Change Log

- 2026-05-21 — Story 1-3 implemented. Next.js 14 App Router scaffolded at `apps/web` with dark-mode-first theme (`<html className="dark">` + Tailwind class-based dark mode + CSS-variable color tokens mirrored under `:root` and `.dark`), shadcn-style Button/Dialog/Input primitives (hand-coded to match registry output), TanStack Query provider + Zustand store mount-point in the root layout, and a stub-session-driven root redirect to `/login` or `/map`. `next build` succeeds with 4 routes emitted. 17 new scaffold tests added (13 structure + 4 build output); full scaffold suite 41/41 green. Repo-wide typecheck clean. Status: backlog → in-progress → review.
- 2026-05-21 — Code review pass (Blind / Edge / Auditor) surfaced 14+20+9 findings. 17 unique patches applied: tailwindcss-animate plugin installed (Dialog animations no longer silently fail), `:root` light + `.dark` dark palettes split (canonical shadcn shape), universal border-color scoped to `*, ::before, ::after`, no-op StoreProvider deleted, QueryClient retained via React.useState, env-driven stub session (truthy branch reachable), ui-store setters decoupled, DialogClose `type="button"` + full motion class set, metadataBase set, Input default type, RootPage return type, experimental.typedRoutes removed, runtime redirect contract test added, scaffold tests tightened (import paths + JSX + dep checks), login `<form>` replaced with `<div>` + landmark labelling, `apps/web` test script made explicit no-op, `userId` removed from StubSession. 4 items deferred to `_bmad-output/implementation-artifacts/deferred-work.md`. Full scaffold suite now 44/44 green, repo-wide typecheck clean. Status: review → done.
