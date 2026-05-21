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

## Deferred from: code review of 1-4-prisma-schema-baseline-and-migration-tooling (2026-05-21)

- **CI workflow file that invokes `prisma:migrate:deploy`.** Story 1-4 ships the script surface; Story 1-6 (Kubernetes / CI manifests) owns the orchestration. AC2 of Story 1-4 covers the *script* readiness, not the pipeline itself.
- **ESLint `no-restricted-imports` rule banning direct `@prisma/client` imports.** AC3 ("single exported module") is honor-system today. Add a project-wide ESLint config in a dedicated linting story.
- **`connection_limit` / `pool_timeout` query params on production DATABASE_URL.** Documented in `.env.example` but not enforced. Revisit during production prep when actual pod count + Postgres `max_connections` are known.
- **Shadow database for `prisma migrate dev` against managed Postgres.** Add `SHADOW_DATABASE_URL` when the first dev uses a managed Postgres without `CREATEDB` privilege.
- **PrismaService unit tests** (lifecycle warn path + onModuleDestroy). First real DB-touching domain module (EPIC-2) lands with integration tests that cover the service end-to-end; isolated unit tests are lower priority.
- **Prisma 6 upgrade.** 5.22.0 is the stable 5.x release. Revisit once 6.x has been GA for a quarter.
- **`DATABASE_URL` redaction in pino error logs.** Pino's redaction paths land in EPIC-1.7 (observability baseline).
- **Pre-merge bot for migration timestamp ordering.** Process concern; address via CODEOWNERS + branch policy when CI lands (Story 1-6).

## Deferred from: code review of 1-5-terraform-infrastructure (2026-05-21)

- **Dedicated `modules/network/` (VPC + private subnets + app-tier / database-tier security groups).** Today's modules fall back to the default VPC's default SG when subnet/SG variables are unset. Acceptable for smoke-test bring-up only; before real data lands a network module must ship.
- **Customer-managed KMS keys (CMK) for Postgres / Redis / S3.** Today's encryption-at-rest uses AWS-managed default keys (still encrypted, but scope is per-account, not per-app). A security-hardening story should provision per-env CMKs with rotation + scoped key policies.
- **Secrets Manager rotation Lambda for Postgres master password.** Out-of-scope per Story 1-5. Module `lifecycle.ignore_changes = [password]` already ensures Terraform won't revert future rotations once the Lambda is wired.
- **Per-secret `aws_secretsmanager_secret` resources** (vs. today's `for_each` map). Refactor when the secret list grows past 5–6 entries or when any value needs distinct rotation policy.
- **Structured CI plan-diff output (`terraform show -json | jq`).** Wires in Story 1-6 when the GitHub Actions workflow lands.
- **State-bucket CMK + deny-all default bucket policy.** Today's bootstrap creates the state bucket with SSE-S3 + versioning. The runbook documents the policy shape and required principals; a dedicated hardening story should make it concrete and apply it via Terraform itself.
- **Tight Terraform provider version pin (e.g. `= 5.60.0` exact for prod, vs today's `~> 5.60`).** Revisit if provider-minor drift causes plan instability across operators.
- **S3 server access logging wired in staging/prod.** Module supports it via `access_log_bucket`; defer until the log-bucket provisioning module lands.
