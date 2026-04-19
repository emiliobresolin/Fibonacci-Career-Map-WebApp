---
title: "Stories Breakdown: Fibonacci Career Map (FCM)"
status: "draft"
version: "1.0"
created: "2026-04-19"
updated: "2026-04-19"
workflowType: "epics-and-stories"
project_name: "FCM"
user_name: "Emilio"
pm_agent: "John"
scope: "Implementation-ready stories organized under the approved E1–E16 epic list"
inputDocuments:
  - "_bmad-output/planning-artifacts/product-brief-FCM.md"
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/epics.md"
---

# Stories Breakdown: Fibonacci Career Map (FCM)

**Version:** 1.0 — MVP Stories
**Status:** Draft — Ready for Implementation Planning
**Date:** 2026-04-19

---

## 0. How to read this document

- **This file is the planning-layer INDEX.** It is the human-reviewable catalog of every story, organized by epic, with dependency and reference trails.
- **Per-story implementation files live under `_bmad-output/implementation-artifacts/`**, one file per story using the BMAD story template (`Status`, `Story`, `Acceptance Criteria`, `Tasks / Subtasks`, `Dev Notes`, `Dev Agent Record`). Filename convention: `{epic}-{story}-{kebab-title}.md`. Sprint lifecycle state is tracked in `implementation-artifacts/sprint-status.yaml`.
- **Regenerate** the sharded files from this index with `python _bmad-output/implementation-artifacts/.shard-tool/shard_stories.py`. The shard tool is idempotent; editing this file and re-running will reproduce all 120 story files consistently.
- Every story lives under its approved epic (E1–E16) and inherits the epic's scope, architectural commitments, and dependencies.
- Stories are listed in intended build order within each epic. Cross-epic dependencies are called out in each story's **Depends on** line.
- "Refs" point back to PRD FR-IDs and/or architecture sections so reviewers can trace each story to the decisions it implements.
- Acceptance criteria are intentionally outcome-based. Story-level technical notes (the exact file layout, library choice beyond what the architecture fixes, etc.) are the dev agent's job at pull time.
- Stories intentionally preserve: the 3D-first product direction, the Score Progress / Readiness % / Promotion Eligibility distinction, deterministic asynchronous recalculation, auditability, explainability, RBAC, org-scoped behavior, Manager Recommendation / Performance Narrative as a mandatory human act, HR operational role (Calibration Queue / Calibration Flag / Rollout Mode / Bootstrap Snapshot), enterprise-safe map anonymization, Fibonacci's structural role, and the organizational-rollout / calibration safety model.

**Corrections applied during story breakdown:** none. The epic set is self-consistent with the PRD and architecture; no gap required new scope.

---

## EPIC-1 — Platform & Operational Foundations

### STORY-E1.1 — Monorepo workspace scaffold
As an engineer, I want a monorepo workspace matching architecture §18 so every subsequent story lands in the correct location.

AC:
- Root workspace (`apps/web`, `apps/api`, `packages/domain-contracts`, `packages/scoring-core`, `infra/`, `docs/`) exists with a shared package-manager workspace manifest.
- `tsconfig.base.json` enforces TypeScript strict mode and is extended by every workspace.
- Internal packages are resolvable via workspace protocol in `apps/web` and `apps/api`.
- Repo-root `README.md` documents workspace layout and dev/build commands.

Depends on: none. Refs: Arch §18; AG1, AG7.

### STORY-E1.2 — NestJS API scaffold with dual-mode bootstrap
As an engineer, I want `apps/api` to boot either as an HTTP API or as a BullMQ worker from the same codebase so production runs one artifact in two process modes.

AC:
- `apps/api` starts under `API_MODE=api` exposing a placeholder `GET /healthz` returning `{status:"ok"}`.
- Same process starts under `API_MODE=worker` initializing NestJS without binding an HTTP port, logging "worker-mode ready".
- NestJS `CommonModule` provides a shared pino logger and configuration module wired from environment variables.
- Mode is selected through a single bootstrap entrypoint; no code duplication between modes.

Depends on: E1.1. Refs: Arch §3.2; AD-1.

### STORY-E1.3 — Next.js 14 App Router scaffold with dark-mode theme
As an engineer, I want `apps/web` scaffolded with Next.js 14 App Router, Tailwind + CSS variables, shadcn/ui base, TanStack Query, and Zustand so UI stories have a ready canvas.

AC:
- `/` redirects to `/login` (placeholder) or `/map` (placeholder) based on a stubbed session check.
- Dark mode is the default theme; CSS variables drive color tokens; Tailwind configured.
- shadcn/ui CLI initialized; at least `Button`, `Dialog`, `Input` primitives generated.
- TanStack Query provider and Zustand store provider mounted in the root layout.
- `next build` succeeds in CI.

Depends on: E1.1. Refs: Arch §4.1, §4.5; NFR-10.1.

### STORY-E1.4 — Prisma schema baseline and migration tooling
As an engineer, I want a Prisma baseline wired into `apps/api` and a migration pipeline integrated into CI so later stories add tables safely.

AC:
- `apps/api/prisma/schema.prisma` exists with provider `postgresql` and a single placeholder model (`_MigrationProbe`) to validate migration flow.
- `prisma migrate dev` runs locally against a dev Postgres; `prisma migrate deploy` runs as a dedicated CI job against staging.
- Generated Prisma client is imported from a single exported module inside the API.
- Database URL is loaded from secrets (never committed); `.env.example` documents the variable.

Depends on: E1.2. Refs: Arch §6.5, §12.4; AD-8.

### STORY-E1.5 — Managed Postgres, Redis, and object storage provisioned via Terraform
As an operator, I want managed Postgres 15+, Redis 7+, and S3-compatible storage provisioned across dev/staging/prod via Terraform so environments are reproducible.

AC:
- `infra/terraform/` defines modules for Postgres, Redis, and object storage; per-env tfvars.
- Applying the dev workspace produces reachable endpoints whose connection strings are stored in the cloud secret manager.
- Each environment is separately statefiled (no shared tfstate) and documented in `docs/ops/infrastructure.md`.
- Terraform `plan` runs in CI against PRs touching `infra/terraform/`.

Depends on: E1.1. Refs: Arch §12.1, §12.3; AG7.

### STORY-E1.6 — Containerization and Kubernetes deployment manifests for API and worker
As an operator, I want container images for `fcm-api` and `fcm-worker` and Kubernetes manifests with HPA and ingress so the system can deploy to dev/staging/prod.

AC:
- Multi-stage Dockerfile produces a single image capable of running in API or worker mode via env.
- `infra/k8s/` ships manifests for Deployments (API, worker), Services, Ingress, HPA (API + worker scale independently), and ConfigMap/Secret references.
- CI builds and pushes images tagged with commit SHA on merge to main.
- `kubectl apply` against the dev cluster deploys a reachable `GET /healthz` through ingress.

Depends on: E1.2, E1.5. Refs: Arch §12.2; AD-10.

### STORY-E1.7 — Observability baseline (pino logs, Prometheus metrics, OpenTelemetry, Sentry)
As an operator, I want structured logs, Prometheus metrics, OTEL traces, and Sentry error tracking from the first deploy so later stories only need to emit domain signals.

AC:
- All Node processes emit pino JSON logs including `correlation_id`, `user_id` (nullable), `organization_id` (nullable), `module`.
- `/metrics` endpoint on the API exposes default Prometheus metrics; endpoint is auth-gated (basic-auth secret from secrets manager).
- OpenTelemetry SDK initialized in both API and worker modes; OTLP exporter endpoint configured per env.
- Sentry DSN configured for `apps/web` browser bundle and `apps/api` Node process; a forced test exception in staging appears in Sentry.

Depends on: E1.2, E1.3. Refs: Arch §11.1–§11.4; NFR-6.1–6.3; AD-12.

### STORY-E1.8 — Health probes and worker heartbeat
As an operator, I want liveness/readiness probes on the API and a heartbeat on the worker so Kubernetes can route traffic safely.

AC:
- `GET /healthz` returns 200 when the process is up.
- `GET /readyz` returns 200 only when Postgres, Redis, and OIDC discovery document are all reachable; returns 503 otherwise with a structured body naming the failing dependency.
- Worker process publishes a BullMQ heartbeat event every 30 s; absence for 2 min raises a Prometheus alert (alert definition lands in E16 but the metric is emitted here).
- Probes are wired into the Kubernetes manifests from E1.6.

Depends on: E1.6, E1.7. Refs: Arch §11.7.

### STORY-E1.9 — Secrets management wiring
As an engineer, I want every secret loaded from the cloud secret manager at runtime so no secret ever appears in code, images, or env files.

AC:
- API and worker bootstrap reads secrets from the configured secret manager (AWS Secrets Manager / GCP Secret Manager / Azure Key Vault) through a provider-neutral interface.
- `.env.example` documents only non-secret configuration; a CI secret-scanning step fails the build if a committed file contains a credential pattern.
- Rotation of a secret in the secret manager is picked up by the next pod restart without code changes.
- `docs/ops/secrets.md` documents the secret inventory.

Depends on: E1.5. Refs: Arch §12.6; NFR-4.7.

---

## EPIC-2 — Identity, SSO, Tenancy & RBAC Backbone

### STORY-E2.1 — Identity schema: users, organizations, role_assignments
As an engineer, I want the identity schema in Prisma so authentication and RBAC have a data model.

AC:
- Migration creates `organizations` (slug, name, OIDC config JSONB, `visibility_default`, `approval_workflow_default`, `promotion_mode` enum default `CALIBRATION`, `promotion_mode_changed_at`, `promotion_mode_changed_by`), `users` (email, display_name, FK to `organizations`), and `role_assignments` (`user_id`, `organization_id`, `role` enum EMPLOYEE/MANAGER/ADMIN) with a unique constraint on `(user_id, organization_id, role)`.
- All tables carry `organization_id NOT NULL` where applicable and are indexed on it.
- A seed script creates one dev organization, one ADMIN user, and one EMPLOYEE user for local development only.

Depends on: E1.4. Refs: Arch §6.2, §10.2; FR-1.4.

### STORY-E2.2 — OIDC/SSO login via openid-client and NextAuth session
As a user, I want to log in through my organization's identity provider so I can use FCM without a password.

AC:
- `apps/api` exposes OIDC callback endpoints using `openid-client`; discovery document is loaded from per-org config.
- `apps/web` uses NextAuth.js configured with a custom credentials/OIDC adapter that hands off to the API.
- Successful authentication sets an HTTP-only, Secure, SameSite=Lax session cookie; session has 24 h expiry and 2 h idle timeout.
- The API issues a short-lived (15 min) JWT bearer token used for subsequent API calls; refresh happens through a secure server-side web endpoint.

Depends on: E2.1. Refs: Arch §10.1; FR-1.1, FR-1.5; AD-11.

### STORY-E2.3 — Redis-backed server-side session store with forced-logout
As an admin, I want server-side session storage so I can revoke sessions when required.

AC:
- Active sessions are indexed in Redis by `(organization_id, user_id)` with the session JWT jti.
- An admin-only endpoint `POST /auth/sessions/:user_id/revoke` deletes all sessions for that user; subsequent API calls by that user return 401.
- Session tokens expire at 24 h absolute; idle > 2 h triggers re-auth.
- Revocation events emit an audit event via the outbox (see E3).

Depends on: E2.2, E3.3. Refs: Arch §10.1; FR-1.5.

### STORY-E2.4 — Layer 1 AuthGuard, @Roles decorator, CORS lock-down
As an engineer, I want a global AuthGuard and a `@Roles(...)` decorator so every endpoint enforces role checks by default.

AC:
- Global NestJS `AuthGuard` validates the JWT, rejects unauthenticated requests with 401, and populates `request.user = { user_id, organization_id, role }`.
- A `@Roles('ADMIN' | 'MANAGER' | 'EMPLOYEE')` decorator restricts routes; unmatched role returns 403 with a structured error body.
- CORS allow-list is loaded from configuration; requests from unlisted origins are rejected.
- An integration test asserts 401 on missing token, 403 on role mismatch, and 200 on matched role.

Depends on: E2.2. Refs: Arch §10.3 Layer 1; FR-1.3.

### STORY-E2.5 — Layer 2 ActorContext propagation and self-approval guard primitive
As a backend developer, I want every domain service method to receive an `ActorContext` and a reusable self-approval guard so business-level authorization is explicit and testable.

AC:
- A `ServiceContext` module provides an `ActorContext` object (`{ user_id, organization_id, role, display_name }`) available in REST handlers, WebSocket handlers, and BullMQ job payloads.
- A `SelfApprovalGuard.ensureNotSelf(actor, subjectUserId)` primitive throws `SelfApprovalNotAllowedError` when `actor.user_id === subjectUserId`.
- An example service method consumes `ActorContext` and calls the guard; a failing and a passing unit test cover both outcomes.

Depends on: E2.4. Refs: Arch §10.3 Layer 2; PRD §9.2.

### STORY-E2.6 — Layer 3 Postgres Row-Level Security policies with per-request org scoping
As a platform engineer, I want Row-Level Security on every tenant-scoped table so a cross-org read never succeeds even if the app forgets to scope.

AC:
- A Prisma migration enables RLS on every tenant-scoped table with a policy `USING (organization_id = current_setting('app.current_org_id')::uuid)`.
- Request and job lifecycles set `app.current_org_id` from `ActorContext` and reset on completion.
- A cross-org integration test seeds two orgs and asserts a read using org-A's context cannot return org-B rows.
- A smoke test asserts setting `app.current_org_id` to a non-UUID returns a structured error, not a crash.

Depends on: E2.1, E2.5. Refs: Arch §10.3 Layer 3, §10.4; AR-4; NFR-4.4.

### STORY-E2.7 — Bootstrap admin fallback credentials and OIDC-outage recovery codes
As a first-time administrator, I want a username/password fallback and emergency recovery codes so I can bootstrap FCM before OIDC is configured and recover from an IdP outage.

AC:
- First-run bootstrap creates one ADMIN with a bcrypt-hashed username/password; credentials are surfaced once via secure channel and never logged.
- Once the first OIDC-linked ADMIN exists, username/password login is disabled automatically; a migration flag tracks this.
- On org bootstrap, the system generates 10 single-use OIDC-outage recovery codes bound to Admins only; code redemption is audited and a code self-burns on use.
- A runbook stub in `docs/ops/runbooks/oidc-outage.md` documents the recovery procedure.

Depends on: E2.2, E3.3. Refs: PRD FR-1.2; Arch §10.1, AR-6.

---

## EPIC-3 — Audit Spine & Outbox/Event Infrastructure

### STORY-E3.1 — `audit_events` table, monthly partitioning, and append-only DB enforcement
As a compliance engineer, I want an append-only partitioned audit log so every mutation leaves a tamper-resistant record.

AC:
- Migration creates `audit_events` (organization_id, actor_id, event_type, entity_type, entity_id, before JSONB, after JSONB, reason TEXT, occurred_at TIMESTAMPTZ) partitioned by `RANGE (occurred_at)` monthly; 3 months of partitions pre-created.
- GIN indexes on `before` and `after`; B-tree on `(organization_id, occurred_at)` and `(entity_type, entity_id, occurred_at)`.
- App DB role has `INSERT` only; `UPDATE` and `DELETE` are revoked. A BEFORE UPDATE/DELETE trigger raises an exception as defense-in-depth.
- An integration test asserts an attempted UPDATE or DELETE from the app role fails.

Depends on: E1.4, E2.1. Refs: Arch §6.4, §9.3; AD-7; NFR-5.1, NFR-5.2.

### STORY-E3.2 — `outbox_events` table and post-commit LISTEN/NOTIFY trigger
As a backend engineer, I want an outbox table and a post-commit notification so the relay worker can discover new events without polling.

AC:
- Migration creates `outbox_events` (event_id UUID PK, organization_id, aggregate_type, aggregate_id, event_type, payload JSONB, created_at, published_at nullable).
- An AFTER INSERT trigger on `outbox_events` calls `pg_notify('outbox_new', event_id)`.
- Index on `(published_at NULLS FIRST, created_at)` for the relay to batch unpublished rows.
- A sample write in a transaction demonstrates the trigger fires on commit and not on rollback.

Depends on: E3.1. Refs: Arch §9.3.

### STORY-E3.3 — Outbox relay worker (`audit.outbox-relay`)
As a system, I want a worker that reads unpublished outbox rows and fans them out to audit, jobs, and realtime with at-least-once semantics.

AC:
- BullMQ queue `audit.outbox-relay` exists; consumer listens to Postgres `LISTEN outbox_new` and enqueues relay jobs.
- For each unpublished row, the worker writes to `audit_events`, enqueues any downstream jobs declared in the payload, publishes the realtime event via Redis pub/sub, and marks `published_at = NOW()`.
- Consumers are idempotent: a duplicate `event_id` delivered twice does not produce duplicate audit writes or double side-effects.
- DLQ routing and a Prometheus `fcm_outbox_relay_depth` gauge are wired; a depth > 0 for > 5 minutes alerts (alert rule defined in E16 but metric emitted here).

Depends on: E3.2, E4.1. Refs: Arch §9.3, §11.2; AD-7; AR-3.

### STORY-E3.4 — Event-type taxonomy and AuditEvent payload contract in `domain-contracts`
As a developer, I want formal TypeScript types for every audit event so emitters and consumers agree on shape.

AC:
- `packages/domain-contracts/events/` defines discriminated-union types covering every event listed in PRD §10.1 (evidence, score, configuration, promotion, role, visibility, approval-workflow).
- Each event type includes `event_id`, `occurred_at`, `actor_id`, `organization_id`, `entity_type`, `entity_id`, and event-specific `before`/`after`/`reason` fields.
- A shared Zod (or equivalent) validator matches each type; runtime validation runs in the relay worker before persisting.
- Unit tests assert round-trip encode/decode and reject malformed payloads.

Depends on: E3.3. Refs: Arch §5.1 audit module; PRD §10.1.

### STORY-E3.5 — Role-scoped audit read API and CSV export endpoint skeleton
As Admin/HR, I want to query the audit log so I can investigate contested decisions.

AC:
- `GET /v1/audit-events` accepts `actor_id`, `event_type`, `entity_type`, `entity_id`, `occurred_at` range; returns cursor-paginated results scoped to the actor's role (own / team / all).
- `GET /v1/audit-events/export` streams a CSV with the same filters applied; runs behind the same RBAC.
- An EMPLOYEE calling the endpoint receives only events where they are the actor or the target; MANAGER sees team-scoped; ADMIN sees all.
- Integration tests cover the three role scopes and assert no cross-org leakage.

Depends on: E3.4. Refs: PRD FR-8.4, FR-8.5, FR-8.6, FR-8.7. PDF export belongs to E15 where the UI lives.

### STORY-E3.6 — Audit partition maintenance scheduled job
As an operator, I want partitions for `audit_events` created ahead of time so inserts never fail on a missing partition.

AC:
- A cron job (weekly) ensures that monthly partitions for the next 3 months exist; creates any missing partitions.
- The job is idempotent: repeated runs do not produce errors.
- Metric `fcm_audit_partition_lookahead_months` exported; runbook stub in `docs/ops/runbooks/audit-partition.md`.

Depends on: E3.1, E4.2. Refs: Arch §6.4; AR-8.

---

## EPIC-4 — Async Job Infrastructure (BullMQ)

### STORY-E4.1 — BullMQ module, worker bootstrap, and per-queue configuration
As an engineer, I want `@nestjs/bullmq` wired into the worker with per-queue concurrency/backoff/DLQ defaults so later consumers plug in cleanly.

AC:
- `JobsModule` loads queue configuration from a typed `QueuesConfig` map (name, concurrency, backoff, maxAttempts, rateLimit, DLQ target).
- Worker process registers consumers only when running in worker mode.
- A smoke test enqueues a no-op job and asserts completion; failed test job lands in the DLQ after exhausting retries.

Depends on: E1.2, E1.5. Refs: Arch §7.1, §7.2; AD-5.

### STORY-E4.2 — Domain queue definitions
As a team, I want all architecture-listed queues defined so downstream epics don't block on missing plumbing.

AC:
- Queues `scoring.recalc-employee`, `scoring.recalc-org-bulk`, `evidence.expiry-scan`, `snapshot.partition-maintenance`, `notification.deliver`, `observability.client-metrics` exist with the per-queue settings in Arch §7.2.
- Each queue exports a typed `enqueue<JobName>` helper from the jobs module; consumers are stubbed with an explicit "not-implemented" handler that throws.
- Prometheus metrics emitted per queue: depth, processing-duration histogram, DLQ depth.

Depends on: E4.1. Refs: Arch §7.2; NFR-6.4.

### STORY-E4.3 — Idempotency registry `recalc_jobs`
As a system, I want per-`(employee_id, triggering_event_id)` idempotency so duplicate recalcs never produce duplicate snapshots.

AC:
- Migration creates `recalc_jobs(employee_id, triggering_event_id, status enum('pending'|'completed'|'failed'), created_at, completed_at)` with a unique constraint on the pair.
- A helper `claim(employee_id, triggering_event_id)` performs `SELECT ... FOR UPDATE`, inserts if absent, aborts with `AlreadyCompletedError` if the row is already `completed`.
- Unit tests cover first-time claim, concurrent-claim race, and already-completed abort.

Depends on: E4.1, E1.4. Refs: Arch §7.3; FR-5.9.

### STORY-E4.4 — Cron scheduler pattern
As an operator, I want a declarative cron pattern so scheduled jobs land consistently.

AC:
- A `@Cron('CRON_EXPR', 'queueName')` decorator wires a scheduled enqueue via BullMQ repeatable jobs.
- At least one dev-mode cron (a no-op heartbeat every minute) is registered and visible in queue metrics.
- Timezone defaulted to UTC; configurable per-job.

Depends on: E4.1. Refs: Arch §7.2.

### STORY-E4.5 — Internal DLQ admin tool and depth alerting
As an on-call operator, I want to inspect and re-enqueue DLQ jobs without writing one-off scripts.

AC:
- An admin-role-gated UI at `/settings/ops/dlq` lists DLQ depth per queue, the last N failed jobs, failure reasons, and a one-click "re-enqueue" action.
- A server-side endpoint enforces ADMIN role and writes an audit event on each re-enqueue action.
- Prometheus alert rule documented in this story (rule itself shipped by E16): `fcm_dlq_depth > 0 for 5m` → page.

Depends on: E4.1, E4.2. Refs: Arch §7.6, §11.5.

### STORY-E4.6 — Recalculation-status primitives exposed via `domain-contracts`
As a frontend developer, I want `recalculation_pending` and `recalculation_stale` flags formalized so the UI can render pending state before the orchestrator lands.

AC:
- `packages/domain-contracts` exports an `EmployeeRecalcStatus` type used by later stories' DTOs.
- Status transitions: `idle → pending → (completed | stale)`; `stale` triggers when a pending job has exceeded its SLA (configurable, default 60 s).
- Unit tests cover every transition.

Depends on: E4.3. Refs: Arch §5.2; FR-5.12.

---

## EPIC-5 — Realtime Gateway & Push Infrastructure

### STORY-E5.1 — Socket.IO server and Redis adapter
As an engineer, I want a Socket.IO server integrated into `fcm-api` with the Redis adapter so realtime fanout scales horizontally.

AC:
- Socket.IO server runs inside `fcm-api`; Redis adapter configured against the same Redis used by BullMQ and sessions.
- Running two API replicas locally, a message emitted through either instance reaches all connected clients.
- Connection logs include `correlation_id`.

Depends on: E1.2, E1.5. Refs: Arch §8.1, §8.4; AD-6; AR-7.

### STORY-E5.2 — WebSocket handshake authentication using the same session JWT
As a security-conscious engineer, I want every WebSocket connection authenticated via the API's session JWT so unauthenticated clients cannot connect.

AC:
- Handshake rejects a connection whose JWT is missing, malformed, expired, or revoked; structured reason is logged.
- A successful handshake attaches `ActorContext` to the socket session.
- Integration tests cover success, expired token, and revoked-session cases.

Depends on: E5.1, E2.2, E2.3. Refs: Arch §8.5; AD-6.

### STORY-E5.3 — Room taxonomy and room-join authorization
As a platform engineer, I want the four rooms (`user:`, `org:`, `employee:`, `manager-team:`) with server-side join authorization so clients cannot join rooms they are not entitled to.

AC:
- A client joining `user:{id}` must match the socket's `user_id`; else reject.
- A client joining `org:*` must have ADMIN role; else reject.
- A client joining `employee:{id}` must pass visibility/RBAC (self, direct manager, or ADMIN); else reject.
- A client joining `manager-team:{manager_user_id}` must be that manager or ADMIN; else reject.
- Reject reasons emit a structured audit-adjacent log (not an audit event) with `correlation_id`.

Depends on: E5.2. Refs: Arch §8.2, §8.5.

### STORY-E5.4 — Outbound event filter and event-type contract
As a system, I want every outbound event filtered per recipient so a manager never receives unfiltered data about non-reports.

AC:
- A per-connection outbound middleware prunes event payloads by the recipient's visibility rule before emission.
- Event-type contracts live in `packages/domain-contracts/realtime-events/`: `snapshot.updated`, `evidence.*`, `promotion.*`, `recalc.*`, `config.changed`, `organization.promotion_mode.changed`.
- Emitters land in later epics; this story ships only the contracts, filter, and smoke test.

Depends on: E5.3. Refs: Arch §8.3, §8.5.

### STORY-E5.5 — Web client Socket.IO hook with TanStack Query cache invalidation, and polling fallback
As a frontend developer, I want a `useRealtime()` hook that connects to the API, invalidates the right TanStack Query keys on events, and transparently falls back to polling when the socket drops.

AC:
- `useRealtime()` connects on session ready, subscribes to the user's `user:{user_id}` room automatically, and exposes a subscribe-to-employee API.
- On `snapshot.updated`, the affected employee's query keys are invalidated; the map instance-attribute updater (wired in E11) is called with the new values.
- On WS disconnect > 10 s, the hook begins polling `GET /v1/latest-snapshots?since=...` every 30 s with `If-Modified-Since`.
- Realtime metrics exported client-side (connected clients, disconnect rate, polling-fallback active) and beaconed via `/metrics/client` at session end.

Depends on: E5.2, E5.4. Refs: Arch §4.5, §8.1, §11.2; FR-5.12.

---

## EPIC-6 — Organization Bootstrap & CDF Seeding

### STORY-E6.1 — Organization provisioning API
As an Admin, I want a one-shot provisioning endpoint so a new organization appears in FCM with correct defaults.

AC:
- `POST /v1/organizations` creates an organization with `slug`, `name`, default `visibility_default = OWN_ONLY`, `approval_workflow_default = SINGLE`, `promotion_mode = CALIBRATION`.
- The endpoint is restricted to a privileged internal role (not tenant Admin); it is called by bootstrap tooling, not by end users.
- A successful call emits an `organization.created` audit event via the outbox.
- Integration test asserts defaults match PRD §14.2, §14.8, §8.7.

Depends on: E2.6, E3.3. Refs: Arch §5.1, §5.4; PRD §14.2, §14.8.

### STORY-E6.2 — Configuration tables: tracks, levels, layers, requirements, promotion_rules
As an engineer, I want the configuration schema as data (not code) so every dimension in PRD §8 is org-editable.

AC:
- Migrations create `career_tracks`, `levels` (with non-overlapping band exclusion constraint), `layers`, `requirements`, `promotion_rules` per Arch §6.2.
- All tables are `organization_id`-scoped with RLS.
- A repository per table exists in the `configuration` module; no direct DB access outside it.

Depends on: E2.6, E6.1. Refs: Arch §5.1, §6.2; PRD §8.

### STORY-E6.3 — SeedingService with CDF defaults
As an Admin bootstrapping a new org, I want the CDF defaults seeded so employees can appear on the map on day one.

AC:
- `SeedingService.seedOrganization(organization_id)` creates Software Engineering L1–L5, Architecture L4–L5, Management L3–L5; Capability/Delivery/Influence layers per level; a representative requirement per layer with Fibonacci weights (1, 2, 3, 5, 8, 13, 21); default promotion rules; `visibility_default = OWN_ONLY`; `approval_workflow_default = SINGLE`; `promotion_mode = CALIBRATION`.
- Seed is idempotent: re-running against an already-seeded org throws `AlreadySeededError` without mutating data.
- Every seeded row emits a `configuration.seeded` audit event via the outbox.
- Unit test covers the full seeded state.

Depends on: E6.2. Refs: PRD §6.1, §8; Epics §4 E6.

### STORY-E6.4 — First-Admin bootstrap flow
As an Admin, I want a first-admin bootstrap UI/CLI so I can log in before OIDC is configured.

AC:
- A CLI command `fcm bootstrap-admin --org <slug>` creates the first ADMIN role_assignment, issues bootstrap fallback credentials, and prints the 10 OIDC-outage recovery codes.
- When the first OIDC-linked ADMIN exists (via E2.2), the bootstrap credentials are automatically retired and the CLI refuses to recreate them.
- Each action emits an audit event.

Depends on: E2.7, E6.1. Refs: PRD FR-1.2; Arch §10.1.

### STORY-E6.5 — Employee roster CSV bulk import
As an Admin, I want to import a roster CSV so I don't have to add employees one by one.

AC:
- `POST /v1/employees/bulk-import` accepts a CSV with `email`, `display_name`, `track_slug`, `level_code`, `manager_email`.
- Dry-run mode (`?dryRun=true`) validates and returns a per-row preview without writing.
- Commit mode creates users (stub profile until first SSO login), employee assignments, and role_assignments; every row produces an audit event.
- Validation errors return a structured report: row index, field, reason.
- An integration test covers 10 valid rows and 3 invalid rows; all side-effects roll back on commit failure.

Depends on: E6.3. Refs: PRD §6.1, FR-NFR-8.1; Arch §13.5.

### STORY-E6.6 — Integration test: seed → assign → fetch map employees happy path
As a team, I want a single end-to-end test that proves the bootstrap pipeline so regressions show up early.

AC:
- Test provisions an org, seeds CDF, imports 5 employees via CSV, and calls `GET /v1/map/employees` (stub permitted until E10 lands).
- Assertions confirm each employee appears with the expected `(track_id, level_id)` and no cross-org leakage.
- Test runs in CI under `integration` suite.

Depends on: E6.5. Refs: Epic E6 acceptance "integration test".

---

## EPIC-7 — Configuration Domain (Admin-Editable Career Model)

### STORY-E7.1 — Career Tracks CRUD (API + audit)
As Admin, I want to create, edit, and deactivate career tracks.

AC:
- `GET/POST/PATCH /v1/career-tracks[/:id]` implemented; ADMIN-only.
- Deactivation is soft (`deactivated_at`); no hard delete for audit reasons.
- Every mutation emits an audit event with `before`/`after` JSONB via the outbox.
- Unique `(organization_id, slug)` enforced at DB level.

Depends on: E6.2, E3.3. Refs: PRD FR-6.1, §10.1.

### STORY-E7.2 — Levels CRUD with non-overlapping band enforcement
As Admin, I want to configure levels per track with score bands that cannot overlap.

AC:
- `GET/POST/PATCH /v1/levels[/:id]`; ADMIN-only.
- Band overlap is rejected at the DB layer (exclusion constraint from E6.2) and surfaced as a structured `409 LEVEL_BAND_OVERLAP` error with the conflicting level's id.
- Mutation emits an audit event.
- Integration test covers a valid create, an overlapping reject, and a gap-tolerant update.

Depends on: E7.1. Refs: PRD FR-6.2; Arch §6.2.

### STORY-E7.3 — Layers CRUD
As Admin, I want to configure layers per level.

AC:
- CRUD endpoints implemented; ADMIN-only.
- Each level requires at least one layer; the last-remaining-layer delete returns `409 LAYER_MIN_VIOLATION`.
- Mutation emits audit event.

Depends on: E7.2. Refs: PRD FR-6.3.

### STORY-E7.4 — Requirements CRUD (weight, mandatory flag, evidence type, expiry)
As Admin, I want to configure requirements per layer.

AC:
- CRUD endpoints implemented; ADMIN-only.
- Fields: `name`, `description`, `evidence_type enum(FILE|URL|TEXT|STRUCTURED)`, `weight INT > 0`, `mandatory BOOL`, `expiry_months INT nullable`.
- Mutation emits audit event.
- A requirement cannot be hard-deleted once referenced by any evidence record; soft-deactivate instead.

Depends on: E7.3. Refs: PRD FR-6.4, §8.4.

### STORY-E7.5 — Promotion Rules CRUD per level
As Admin, I want to configure promotion rules per level.

AC:
- `GET/POST/PATCH /v1/levels/:id/promotion-rule`; ADMIN-only.
- Fields: `min_score`, `mandatory_completion_required BOOL`, `min_time_at_level_months INT nullable`, `manager_approval_required BOOL`, `hr_counter_sign_required BOOL`, `active_blocker_check BOOL`.
- Mutation emits audit event.

Depends on: E7.2. Refs: PRD FR-6.5, §8.5.

### STORY-E7.6 — Visibility Rules CRUD
As Admin, I want to configure organization-wide visibility and per-org defaults.

AC:
- `GET/PATCH /v1/organizations/me/visibility` exposes the four modes (`OWN_ONLY`, `TEAM`, `ORG_SUMMARY`, `ORG_FULL`); ADMIN-only.
- Updating the rule triggers a `config.visibility.changed` outbox event so the Map Data Contract (E10) invalidates cached projections.
- Mutation emits an audit event with `before`/`after`.

Depends on: E7.1, E3.3. Refs: PRD FR-6.6, §8.6, §14.2.

### STORY-E7.7 — Approval Workflow CRUD with per-level overrides
As Admin, I want to configure approval workflows organization-wide and per-level.

AC:
- `GET/PATCH /v1/organizations/me/approval-workflow`; `GET/PATCH /v1/levels/:id/approval-workflow` (nullable; null falls back to org default).
- Supported values: `SINGLE`, `DUAL_MANAGER`, `HR_GATE`.
- Mutation emits audit event.

Depends on: E7.1, E7.2. Refs: PRD FR-6.7, §8.7.

### STORY-E7.8 — Change-impact preview endpoint
As Admin, I want to see "this will affect N employees" before saving any configuration change.

AC:
- `POST /v1/configuration/preview-impact` accepts a proposed change (track/level/layer/requirement/promotion rule) and returns `{ affected_employee_count, sample_employee_ids[<=20] }`.
- Preview runs deterministically against current state; no writes occur.
- Unit test asserts count accuracy across representative shapes of change.

Depends on: E7.4, E7.5. Refs: PRD FR-6.8.

### STORY-E7.9 — ConfigurationChanged outbox emission on save
As a system, I want configuration saves to emit `ConfigurationChanged` via the outbox so bulk recalculation (E9) fires automatically.

AC:
- Every successful track/level/layer/requirement/promotion-rule mutation inserts an `outbox_events` row with `event_type = 'configuration.changed'`, payload `{ change_type, entity_id, affected_employee_ids[] }` in the same DB transaction.
- Affected-employee resolution is cheap and bounded; large changes chunk into multiple outbox rows if the list exceeds the configured chunk size.
- Integration test asserts no outbox row appears on a rolled-back transaction.

Depends on: E7.1–E7.5, E3.3. Refs: PRD FR-6.9, FR-6.10; Arch §5.4.

### STORY-E7.10 — Rollout-Mode admin surface and transition endpoint
As Admin/HR, I want to view and transition my organization's rollout mode.

AC:
- `GET /v1/organizations/me/promotion-mode` returns `{ promotion_mode, changed_at, changed_by }`.
- `PATCH` transitions the mode; `CALIBRATION → ACTIVE` requires `rationale` ≥100 chars and triggers synchronous Bootstrap Eligibility Snapshot capture in the same transaction (see E13 for snapshot content — table is provisioned here so the transition is atomic).
- `ACTIVE → CALIBRATION` is allowed with rationale; does not re-snapshot.
- Emits `organization.promotion_mode.changed` realtime event via outbox; audit event captures actor, rationale, from/to.

Depends on: E7.1, E13.2 (table provisioning is owned by this story for transactional atomicity — see note below). Refs: PRD FR-7.14, §8.9, §6.9; Arch §5.4, §6.2.

> Note: `bootstrap_eligibility_snapshots` and `rollout_mode_transitions` tables are created in this story (not E13) because the transition must be atomic with the snapshot capture. E13's Calibration Flag and Promotion endpoints consume them.

### STORY-E7.11 — Admin Settings UI for the full configuration surface
As Admin, I want 2D forms for every configuration dimension so I can configure my org from the app.

AC:
- `/settings` routes render forms for Tracks, Levels, Layers, Requirements, Promotion Rules, Visibility, Approval Workflow, and Rollout Mode.
- Change-impact preview (E7.8) displays before save; save is disabled until preview runs.
- All forms are keyboard-navigable (NFR-10.4) and screen-reader labeled (NFR-10.5).
- Admin-only; redirect non-Admins to `/map`.

Depends on: E7.1–E7.10. Refs: PRD FR-6.1–6.10; Arch §4.2.

---

## EPIC-8 — Evidence Lifecycle, Storage, Review & Expiry

### STORY-E8.1 — Evidence entity and state machine
As a system, I want a formal evidence state machine so every transition is legal and auditable.

AC:
- Migration creates `evidence (id, organization_id, employee_id, requirement_id, state enum(DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|EXPIRED), payload JSONB nullable, storage_object_key TEXT nullable, submitted_at, approved_at nullable, expires_at nullable, created_at, updated_at)`.
- A domain-layer `EvidenceStateMachine` rejects any illegal transition with a structured error.
- Unit tests cover every legal and illegal transition.

Depends on: E6.2, E2.6. Refs: Arch §6.2; PRD FR-4.4.

### STORY-E8.2 — Pre-signed S3 upload slot + finalize flow
As an Employee, I want to upload a file directly to object storage so evidence bytes don't flow through the API.

AC:
- `POST /v1/requirements/:id/evidence/upload-slot` returns a pre-signed PUT URL with 15-min TTL, single-use, content-length-range bounded, and key `org/{organization_id}/evidence/{employee_id}/{uuid}/{filename}`.
- `POST /v1/requirements/:id/evidence/finalize` validates object existence via S3 `HEAD`, records `storage_object_key`, `storage_etag`, `content_type`, `size_bytes`, transitions the evidence DRAFT → PENDING_APPROVAL, and emits an `evidence.submitted` outbox event.
- Organization scoping is asserted: a key outside `org/{organization_id}/...` is rejected with `403 FORBIDDEN_SCOPE`.
- Integration test covers upload-slot, upload-to-S3 stub, finalize, and state-machine assertion.

Depends on: E8.1. Refs: Arch §9.1, AD-9; PRD FR-4.2, FR-4.3.

### STORY-E8.3 — Pre-signed retrieval with RBAC + visibility checks
As a reviewer, I want to download an evidence file only after an authorization pass.

AC:
- `GET /v1/evidence/:id/download` returns a 10-min TTL pre-signed GET URL only after RBAC + visibility checks pass; else 403.
- Downloads by the Employee themselves, their direct manager, or an Admin succeed; unrelated viewers are rejected.
- A `403` on cross-org access is asserted in an integration test (RLS + explicit check).
- Each successful retrieval emits an `evidence.retrieved` audit event.

Depends on: E8.2. Refs: Arch §9.2, AR-5; PRD FR-4.3.

### STORY-E8.4 — Approve/Reject with mandatory reasons and ApprovalRecord
As a Manager, I want to approve or reject evidence with a written reason.

AC:
- `PATCH /v1/evidence/:id/approve` requires `reason` ≥10 chars; `PATCH /v1/evidence/:id/reject` requires `reason` ≥20 chars.
- Both endpoints call `SelfApprovalGuard.ensureNotSelf(actor, evidence.employee.user_id)`; self-approval returns 403.
- On success, `approval_records` row is written with actor, decision, reason, timestamp.
- Approve transitions state → APPROVED and enqueues `scoring.recalc-employee` via outbox; Reject transitions → REJECTED. Both emit audit events.

Depends on: E8.1, E4.2. Refs: PRD FR-4.5, FR-4.6, §6.3, §9.2.

### STORY-E8.5 — Admin/HR override approval path
As an Admin, I want to approve or reject evidence for any employee (for gaps or escalations).

AC:
- Same endpoints as E8.4 accept ADMIN role with a separate `allow_admin_override` authorization pass; ADMIN cannot self-approve their own evidence.
- The audit event's `actor_role` is set to ADMIN so HR investigations can distinguish override paths.

Depends on: E8.4. Refs: PRD FR-4.6.

### STORY-E8.6 — Retroactive rejection of APPROVED evidence
As a Manager or Admin, I want to retroactively reject previously approved evidence.

AC:
- `PATCH /v1/evidence/:id/reject` accepts reject against an APPROVED evidence item; state transitions APPROVED → REJECTED.
- A recalc job enqueues for the affected employee with a synthetic `EvidenceRetroactivelyRejected` triggering event.
- The audit event flags `retroactive: true` and includes `approved_at` and `rejected_at` for date-discrepancy investigation.

Depends on: E8.4. Refs: PRD FR-4.7.

### STORY-E8.7 — Evidence expiry cron consumer
As a system, I want expired evidence automatically transitioned and scores recalculated.

AC:
- Cron `evidence.expiry-scan` runs daily at 02:00 UTC, scans `WHERE state = 'APPROVED' AND expires_at < NOW()`, and per match: transitions → EXPIRED, enqueues recalc with synthetic `EvidenceExpired` event, and writes audit + notification via outbox — all in one transaction per evidence item.
- The scan is rate-limited per org to avoid thundering herds.
- Unit test with fixed clock verifies expiry decisions.

Depends on: E8.1, E4.2, E4.4. Refs: PRD §14.7, FR-4.8.

### STORY-E8.8 — Evidence review latency metric
As Admin/HR, I want a Prometheus metric for per-manager review latency so engagement can be monitored.

AC:
- On `evidence.approved` / `evidence.rejected` events, a `fcm_evidence_review_latency_seconds` histogram is emitted labeled by `manager_user_id`.
- The metric is exposed on the auth-gated `/metrics` endpoint.
- A dashboard panel stub is committed in `ops/grafana/` (the full dashboard lands in E16).

Depends on: E8.4, E1.7. Refs: PRD FR-12.4; Arch §11.2.

---

## EPIC-9 — Scoring & Forecasting Engine

### STORY-E9.1 — Pure scoring-core package: calculateScore
As a domain engineer, I want a pure `calculateScore` function with zero I/O so determinism is testable in isolation.

AC:
- `packages/scoring-core/src/calculateScore.ts` exports `calculateScore(inputs: ApprovedEvidence[], currentLevelId: string, now: Date): number`.
- Sums weights of APPROVED evidence scoped to `currentLevelId` per PRD §7.2.
- Pure function: no imports from `apps/api`, no clock, no DB.
- Unit tests cover 1k+ randomized permutations with snapshot-level determinism assertion.

Depends on: E1.1. Refs: PRD §7.2, FR-5.1, FR-5.8; Arch §5.2.

### STORY-E9.2 — Pure scoring-core: calculateReadiness and evaluateEligibility
As a domain engineer, I want pure readiness % and eligibility functions so the three outputs remain distinct in code.

AC:
- `calculateReadiness(score, bandStart, bandEnd, mandatoryCompleted, mandatoryTotal)` returns 0–100 per PRD §7.4.
- `evaluateEligibility(score, bandEnd, mandatories[], minTimeAtLevelMonths, timeAtLevelMonths, blockers[])` returns `{ eligible: boolean, failing_conditions: string[] }` per PRD §7.5.
- Unit tests cover each failing-condition path plus the fully-eligible case; assert that a 99% readiness does not imply `eligible = true`.

Depends on: E9.1. Refs: PRD §7.4, §7.5, FR-5.2, FR-5.3, FR-5.4.

### STORY-E9.3 — Pure scoring-core: calculateETA and calculateConfidence
As a domain engineer, I want pure ETA and Confidence functions so the paired output is reproducible.

AC:
- `calculateETA(remainingPoints, approvedEvidence, now)` uses the 90-day velocity window; returns `null` when velocity is 0 (per PRD §7.6).
- `calculateConfidence(historyDays, velocityCV, remainingMandatories, velocityTrendQoQ)` returns `High | Medium | Low` per PRD §7.7 and edge-case table §14.4.
- Tests cover all scenarios in §14.4 including <30 days, stalled (velocity=0), declining >40% QoQ, and high-confidence path.

Depends on: E9.1. Refs: PRD §7.6, §7.7, §14.4, FR-5.5, FR-5.6.

### STORY-E9.4 — `score_snapshots` table, partitioning, and materialized `employee_current_snapshot` view
As a platform engineer, I want snapshots partitioned and the latest snapshot served via a materialized view so reads are O(1) and writes remain append-only.

AC:
- Migration creates `score_snapshots` with columns listed in Arch §6.2; partitioned monthly by `RANGE (occurred_at)`; indexes `(employee_id, occurred_at DESC)` and `(organization_id, occurred_at)`.
- Snapshot contains all five outputs atomically: `score`, `readiness_pct`, `promotion_eligible`, `eta_months`, `confidence`, plus `inputs_hash` and `triggering_event_id`.
- Materialized view `employee_current_snapshot` refreshed within the same transaction via AFTER INSERT trigger.
- Append-only enforcement: REVOKE UPDATE/DELETE on the role; trigger raises on any attempt.

Depends on: E1.4. Refs: Arch §6.3, §6.4; PRD §7.9, FR-5.10.

### STORY-E9.5 — ScoringOrchestrator consumer
As a system, I want the recalc-employee consumer to orchestrate pure functions, persist a snapshot, and emit events.

AC:
- Consumer of `scoring.recalc-employee` claims `recalc_jobs` via E4.3, loads inputs as-of `triggering_event.occurred_at`, calls pure functions, inserts a new `score_snapshots` row, marks the job `completed`, and emits `score.recalculated` via outbox.
- Idempotent: a duplicate `(employee_id, triggering_event_id)` pair short-circuits.
- SHA-256 `inputs_hash` computed from evidence set + config version and persisted.
- Integration test runs end-to-end: approve evidence → snapshot appears → `employee_current_snapshot` reflects it.

Depends on: E9.1, E9.2, E9.3, E9.4, E4.3. Refs: Arch §7.3, §9.4; PRD FR-5.7, FR-5.8, FR-5.9, FR-5.10; AR-3.

### STORY-E9.6 — Bulk recalculation consumer (`scoring.recalc-org-bulk`)
As Admin, I want a configuration change to recalculate all affected employees asynchronously without starving interactive approvals.

AC:
- Consumer of `scoring.recalc-org-bulk` fans out per-employee jobs sharing the same `triggering_event_id` onto `scoring.recalc-employee`.
- Queue is rate-limited per Arch §7.2 so bulk never starves interactive recalcs.
- Progress events `recalc.bulk.progress { completed, total }` emitted via outbox for the admin UI.
- Integration test with 50 synthetic employees asserts all complete and a progress event stream is observable.

Depends on: E9.5, E7.9. Refs: Arch §7.4; PRD FR-6.9.

### STORY-E9.7 — Score Breakdown explainability API
As an Employee or Manager, I want to see exactly which evidence contributed to the current score.

AC:
- `GET /v1/employees/:id/score-breakdown` returns `{ snapshot_id, contributing_evidence: [{ evidence_id, requirement_id, weight, approved_at, approver_id, approver_reason }], total_score }`.
- Derived from the latest snapshot + joins; no recomputation.
- RBAC: self, direct manager, or Admin; else 403. Visibility rules for peers apply.
- Integration test asserts the breakdown sums exactly to the snapshot's `score`.

Depends on: E9.5. Refs: PRD §10.3; Arch §9.4.

### STORY-E9.8 — Forecast window selector contract and new-employee edge cases
As an Employee, I want to select a 3/6/12-month forecast window and receive an honest confidence signal when history is thin.

AC:
- `GET /v1/employees/:id/snapshot/latest?forecast_window_months=3|6|12` returns the snapshot plus a window-appropriate view of ETA/Confidence (velocity remains 90-day per PRD §7.6, but display semantics change).
- For new employees with <30 days of history, the response includes `eta_display = "Insufficient data"` and `confidence = "Low"`.
- The response DTO exposes `recalculation_pending` and `recalculation_stale` from E4.6.

Depends on: E9.5, E4.6. Refs: PRD §14.4, FR-5.12, §5.2.

---

## EPIC-10 — 3D Map Data Contract & Projection API

### STORY-E10.1 — mapprojection module and `GET /v1/map/projection`
As a frontend developer, I want the spiral projection data for the current config so the Web Worker can regenerate geometry deterministically.

AC:
- `MapProjectionService` is a pure function: `(organizationConfig) → { tracks[], levels[], layers[], seed_parameters }`.
- `GET /v1/map/projection` returns this payload plus `config_version` for client caching.
- Response headers include `X-FCM-Config-Version`; cache-key is `(organization_id, config_version)`.
- Unit test with a fixed configuration asserts deterministic output.

Depends on: E7.1–E7.3. Refs: Arch §5.1 mapprojection, §13.2; Epics E10.

### STORY-E10.2 — `GET /v1/map/employees` server-shaped payload
As a frontend developer, I want the map node data shaped server-side with RBAC applied so the client is never trusted to hide data.

AC:
- Endpoint returns `{ nodes: [...] }` matching the `MapNode` contract (Arch §13.3): `employee_id` (nullable), `track_id`, `level_id`, `band_position` (0–1), `score` (nullable), `readiness_pct` (nullable), `promotion_eligible` (nullable), `eligibility_state`, `at_risk` (nullable), `anonymized`.
- Filter scope: Managers default to "My Team" (FR-2.15); `?scope=org` toggles off the default; ADMIN sees all.
- Values come from `employee_current_snapshot`; no recomputation.
- Response includes headers `X-FCM-Rollout-Mode` and `X-FCM-Visibility-Scope`.

Depends on: E9.4, E10.1, E2.6. Refs: Arch §13.3; PRD FR-2.15, §14.5.

### STORY-E10.3 — Server-side anonymization pass
As a security-minded engineer, I want anonymization enforced server-side so the client never receives identity for peers it cannot see.

AC:
- For each node, a `should_reveal(viewer, subject)` authorization pass decides reveal vs. anonymize per the org's visibility rule (E7.6).
- Anonymized nodes emit `employee_id = null` (replaced by an opaque per-render token), `anonymized = true`, `score/readiness_pct/promotion_eligible/at_risk = null`; `track_id/level_id/band_position` remain populated so shape is preserved; node is marked non-clickable server-side via a `clickable: false` hint.
- Integration tests:
  - `OWN_ONLY` viewer receives only their own identified node.
  - `TEAM` viewer receives identified nodes only for direct team members.
  - `ORG_SUMMARY` returns only aggregate counts (no individual nodes).

Depends on: E10.2, E7.6. Refs: PRD §8.6, §14.2, FR-3.17; Arch §13.3, AR-13.

### STORY-E10.4 — Rollout-Mode eligibility overlay and realtime cache invalidation
As a system, I want the Map Data Contract to override eligibility state when the org is in `CALIBRATION` so no client path can render a promotion-ready affordance during calibration.

AC:
- When `organization.promotion_mode = CALIBRATION`, any node that would compute `eligibility_state = 'ELIGIBLE'` is emitted as `'PENDING_CALIBRATION'`; the override is applied after anonymization.
- The server applies the state-override hierarchy: Rollout Mode > Calibration Hold > Eligibility; only one state is returned per node.
- On `organization.promotion_mode.changed` or `config.changed` realtime events, clients receive an invalidation message; on `snapshot.updated`, only the affected node's attributes update (no full re-render).
- Integration test asserts a `CALIBRATION` org produces zero nodes with `eligibility_state = 'ELIGIBLE'`.

Depends on: E10.3, E5.4, E7.10. Refs: Arch §13.3; PRD FR-7.13, §6.9, §8.9.

---

## EPIC-11 — 3D Career Map Rendering & Interaction Core

### STORY-E11.1 — R3F scene graph scaffold and route
As a frontend developer, I want a React Three Fiber scene rendering a placeholder spiral at `/map` so later stories hang nodes off a real canvas.

AC:
- `/map` route loads a client component mounting an R3F `<Canvas>` in dark mode.
- Placeholder spiral geometry renders at 60 fps on a reference desktop.
- Layout uses a persistent canvas pattern (the canvas remains mounted when the user navigates to other routes per Arch §4.4).

Depends on: E1.3, E10.1. Refs: Arch §4.3, §4.4.

### STORY-E11.2 — Web Worker spiral geometry generator with IndexedDB cache
As a performance-minded developer, I want geometry generation off the main thread and cached by `(organization_id, config_version)` so startup is fast and reruns are free.

AC:
- `apps/web/workers/spiral-geometry.worker.ts` consumes the `/map/projection` payload and returns `BufferGeometry` attributes.
- Result cached in IndexedDB keyed by `(organization_id, config_version)`.
- On cache miss, worker runs; on hit, worker is skipped and cached attributes are loaded.
- Unit test with a mocked IndexedDB covers hit and miss paths.

Depends on: E11.1. Refs: Arch §4.3 rule 6.

### STORY-E11.3 — InstancedMesh employee nodes with per-instance attributes
As a frontend developer, I want nodes rendered via a single InstancedMesh so 500+ employees render with one draw call.

AC:
- Node layer is a single `<InstancedMesh>` sized to the current cohort.
- Per-instance attributes: `color` (level), `opacity`, `emissiveIntensity`, `pulsePhase` passed via `InstancedBufferAttribute`.
- Updating a node's attributes on a realtime event mutates the buffer in place (no full re-render).
- Level color coding: L1 blue, L2 teal, L3 purple, L4 tan, L5 silver.

Depends on: E11.2, E10.2. Refs: Arch §4.3 rule 2, FR-2.4, FR-2.5, §14.3.

### STORY-E11.4 — 3-tier LOD with clustering and frustum/occlusion culling
As a performance-minded developer, I want LOD and culling so the 60 fps / 500-node budget holds.

AC:
- Near tier: full detail + labels.
- Mid tier: instanced spheres, no labels, simplified materials.
- Far tier: clustered aggregate billboards per `(track, level)` with count glyph; threshold default 12, configurable.
- Frustum culling + track-segment occlusion pass implemented; off-frustum segments skip instance updates.
- FPS measured at 500-node synthetic test ≥30 fps sustained (target 60).

Depends on: E11.3. Refs: Arch §4.3 rules 3–4; NFR-1.1.

### STORY-E11.5 — BVH-accelerated raycasting for hover and click
As a user, I want smooth hover feedback and clean click targets.

AC:
- `three-mesh-bvh` wraps the node InstancedMesh.
- Hover uses a throttled 60 Hz raycast; click fires a single raycast on pointer-up.
- Anonymized nodes (from E10.3) do not accept click; hover shows no tooltip.
- Missed click (empty area) deselects the current node.

Depends on: E11.3. Refs: Arch §4.3 rule 5; FR-2.9, FR-2.10.

### STORY-E11.6 — OrbitControls, reset-view tween, and camera controls
As a user, I want to rotate, zoom, and reset the camera smoothly.

AC:
- `OrbitControls` (damped) wired; rotate via drag, zoom via wheel/pinch.
- Reset-view control tweens the camera back to default orientation using drei camera animations.
- Controls keyboard-dispatchable for users with pointer constraints (arrow-key rotate, +/- zoom).

Depends on: E11.4. Refs: PRD FR-2.7, FR-2.8, FR-2.11; Arch §4.3 rule 9.

### STORY-E11.7 — Promotion-Ready pulse and readiness encoding with `prefers-reduced-motion` fallback
As a user, I want clear visual signals for promotion eligibility and readiness that respect accessibility preferences.

AC:
- Emissive pulse shader uniform drives a subtle pulse; binding is `promotion_eligible === true`, never `readiness_pct`.
- When `prefers-reduced-motion` is set, pulse is replaced with a static ring halo.
- Per-instance opacity + emissive blended from `readiness_pct`; clamped at 40% opacity minimum so 0% nodes remain clickable.
- Single bloom post-processing pass on the emissive channel.

Depends on: E11.3. Refs: PRD §14.3, FR-2.6, FR-7.2; Arch §4.3 rules 7–10.

### STORY-E11.8 — Client performance instrumentation and end-of-session beacon
As an operator, I want 3D performance telemetry so regressions are caught early.

AC:
- Client captures FPS histogram, dropped-frame count, draw calls, triangle count, JS heap for the scene during the session.
- At session end (or navigation away), a non-blocking `navigator.sendBeacon` posts metrics to `POST /v1/metrics/client`.
- `observability.client-metrics` queue consumer writes to Prometheus via the server-side metrics registry.
- No PII in the beacon payload.

Depends on: E11.4, E4.2. Refs: Arch §4.3 rule 12, §11.2; NFR-1.1.

---

## EPIC-12 — 3D Navigation Shell, Filters Panel & Employee Detail Panel

### STORY-E12.1 — Top navigation bar and persistent canvas
As a user, I want top-nav entries "Career Map / Dashboard / Analytics / Settings" with Career Map as the default landing and a canvas that persists across routes.

AC:
- Top-nav entries render with correct active-route highlighting; Career Map is default post-login.
- Navigating to `/dashboard`, `/analytics`, `/settings` keeps the 3D canvas in memory (regenerates only on config change per E11.2).
- Role-gated: non-Admins do not see Settings.
- Keyboard navigation works across all nav entries.

Depends on: E11.1. Refs: PRD §5.3, FR-2.1; Arch §4.2, §4.4.

### STORY-E12.2 — Left Filters panel with tracks, levels, and session persistence
As a user, I want checkboxes for Career Tracks and Levels that filter the 3D scene with live employee counts.

AC:
- Left panel renders Career Track checkboxes with live counts, and Level (L1–L5) checkboxes for cross-track filtering.
- Selecting filters immediately updates node visibility (faded-out not hidden, per PRD §5.1).
- Selections persist in `sessionStorage` for the duration of the session.
- Manager default filter is "My Team" (toggleable to org-wide).

Depends on: E12.1, E10.2. Refs: PRD FR-2.12, FR-2.13, FR-2.15, §14.5.

### STORY-E12.3 — Hover tooltip (name, level, track)
As a user, I want a lightweight hover tooltip so I can identify a node without clicking.

AC:
- Hovering a node shows a tooltip with `name`, `level`, `track`; throttled 60 Hz.
- Tooltip suppressed for anonymized nodes.
- Tooltip respects visibility: peer-not-visible nodes receive no tooltip.

Depends on: E11.5, E10.3. Refs: PRD FR-2.10.

### STORY-E12.4 — Employee Detail Panel slide-in with three outputs and paired ETA+Confidence
As a user, I want the detail panel to slide in from the right when I click a node, showing Score Progress, Readiness %, and Promotion Eligibility as three visually distinct outputs plus a paired ETA + Confidence.

AC:
- Panel slides in from the right; 3D canvas remains visible and rotatable behind it (FR-3.2).
- Panel shows photo, name, track, current level.
- Three outputs clearly separated: Score Progress (points + % of band), Readiness % (distinct component), Promotion Eligibility (state label `ELIGIBLE` / `NOT_ELIGIBLE` / `CALIBRATION_HOLD` / `PENDING_CALIBRATION` with reasons).
- ETA + Confidence displayed as a paired output with Confidence as a visual badge.
- Closing the panel deselects the node and returns to the 3D canvas.

Depends on: E11.5, E9.8. Refs: PRD §5.2, FR-3.1, FR-3.6, FR-3.7, FR-3.13.

### STORY-E12.5 — Layer breakdown, Next Requirements, and forecast window selector
As an Employee or Manager, I want the detail panel to show the layer-by-layer breakdown, the Next Requirements list, and a 3/6/12-month forecast selector.

AC:
- Capability / Delivery / Influence rendered as progress bars with percentages, sourced from E9.7.
- Next Requirements list displays the top 3–5 open items relevant to promotion.
- Forecast window selector toggles between 3/6/12 months via the E9.8 API.
- Recalculation-pending indicator shows while a recalc is in flight for the viewed employee.

Depends on: E12.4, E9.7, E9.8. Refs: PRD FR-3.4, FR-3.5, FR-3.8, FR-5.12.

### STORY-E12.6 — Role-gated panel actions: Submit Evidence, Approve/Reject, Initiate Promotion (wired or stubbed)
As an Employee/Manager/HR/Admin, I want role-specific actions inside the panel.

AC:
- Employee on own panel: "Submit Evidence" button opens the evidence-submission flow (wired to E8.2).
- Manager on report's panel: "Approve" / "Reject" actions on any pending evidence item inline (wired to E8.4).
- "Initiate Promotion" button rendered but its wiring is completed in E13.8; when the org is in `CALIBRATION`, the button is suppressed and replaced with the label "Eligible — Pending Calibration" (per FR-3.16).
- "Flag for Calibration" action visible to HR only on nodes in `ELIGIBLE` state; wired in E13.6 (UI stub here).
- "View Full Profile" link for Manager and Admin; wired in E15.3.

Depends on: E12.4, E8.2, E8.4. Refs: PRD FR-3.9, FR-3.10, FR-3.11, FR-3.15, FR-3.16; Arch §5.4.

### STORY-E12.7 — Manager Development Notes tab with PRIVATE/SHARED states and one-way share
As a Manager, I want a Development Notes tab so I can capture private coaching context next to scoring data and optionally share specific notes.

AC:
- Tab visible only to Manager (on direct report) and HR.
- `GET/POST /v1/employees/:id/development-notes` implemented with `visibility enum(PRIVATE, SHARED_WITH_EMPLOYEE)`, default `PRIVATE`.
- `PATCH /v1/development-notes/:id/share` transitions `PRIVATE → SHARED_WITH_EMPLOYEE`; reverse transition is rejected (DB trigger + domain guard).
- Employee viewing own panel sees only shared notes (never PRIVATE); `developmentnotes` RBAC per Arch §5.1.
- Each note create and share emits an audit event via outbox.

Depends on: E12.4, E3.3. Refs: PRD §5.2 Development Notes, FR-3.14; Arch §5.1 developmentnotes, §5.4.

### STORY-E12.8 — Peer-visibility stripping inside the panel
As an Employee viewing a peer node I am permitted to see, I want Score, ETA, Confidence, and Development Notes never to appear.

AC:
- When viewer is EMPLOYEE and target is a peer under `TEAM` visibility, the panel renders only name, level, track, and summary status (no score/ETA/confidence/notes).
- Server-side DTO from `/v1/employees/:id/panel` (new, thin) strips fields the viewer is not entitled to see; client trusts the DTO.
- Integration test asserts no forbidden fields leak across the API boundary.

Depends on: E12.4, E7.6. Refs: PRD FR-3.17; Arch §13.3.

### STORY-E12.9 — Rollout-Mode banner and panel labeling
As Manager/HR, I want a banner when my org is in `CALIBRATION` so it's obvious why the promotion workflow is paused.

AC:
- When `X-FCM-Rollout-Mode = CALIBRATION`, a top-of-panel banner renders for Managers and HR: "Your organization is in calibration; promotion workflow is paused."
- Employees do not see the operational banner but see the re-labeled Eligibility ("Eligible — Pending Calibration").
- Banner state reacts live to `organization.promotion_mode.changed` realtime events.

Depends on: E12.4, E5.5, E10.4. Refs: PRD FR-3.16, §8.9; Arch §13.3.

### STORY-E12.10 — Accessible List View toggle and aria-label canvas summary
As a user who cannot operate the 3D canvas, I want an accessible list equivalent so I can still navigate.

AC:
- A toggle next to the canvas swaps the 3D scene for a screen-reader-friendly table using the same `/map/employees` data feed.
- Table rows are keyboard-focusable; pressing Enter opens the same detail panel.
- `aria-label` on the canvas summarizes the visible cohort (e.g., "3D Career Map showing 47 employees across 3 tracks").

Depends on: E12.2, E12.4. Refs: PRD NFR-10.4, NFR-10.5; Arch §4.6.

---

## EPIC-13 — Promotion Workflow & Track Transfer

### STORY-E13.1 — `promotion_records` table and approval-chain state machine
As a platform engineer, I want a promotion records table with a strict state machine so every step is auditable.

AC:
- Migration creates `promotion_records(id, organization_id, employee_id, from_level_id, to_level_id, state enum, initiated_at, completed_at)` with state transitions: `RECOMMENDED → IN_REVIEW → APPROVED | REJECTED | CALIBRATION_HOLD`; `CALIBRATION_HOLD → IN_REVIEW | REJECTED`.
- Domain-layer state machine rejects illegal transitions.
- Append-only for terminal states.

Depends on: E6.2, E2.6. Refs: Arch §6.2.

### STORY-E13.2 — `promotion_recommendations` append-only table with narrative check
As a platform engineer, I want a separate append-only table for the Manager's Performance Narrative so the narrative is always immutable.

AC:
- Migration creates `promotion_recommendations(id, promotion_record_id FK, manager_id, performance_narrative TEXT NOT NULL CHECK (char_length(performance_narrative) >= 200), recommended_at)`.
- Table has `INSERT`-only grant; `UPDATE` and `DELETE` revoked for the app role.
- Unit test asserts a 199-char narrative is rejected by DB; 200+ accepted.

Depends on: E13.1. Refs: PRD FR-7.10, FR-7.11, §6.5; Arch §5.4, §6.2.

### STORY-E13.3 — `calibration_flags` table with partial unique open-flag index
As a platform engineer, I want calibration flags with a DB-level guarantee of at most one open flag per employee.

AC:
- Migration creates `calibration_flags(id, organization_id, employee_id, flagger_id, state enum('OPEN','RESOLVED_RELEASE','RESOLVED_REJECT'), open_reason TEXT NOT NULL CHECK (char_length(open_reason) >= 40), resolution_note TEXT nullable, opened_at, resolved_at)`.
- Partial unique index on `(employee_id) WHERE state = 'OPEN'` enforces the single-open-flag invariant.
- A 409 `CALIBRATION_FLAG_ALREADY_OPEN` structured error is returned on concurrent open-flag conflict.

Depends on: E6.2. Refs: PRD FR-3.15, FR-7.12, §6.8; Arch §5.4, §6.2, AR-14.

### STORY-E13.4 — `POST /v1/employees/:id/promotions` with four independent gates
As a Manager, I want to initiate a promotion knowing the server enforces Eligibility, Rollout Mode, Calibration Flag absence, and Performance Narrative presence.

AC:
- Endpoint re-verifies, in a single transaction: (a) `promotion_eligible = true` on the latest snapshot; (b) `organization.promotion_mode = ACTIVE`; (c) no open `calibration_flags` for the employee; (d) `performance_narrative` ≥200 chars in the body.
- Structured error codes on rejection: `PROMOTION_NOT_ELIGIBLE` (+ failing_condition), `ORG_IN_CALIBRATION_MODE`, `CALIBRATION_FLAG_OPEN` (+ flag_id), `NARRATIVE_TOO_SHORT`.
- On success, inserts `promotion_records` (state `RECOMMENDED`), inserts `promotion_recommendations` (append-only), emits outbox events (audit + notification + manager-team realtime).

Depends on: E13.1, E13.2, E13.3, E7.10, E9.5. Refs: PRD FR-7.3, FR-7.4, FR-7.10, FR-7.12, FR-7.13, §6.5; Arch §5.4, AR-12.

### STORY-E13.5 — `POST /v1/promotions/:id/recommend` (if workflow uses a separate recommend step)
As a Manager in a workflow that separates "initiate" from "recommend", I want an explicit recommend endpoint.

AC:
- For organizations whose workflow is `DUAL_MANAGER` or `HR_GATE`, the initial `POST /employees/:id/promotions` creates the record in `RECOMMENDED` state and this endpoint is not needed; this story covers workflows that may later require an explicit re-recommend after a calibration release (the endpoint exists for API completeness and audit trail).
- Behavior: transitions back to `IN_REVIEW` after `CALIBRATION_HOLD → RESOLVED_RELEASE`; requires `re_recommendation_reason` ≥40 chars.
- Audit event captures the re-recommend context.

Depends on: E13.4, E13.6. Refs: Arch §13.2; PRD §6.5.

> Note: small-correction flag — the epic lists both initiate and recommend endpoints; this story models recommend as a post-release transition rather than an extra upfront step, keeping the common path (no calibration) to one call. This is an API-shape clarification only; the workflow semantics in PRD §6.5 are preserved.

### STORY-E13.6 — HR calibration-flag endpoints (open, resolve)
As HR, I want to open a calibration flag on any eligible employee or pending promotion, and resolve it with a release or reject.

AC:
- `POST /v1/employees/:id/calibration-flags` (HR only): opens a flag with `reason` ≥40 chars; blocks any in-progress promotion from advancing.
- `PATCH /v1/calibration-flags/:id/resolve` (HR only): transitions to `RESOLVED_RELEASE` (lifts the hold; workflow can resume via E13.5 if required) or `RESOLVED_REJECT` (persists as organizational context; does not lift the underlying eligibility computation).
- Both actions emit audit + notification events.
- Integration test asserts approval endpoints return `CALIBRATION_FLAG_OPEN` while a flag is open.

Depends on: E13.3. Refs: PRD FR-3.15, FR-7.12, §6.8; Arch §5.4.

### STORY-E13.7 — Approval workflow execution (`SINGLE` / `DUAL_MANAGER` / `HR_GATE`)
As a workflow engine, I want to execute the approval chain honoring per-org / per-level configuration.

AC:
- `PATCH /v1/promotions/:id/approve` and `/reject` advance the state machine per workflow; self-approval rejected via E2.5 guard.
- In `SINGLE`, the Manager's recommendation completes the promotion.
- In `DUAL_MANAGER`, a second Manager or Admin must co-approve.
- In `HR_GATE`, Admin/HR must counter-sign.
- Each action requires a `reason` field on reject; rejection emits notification to the initiating Manager with reason.

Depends on: E13.4, E7.7. Refs: PRD FR-7.5, FR-7.6, §6.5, §8.7.

### STORY-E13.8 — Promotion commit: level change, score archival, node reposition, notifications
As a system, I want a completed promotion to atomically commit the level change and fan out.

AC:
- On final approval, a single transaction: updates `employees.level_id`, resets level-scoped score inputs (next recalc will compute against new level), archives previous snapshot via a `promotion.committed` triggering event, inserts outbox rows for audit + notification + realtime `promotion.completed`.
- `promotion.completed` event triggers a 3D canvas node-reposition animation client-side.
- Previous-level score remains in `score_snapshots` history.
- Integration test covers the full initiate → approve → commit → node-reposition path.

Depends on: E13.7, E9.5, E5.4. Refs: PRD FR-7.7, FR-7.8, FR-7.9, §6.5; Arch §5.4.

### STORY-E13.9 — Track Transfer flow
As Admin, I want to transfer an employee to a different track with full audit integrity.

AC:
- `POST /v1/employees/:id/track-transfers` (ADMIN only) accepts `to_track_id`, `target_level_id`, `reason` ≥40 chars.
- In one transaction: inserts `track_transfers` row, updates employee's `track_id` and `level_id`, resets score for the new track to 0, preserves all prior evidence and snapshots in audit history.
- Admin may optionally carry over specific evidence via a separate endpoint `PATCH /v1/evidence/:id/reassociate-to-track` (logged as manual re-association).
- Notification to employee and manager.

Depends on: E13.8, E8.1. Refs: PRD §14.6.

### STORY-E13.10 — Initiate Promotion UI wiring inside the Detail Panel
As a Manager, I want the "Initiate Promotion" action to be enabled exactly when eligible, not in calibration mode, and not flagged, and to open a Performance Narrative composition modal.

AC:
- Button is enabled only when `promotion_eligible = true` AND `X-FCM-Rollout-Mode = ACTIVE` AND no open Calibration Flag for the employee.
- Modal has a live character counter for the Performance Narrative; save-and-submit is disabled until ≥200 chars.
- Successful submit calls `POST /v1/employees/:id/promotions` and updates panel state with a "Recommendation submitted" confirmation; client errors surface structured backend messages.
- When suppressed by calibration, the button is replaced with the "Eligible — Pending Calibration" label and an explanatory tooltip.

Depends on: E12.6, E13.4, E12.9. Refs: PRD §6.5, §11.7, FR-3.11, FR-3.16, FR-7.3, FR-7.10.

### STORY-E13.11 — Four-gate integration test suite
As a team, I want automated proof that all four independent gates block promotion paths.

AC:
- Test (a): high Readiness %, low Eligibility employee — request rejected `PROMOTION_NOT_ELIGIBLE`.
- Test (b): eligible employee in `CALIBRATION`-mode org — rejected `ORG_IN_CALIBRATION_MODE`.
- Test (c): eligible employee with open Calibration Flag — rejected `CALIBRATION_FLAG_OPEN` with flag_id.
- Test (d): eligible employee with missing/<200-char narrative — rejected `NARRATIVE_TOO_SHORT`.
- Each test asserts an audit event captures the rejection itself.

Depends on: E13.4. Refs: Epic E13 acceptance; PRD §19.1 item 11, FR-7.4, FR-7.10, FR-7.12, FR-7.13.

---

## EPIC-14 — In-App Notifications & Manager Engagement Nudges

### STORY-E14.1 — `notifications` table and NotificationService
As a user, I want a persistent in-app notification store.

AC:
- Migration creates `notifications(id, organization_id, user_id, kind, payload JSONB, read_at nullable, created_at)`.
- `NotificationService.create(actor, target_user_id, kind, payload)` writes and emits realtime via outbox to `user:{target_user_id}`.
- RLS applies: a user can read only their own notifications.

Depends on: E3.3, E2.6. Refs: Arch §5.1 notification; PRD FR-9.2, FR-9.3.

### STORY-E14.2 — Event consumers: evidence, scoring, promotion, configuration
As a system, I want NotificationService to subscribe to the key domain events.

AC:
- Consumer of `notification.deliver` translates each of the following into notifications: `evidence.pending_review`, `evidence.approved`, `evidence.rejected`, `score.recalculated` (only when Promotion Eligibility flips or level boundary crossed), `promotion.recommended`, `promotion.completed`, `promotion.rejected`, `config.changed.affects_user`.
- Idempotent by `event_id`.
- Integration test covers one instance of each.

Depends on: E14.1, E8.4, E9.5, E13.8, E7.9. Refs: PRD FR-9.1.

### STORY-E14.3 — Notification Center UI
As a user, I want a notification center with filter, pagination, and read/unread state.

AC:
- `/notifications` route (or overlay) lists notifications with unread-first ordering and a read/unread toggle.
- `PATCH /v1/notifications/:id/read` marks as read; bulk "mark all read" action available.
- Unread count rendered as a top-nav badge.
- Realtime updates: new notifications appear without page refresh.

Depends on: E14.1, E5.5. Refs: PRD FR-9.2, FR-9.3.

### STORY-E14.4 — Manager Dashboard "Pending Reviews" and "Stale Reviews" widgets
As a Manager, I want a Pending-Reviews badge and a Stale-Reviews section (> 7 days) so I can act on engagement nudges.

AC:
- Dashboard widget "Pending Reviews" shows the count of evidence in `PENDING_APPROVAL` for the manager's reports.
- Widget "Stale Reviews" lists evidence pending > 7 days, with elevated visual emphasis (warning color, aging indicator).
- Both widgets refresh on realtime `evidence.*` events.

Depends on: E14.3, E8.4, E15.1. Refs: PRD FR-12.1, FR-12.2.

### STORY-E14.5 — Admin report: managers ranked by average evidence review latency
As Admin, I want an organization report ranking managers by review latency.

AC:
- `/analytics/manager-engagement` (ADMIN only) shows a table ranking managers by average evidence review latency over the last 30 days.
- Data sourced from the E8.8 Prometheus histogram via a server-side aggregation query over `approval_records`.
- CSV export available.

Depends on: E8.8, E14.3. Refs: PRD FR-12.3, FR-12.4.

---

## EPIC-15 — 2D Deep Views

### STORY-E15.1 — Dashboard (2D) with role-scoped KPIs
As a user, I want a summary dashboard with role-scoped KPIs, quick links, and a notifications preview.

AC:
- `/dashboard` route renders role-scoped KPIs: Employee (own progression summary), Manager (team summary + pending-review widgets from E14.4), Admin (org-wide KPIs).
- Quick links to Career Map, Analytics (Admin/Manager), Settings (Admin).
- Notifications preview block (last 5).

Depends on: E9.4, E14.4. Refs: PRD FR-11.1–11.3.

### STORY-E15.2 — Analytics (2D): distribution, trends, at-risk
As Manager/Admin, I want distribution charts, trend lines, and at-risk lists.

AC:
- `/analytics` renders: distribution by `(track, level)`; velocity and readiness trends over time; promotion-ready / stalled / at-risk lists.
- Scope respects role: Managers see team-scoped; Admin sees org.
- Charts keyboard-navigable; tabular alternative available.

Depends on: E9.4. Refs: PRD FR-10.1–10.4.

### STORY-E15.3 — Full Employee Profile (2D) with Score Breakdown
As Manager/Admin, I want a forensic Full Profile page for any employee I am authorized to inspect.

AC:
- `/profile/:employee_id` renders complete evidence history, approval history, audit slice for the employee, full score-change timeline, and the Score Breakdown consuming E9.7.
- Shareable URL; RBAC: self, direct manager, Admin.
- Page renders with RSC; client islands for interactive charts.

Depends on: E9.7, E3.5. Refs: PRD §5.4, FR-8.6, FR-8.7.

### STORY-E15.4 — Audit Log Browser (2D) with CSV and PDF export
As Admin/HR, I want an audit log browser with filters and both CSV and PDF export.

AC:
- `/audit` route; role-scoped (own / team / all per E3.5).
- Filters: actor, event_type, entity, date range; cursor pagination.
- CSV export reuses E3.5 endpoint; PDF export renders a server-side PDF of the filtered result set.
- Accessibility: keyboard-navigable filter controls, screen-reader table markup.

Depends on: E3.5. Refs: PRD FR-8.4, FR-8.5.

### STORY-E15.5 — HR Calibration Queue (2D)
As HR, I want a single surface listing all employees currently in `ELIGIBLE` or `CALIBRATION_HOLD` state so I can run calibration sessions.

AC:
- `/analytics/calibration-queue` (HR only) lists: Eligible without recommendation; Recommended awaiting approval; Currently flagged; Recently promoted (last 30 days).
- Each row exposes eligibility date, manager, track, level transition, recommendation-narrative excerpt.
- One-click actions: open Detail Panel; open Calibration Flag resolution modal (from E13.6).
- Filterable by track, team, manager, level transition.

Depends on: E13.3, E13.4, E13.6. Refs: PRD FR-10.5, §6.8.

### STORY-E15.6 — Bootstrap Eligibility Snapshot explorer (2D, HR)
As HR, I want to view the immutable snapshot captured at each `CALIBRATION → ACTIVE` transition and compare against current state.

AC:
- `/analytics/bootstrap-snapshots` (HR only) lists transitions; selecting a transition renders per-employee snapshot rows with current-state comparison.
- Export the full snapshot as CSV for compliance.
- Data sourced from `bootstrap_eligibility_snapshots` and `rollout_mode_transitions` (E7.10).

Depends on: E7.10. Refs: PRD FR-10.6, §8.9.

### STORY-E15.7 — Manager Approval Pattern Report (2D, HR)
As HR, I want per-manager promotion analytics so I can detect outliers.

AC:
- `/analytics/manager-approval-patterns` (HR only) shows per-manager: promotions recommended (count), eligibility-to-recommendation latency distribution, Performance Narrative length distribution, rejection rates.
- Tabular + chart view; CSV export.
- Data sourced from `promotion_records`, `promotion_recommendations`, `score_snapshots`.

Depends on: E13.2, E13.4, E9.4. Refs: PRD FR-10.7, §11.10.

---

## EPIC-16 — Operational Hardening & Production Readiness

### STORY-E16.1 — Grafana dashboards shipped in-repo
As an operator, I want the full Grafana dashboard set committed and deployed via CI.

AC:
- `ops/grafana/` contains dashboard JSON for: API (RED metrics), Workers (queue depth/duration, DLQ), Realtime (connected clients, disconnect rate, fanout latency), 3D client FPS distribution, Evidence review latency per manager.
- A CI job provisions dashboards to dev/staging Grafana on merge to main.
- Dashboards documented in `docs/ops/dashboards.md`.

Depends on: E1.7, E4.2, E5.5, E8.8, E11.8. Refs: Arch §11.2, §11.6.

### STORY-E16.2 — SLO-driven alerts wired to pager + chat
As an on-call operator, I want alerts for the SLO thresholds in Arch §11.5.

AC:
- Prometheus alert rules for: API 5xx > 1% over 5 min (page); DLQ depth > 0 for any queue (page); recalc p95 > 60 s sustained 10 min (warn); DB pool > 85% (warn); BullMQ backlog > 5000 (warn); realtime disconnect rate > 5% / 5 min (warn).
- Alertmanager routes pages to pager, warns to chat channel.
- Each alert links to the matching runbook.

Depends on: E16.1. Refs: Arch §11.5.

### STORY-E16.3 — Runbooks
As an on-call engineer, I want written runbooks for the top incident classes.

AC:
- `docs/ops/runbooks/` contains runbooks for: recalc-backlog, outbox-relay-stuck, oidc-outage, 3d-fps-crater, presigned-url-failure, rls-deny-all.
- Each runbook: symptom checklist, dashboards to open, mitigation steps, escalation path.
- Runbook links match the alert links from E16.2.

Depends on: E16.2. Refs: Arch §11.6.

### STORY-E16.4 — Load test suite (500-node 3D FPS, recalc storm, WS fanout)
As a team, I want automated load tests so regressions are visible before production.

AC:
- A 500-node 3D FPS test exercises `/map` against a seeded 500-employee org and asserts ≥30 fps sustained.
- A recalc-storm test triggers a configuration change against a 10k-employee synthetic org and asserts bulk queue does not starve the interactive queue (interactive p95 < 30 s throughout).
- A WS fanout test holds 2000 sustained clients and measures disconnect rate < 5%.
- Tests are idempotent and runnable in staging; documented in `docs/ops/load-tests.md`.

Depends on: E9.6, E11.4, E5.1. Refs: Arch §16 T-load-test; NFR-1.1, NFR-1.5.

### STORY-E16.5 — Disaster-recovery drill (Postgres PITR + S3 versioning rollback)
As an operator, I want a documented, rehearsed DR drill.

AC:
- A staging drill restores Postgres to a point-in-time ≤15 min in the past and validates app functionality end-to-end.
- An S3 versioning rollback drill recovers a noncurrent evidence object version.
- RPO ≤ 24 h + ≤15 min PITR and RTO < 2 h validated and documented in `docs/ops/dr-drill.md`.

Depends on: E1.5. Refs: Arch §12.5.

### STORY-E16.6 — Security hygiene automation (Renovate, Trivy, SBOM, secret-scan)
As a security engineer, I want automated supply-chain hygiene.

AC:
- Renovate Bot configured for dependency auto-PRs on `apps/*` and `packages/*`.
- Trivy scans every CI image; failures with CVSS ≥7 block merge to main.
- SBOM generated per build and retained in the artifact registry.
- Pre-commit hook + CI job scan for secret patterns.

Depends on: E1.6. Refs: Arch §12.6.

### STORY-E16.7 — Cross-tenant regression suite and pre-signed URL scope tests
As a team, I want automated proof that tenant isolation holds as new repositories are added.

AC:
- A test harness seeds two orgs per test; every repository added by domain epics includes at least one dual-org cross-read assertion in its test suite.
- Pre-signed URL tests: an evidence URL issued under org-A's key cannot fetch bytes stored under org-B's key.
- CI enforces presence of the dual-org assertion via a lint rule on repository-test files.

Depends on: E2.6, E8.3. Refs: Arch §17 AR-4, AR-5.

### STORY-E16.8 — Snapshot/audit partition lifecycle automation and 3D long-session memory test
As an operator, I want ongoing partition maintenance and a long-session 3D memory check.

AC:
- A weekly job ensures 3 months of partitions exist ahead for `score_snapshots` and `audit_events`; a monthly job moves `score_snapshots` partitions older than 12 months to cold storage and `audit_events` partitions older than 24 months to cold storage.
- A 1-hour scripted 3D session asserts JS heap growth < 20% of baseline and no leaked detached DOM nodes.
- Sentry memory breadcrumbs enabled on the client.

Depends on: E9.4, E3.6, E11.8. Refs: Arch §6.3, §6.4, AR-8, AR-9.

### STORY-E16.9 — Penetration-test readiness checklist
As an enterprise buyer, I want a pen-test-ready posture documented even though the test itself is post-MVP.

AC:
- `docs/security/pen-test-readiness.md` catalogs: auth flows, RBAC layer map, data classification, evidence file access control, audit reproduction, rate-limit posture, known non-goals.
- OWASP Top 10 self-assessment completed and linked.
- A named owner sign-off recorded.

Depends on: E1.9, E2.6, E8.3. Refs: Arch §12.6.

---

## Appendix A — Story Counts by Epic

| Epic | Stories |
|---|---:|
| E1 Platform & Operational Foundations | 9 |
| E2 Identity, SSO, Tenancy & RBAC | 7 |
| E3 Audit Spine & Outbox/Event Infrastructure | 6 |
| E4 Async Job Infrastructure | 6 |
| E5 Realtime Gateway & Push Infrastructure | 5 |
| E6 Organization Bootstrap & CDF Seeding | 6 |
| E7 Configuration Domain | 11 |
| E8 Evidence Lifecycle, Storage, Review & Expiry | 8 |
| E9 Scoring & Forecasting Engine | 8 |
| E10 3D Map Data Contract & Projection API | 4 |
| E11 3D Career Map Rendering & Interaction Core | 8 |
| E12 3D Navigation Shell, Filters, Detail Panel | 10 |
| E13 Promotion Workflow & Track Transfer | 11 |
| E14 In-App Notifications & Manager Nudges | 5 |
| E15 2D Deep Views | 7 |
| E16 Operational Hardening & Production Readiness | 9 |
| **Total** | **120** |

---

## Appendix B — Major Dependency Chain (Story-Level Spine)

The critical path through story-level dependencies:

```
E1.1 → E1.2 → E1.4 → E2.1 → E2.2 → E2.4 → E2.5 → E2.6
                                                      │
                                                      ▼
                              E3.1 → E3.2 → E3.3 → E3.4
                                                      │
                                                      ▼
                                              E4.1 → E4.2 → E4.3
                                                                  │
                                                                  ▼
                                                          E5.1 → E5.3 → E5.4 → E5.5
                                                                                    │
                                                                                    ▼
                              E6.1 → E6.2 → E6.3 → E6.4 → E6.5
                                                                  │
                                                                  ▼
                              E7.1 → E7.2 → E7.4 → E7.5 → E7.9 → E7.10
                                                                           │
                                                                           ▼
                                      E8.1 → E8.2 → E8.4 → E8.7
                                                                 │
                                                                 ▼
                                      E9.1 → E9.4 → E9.5 → E9.7 → E9.8
                                                                         │
                                                                         ▼
                                      E10.1 → E10.2 → E10.3 → E10.4
                                                                         │
                                                                         ▼
                                      E11.1 → E11.3 → E11.4 → E11.5 → E11.7
                                                                              │
                                                                              ▼
                                      E12.1 → E12.4 → E12.5 → E12.6 → E12.9
                                                                              │
                                                                              ▼
                                      E13.1 → E13.2 → E13.3 → E13.4 → E13.7 → E13.8 → E13.10
                                                                                                    │
                                                                                                    ▼
                                                                              E14.1 → E14.2 → E14.3
                                                                                                    │
                                                                                                    ▼
                                                                                      E15.1 → E15.3 → E15.5
                                                                                                            │
                                                                                                            ▼
                                                                                                    E16.1 → E16.4
```

Key parallelizable windows:
- Once E3.3 lands, **E4.x** and **E5.x** progress in parallel.
- Once E7.1 lands, **E8.x** (evidence) and **E10.1** (projection) can progress in parallel.
- **E11.x** (3D rendering) can prototype against stubbed `/map/employees` in parallel with **E9.x** (scoring).
- **E15.x** (2D deep views) shares almost nothing with **E13.x** (promotion) at the UI layer.

---

## Appendix C — Implementation Blockers (Known, Flagged for Pre-Sprint Resolution)

The following are **not product blockers** — they are decisions the team needs to make early to avoid rework. None blocks starting E1.

| # | Blocker | Recommendation | Owning Decision |
|---|---|---|---|
| IB1 | Cloud provider selection (AWS / GCP / Azure) for managed Postgres, Redis, S3-equivalent, secret manager | Pick in E1.5 before Terraform modules are written; architecture is provider-neutral | Team / Platform lead |
| IB2 | OIDC IdP used for staging/dev testing | Set up one free-tier IdP (Auth0 dev tenant or similar) before E2.2 | Team |
| IB3 | Grafana / OTEL / Sentry hosting (managed vs. self-hosted) | Pick before E1.7; architecture is vendor-neutral | Ops / Platform lead |
| IB4 | Reference desktop hardware definition for the FPS budget | Codify in E16.4 before the 500-node load test; otherwise the pass/fail threshold is subjective | Product / Engineering |
| IB5 | CSV roster template and validator error codes contract | Lock the CSV schema before E6.5 so pilot customers don't see breaking changes | Product |
| IB6 | PDF export rendering library (server-side) | Pick before E15.4 (headless-chrome vs. a Node PDF library); affects container size and memory | Engineering |
| IB7 | Exact Fibonacci weight mapping for the seeded requirements | Product confirms the CDF-to-weight mapping before E6.3 | Product |
| IB8 | The "At Risk" signal's exact threshold (low confidence + long stall) | Product confirms the threshold before E11.7; architecture says "low confidence + long stall", PRD §14.3 confirms the visual but not the numeric threshold | Product |

---

*Stories Breakdown — Fibonacci Career Map (FCM) — Version 1.0 Draft — 2026-04-19*
*Status: Ready for Implementation Planning / Sprint Sequencing. Continues from Epic Breakdown v1.0.*
