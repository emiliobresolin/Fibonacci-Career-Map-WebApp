# Deferred Work

Tracks items from reviews that were intentionally deferred — not dismissed, not lost.

## Deferred from: code review of 1-2-nestjs-api-scaffold (2026-05-21)

- **HOST env var for explicit bind interface.** Currently `app.listen(port)` binds `0.0.0.0` implicitly. Defer until first runbook requires loopback-only binding or a security posture change. [apps/api/src/main.ts, apps/api/src/common/env.config.ts]
- **Global exception filter and global ValidationPipe.** Out of scaffold scope; belongs in a later API-hardening story when the first non-trivial controller lands.
- **Integration test asserting `@Global()` on CommonModule via injection from a feature module.** Defense-in-depth only; working as designed today. Add when the first feature module (post EPIC-2) lands.
- **Windows-specific SIGTERM handling for the worker process.** Production deploys Linux containers; address only if Windows-prod ever becomes a deploy target.
- **`pino-pretty` transport worker thread crash handler.** Low-probability path; defer until observability hardening (EPIC-16).
- **`getFreePort` TOCTOU race in the scaffold tests.** Acceptable race for scaffold tests; revisit if CI flake surfaces. Better long-term fix is to let the API bind to `:0` and read the actual port from the bootstrap log.
