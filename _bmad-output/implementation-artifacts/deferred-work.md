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

## Deferred from: code review of 1-7-observability-baseline (2026-05-21)

- **AsyncLocalStorage-based pino mixin** so domain logs (services, BullMQ workers, schedulers — not just HTTP entry/exit) get `user_id` and `organization_id` stamped. Today these fields are static `null` in `customProps`, which only runs at HTTP request entry. Stable field names exist from day one so log-aggregator dashboards built today work transparently when real values flow. EPIC-2 (auth) is the natural place to add this.
- **BullMQ instrumentation for OpenTelemetry.** `@opentelemetry/auto-instrumentations-node` doesn't cover BullMQ. Producer (`Queue.add`) and consumer (`Worker.process`) spans won't trace-link until a BullMQ instrumentation package is wired and `traceparent` is propagated through job payloads. Defer to EPIC-4 when BullMQ ships.
- **Supertest integration test for `/metrics` auth.** Scaffold tests assert wiring (`@UseGuards(MetricsBasicAuthGuard)` decorator, controller path); runtime proof of 401 vs 200 belongs in a dedicated integration-test pass with a live Nest app instance.
- **Sentry breadcrumb / console-capture tuning.** The v8 default integration set is fine for the scaffold; revisit when breadcrumb volume becomes a Sentry quota concern.

## Deferred from: code review of 2-1-identity-schema (2026-05-21)

- **Drop or properly-FK `organizations.promotion_mode_changed_by`.** Currently a UUID with no FK, no index, denormalized from `rollout_mode_transitions` (which itself lands in Story E7.10). The schema's bootstrap-circular-dependency justification is weaker than `DEFERRABLE INITIALLY DEFERRED` constraints would allow. Decide alongside E7.10: drop the cache and source-of-truth from the append-only history, or formalize as a real FK + index.
- **CI drift detection via `prisma migrate diff --exit-code`.** Stories 1-4 and 2-1 ship hand-written migrations; subsequent stories will use `prisma migrate dev`. A CI step that boots a throwaway Postgres, replays migrations via `prisma migrate deploy`, then runs `prisma migrate diff --from-schema-datamodel ... --to-schema-datasource $URL --exit-code` catches schema-vs-migration drift at PR time. Belongs in the CI pipeline expansion alongside other migration tests.
- **`User.externalId` (OIDC subject identifier) + email case-folding.** Email-as-identity is fragile (case sensitivity, IdP-side reassignments). Add an `externalId String?` column to `User` for the OIDC `sub` claim, and either lowercase email on write via Prisma middleware OR change the unique index to `LOWER(email)`. Natural fit for Story E2.2 (OIDC / SSO login).

## Deferred from: Epic-7 reviews (configuration domain, 2026-05-22)

- **F7-1a (Story 7-1 Career-Tracks CRUD)** — real-DB integration test for slug-collision 409 + RLS isolation. The API package still has no real-DB harness; add a single shared one as a side project rather than per-story. Unit-mocked tests cover the translation paths.
- **F7-2a (Story 7-2 Levels CRUD)** — real-DB integration test for AC5(a)/(b)/(c): boundary-touch create, overlap-emit-no-outbox, gap-tolerant update. Same harness gap as F7-1a.
- **F7-2b (Story 7-2 audit-helper duplication)** — **RESOLVED in Story 7-3**: lifted `emitConfigurationChanged` + `ConfigEntityType` to `apps/api/src/configuration/audit.ts`; career-tracks + levels services switched to the shared helper with byte-identical wire format.
- **F7-4a (Story 7-4 Requirements)** — migration adding `requirements_weight_max` (≤ 1000) + `requirements_expiry_months_max` (≤ 600) CHECK constraints. Service caps these today; DB-side enforcement matches the project's "DB is source of truth" pattern from 7-2.
- **F7-7a (Story 7-7 Approval Workflow per-level override)** — the original AC included `GET/PATCH /v1/levels/:id/approval-workflow` (nullable; null falls back to org default), but the schema has no `approval_workflow_override` column on `levels` / `promotion_rules`. Requires: (1) Prisma migration adding the column, (2) extending `OrgSettingsService` (or factoring a `LevelApprovalOverrideService`), (3) `LevelApprovalWorkflowController`. Controller-wiring test in 7-7 pins the absence of `getLevelOverride` / `updateLevelOverride` so a future maintainer can't add the surface without choosing where it lives.
- **F7-9a (Story 7-9 ConfigurationChanged outbox)** — real-DB integration test asserting AC3 (rollback leaves no outbox row) end-to-end through Prisma + Postgres. Currently unit-only via fake trapWrite.
- **F7-10a (Story 7-10 Rollout Mode tables + bootstrap snapshot)** — the original AC1 + AC2 specified dedicated tables: `rollout_mode_transitions` (append-only, RLS, CHECK rationale ≥ 100 for forward) and `bootstrap_eligibility_snapshots` (RLS, append-only, quarterly partitioned by `occurred_at`, unique `(transition_id, employee_id)`). 7-10 ships the transition surface + audit event in `audit_events`; the dedicated tables + the synchronous snapshot capture require Epic-9 scoring core for meaningful `score` / `readiness_pct` / `promotion_eligible` values — capturing zeros today would poison the historical view. Migration + snapshot capture lands once Epic-9 is in.
- **F7-11a (Story 7-11 tree-surface UI)** — the original AC1 named eight surfaces (Tracks, Levels, Layers, Requirements, Promotion Rules, Visibility, Approval Workflow, Rollout Mode). 7-11 ships the three org-level surfaces (visibility / approval workflow / rollout mode); the five tree-shaped surfaces are deferred. API endpoints are live today (Epics 7-1..7-5 + 7-9 outbox). Tree-surface UI will integrate change-impact preview (E7.8) per-entity as part of the save flow.
- **F7-11b (Story 7-11 bearer-token-in-client-bundle XSS risk)** — settings pages pass the bearer token from the server-component `getServerToken()` down to client-component forms as a prop, putting the token in `window.__NEXT_DATA__`. Matches existing DLQ admin precedent (Story 4-5), so this is a project-wide issue, not a 7-11 regression. Fix: refactor mutations to use a Next server action that keeps the token server-side and proxies the API call. Lands in a dedicated web security-hardening story.

## Deferred from: Story 8-2 review (evidence upload + finalize, 2026-05-23)

- **F8-2a (S3-layer content-length enforcement via presigned POST policy).** AC1 says "content-length-range bounded"; the presigned PUT URL returned today does NOT actually SigV4-sign Content-Length on the browser-PUT path (`@aws-sdk/s3-request-presigner` omits it from SignedHeaders for XHR/fetch compat), so S3 itself accepts any body size up to its 5 GiB single-PUT ceiling. Enforcement is at finalize: the DRAFT row pins the declared `size_bytes`, and `EvidenceFinalizeService` rejects with `CONTENT_LENGTH_MISMATCH` when the HEAD-reported size disagrees. To enforce at the S3 layer, switch to `@aws-sdk/s3-presigned-post.createPresignedPost` with `Conditions: [['content-length-range', min, max]]`. Lands when the browser upload UI ships and exercises the full upload flow end-to-end.
- **F8-2b (orphan DRAFT row + orphan S3 object GC).** A client that calls upload-slot but never finalizes leaves a DRAFT row + an (eventual) S3 object with no scoring impact. Per-actor active-DRAFT rate-limiting + a scheduled cron sweep to delete DRAFTs older than ~24h is the right shape. Defer until the production UI is wired and we can observe the actual orphan rate.
- **F8-2c (real-DB integration test for AC4 happy-path).** AC4 is covered today by an in-memory-fake integration test; the real-DB harness gap that already deferred F7-1a / F7-2a / F7-9a is the same gap here. Add a shared real-DB harness as a side project rather than per-story.

## Deferred from: Story 8-3 review (evidence retrieval RBAC, 2026-05-23)

- **F8-3a (per-byte audit via CloudTrail S3 access-log ingestion).** Today the `evidence.retrieved` audit row fires once per presigned-URL issuance, NOT per byte-level GET. A leaked URL within its 10-min TTL fetches bytes any number of times, leaving one audit row. True per-byte audit requires CloudTrail S3 access-log ingestion + a relay that maps S3 access events to internal audit rows. Lands with the production observability pass (Epic 16) — F8-3a is a security-posture follow-up, not a feature.
- **F8-3b (real-DB integration test for cross-org 404).** AC3 in the story is asserted via an in-memory-fake (`row = null` simulates the RLS miss). A real-DB test with the RLS GUC set to a different org and the row in org A would prove the 404 surface end-to-end. Same harness gap as F7-1a / F8-2c.
- **F8-3c (UUID_RE consolidation).** The UUID regex is duplicated across rls.helpers, evidence-key, evidence-upload, evidence-finalize, and evidence-download. Drift risk if someone tightens one but not the others. Lift to a shared `validation/uuid.ts` in a refactor pass.
