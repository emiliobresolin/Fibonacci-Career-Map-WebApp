# Deferred Work

Tracks items from reviews that were intentionally deferred — not dismissed, not lost.

## Deferred from: code review of 1-2-nestjs-api-scaffold (2026-05-21)

- **HOST env var for explicit bind interface.** Currently `app.listen(port)` binds `0.0.0.0` implicitly. Defer until first runbook requires loopback-only binding or a security posture change. [apps/api/src/main.ts, apps/api/src/common/env.config.ts]
- **Global exception filter and global ValidationPipe.** Out of scaffold scope; belongs in a later API-hardening story when the first non-trivial controller lands.
- **Integration test asserting `@Global()` on CommonModule via injection from a feature module.** Defense-in-depth only; working as designed today. Add when the first feature module (post EPIC-2) lands.
- **Windows-specific SIGTERM handling for the worker process.** Production deploys Linux containers; address only if Windows-prod ever becomes a deploy target.
- **`pino-pretty` transport worker thread crash handler.** Low-probability path; defer until observability hardening (EPIC-16).
- **`getFreePort` TOCTOU race in the scaffold tests.** Acceptable race for scaffold tests; revisit if CI flake surfaces. Better long-term fix is to let the API bind to `:0` and read the actual port from the bootstrap log.

## Deferred from: code review of 1-3-nextjs-app-router-scaffold (2026-05-21)

- **Forced-colors-mode focus indicator for `DialogClose`.** Windows High Contrast accessibility. Defer until the accessibility hardening pass.
- **Real Zustand SSR + Context pattern with createStore.** Today's module-level singleton is safe because no Server Component reads from the store. Revisit when EPIC-2 introduces per-user state that needs server-side hydration.
- **Long-running Node SSR `browserQueryClient` lifecycle.** Not relevant to the standard App Router runtime; would matter if the edge runtime is ever used. Defer.
- **Tailwind dynamic-class safelist.** No runtime-built class names in scaffold; only relevant once 3D rendering builds class names from data (e.g., readiness opacity buckets).
