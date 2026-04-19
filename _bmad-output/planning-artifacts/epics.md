---
title: "Epic Breakdown: Fibonacci Career Map (FCM)"
status: "draft"
version: "1.0"
created: "2026-04-18"
updated: "2026-04-18"
workflowType: "epics"
project_name: "FCM"
user_name: "Emilio"
pm_agent: "John"
scope: "Epics only — stories intentionally deferred to next workflow step"
inputDocuments:
  - "docs/MVP/mvp_documentation/MVP of FCM APP.pdf"
  - "_bmad-output/brainstorming/brainstorming-session-2026-04-18-1500.md"
  - "_bmad-output/planning-artifacts/product-brief-FCM.md"
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
---

# Epic Breakdown: Fibonacci Career Map (FCM)

**Version:** 1.0 — MVP Epics
**Status:** Draft — Stories Deferred to Next Workflow
**Date:** 2026-04-18

---

## 1. Purpose and Scope

This artifact defines the **production-oriented epic breakdown** for the FCM MVP, sequenced in a realistic implementation order for build in VS Code. It is the direct feeder to the Epics-and-Stories workflow.

This document:

- Defines the epic list only
- Sequences epics in a practical build order
- Sets clean, production-minded epic boundaries
- Covers every architectural commitment in the approved Architecture §19 Implementation Readiness Checklist
- Preserves every product invariant the PRD locks down
- Calls out major dependencies between epics

This document **intentionally does not**:

- Generate stories (next workflow step — `bmad-create-epics-and-stories`)
- Restate the PRD or architecture
- Prescribe story-level acceptance criteria
- Specify code, libraries beyond what the architecture already fixes, or file layouts beyond the architecture's proposed tree

---

## 2. Invariants Preserved in This Breakdown

| Constraint | How this breakdown honors it |
|---|---|
| FCM is a career progression intelligence platform, not a visualization gimmick | Domain epics (Scoring, Forecasting, Evidence, Promotion, Audit, Configuration) carry more weight than the 3D epics; the 3D is the *surface*, not the *feature*. |
| The 3D map is the primary home screen, navigation, and exploration model | Three distinct 3D epics (Projection, Rendering Core, Navigation Shell + Panels) are sequenced into the core build, not deferred. |
| 2D views are intentional deeper modes | One consolidated 2D Deep Views epic, sequenced *after* the 3D shell so the 3D remains the default experience. |
| Organization-configured rules are essential | A dedicated Configuration Domain epic, distinct from Seeding. |
| CDF is a seeded editable default | Seeding and Configuration are separate epics — the seed is provisioning; configuration is continuous admin editing. |
| Auditability and explainability are first-class | Audit Spine epic is built *early* (epic 3), before any domain mutation can happen. |
| Recalculation is deterministic and asynchronous | Async Job Infrastructure is its own epic and precedes Scoring; Scoring engine is built on pure, deterministic functions. |
| Score Progress, Readiness %, Promotion Eligibility are distinct | Enforced at the data model, API, and UI layers across Scoring, Promotion, and 3D Panel epics. |
| ETA and Confidence are always paired | Scoring & Forecasting engine epic computes and persists them into the same snapshot record. |
| Production-ready from first commit | Platform Foundations epic establishes auth, environments, observability, CI/CD, and migrations before any domain code. |
| Promotion is a human decision, not a computed outcome | Promotion epic (E13) owns the Manager Recommendation + Performance Narrative + approval-chain commit; eligibility is never a sufficient condition. The system surfaces eligibility and enforces discipline, but a Manager's narrative + configured approval workflow is what commits a promotion. |
| Enterprise-safe visibility default | Configuration epic (E7) ships `OWN_ONLY` as the seeded default; the Map Data Contract epic (E10) enforces server-side anonymization for non-visible peer nodes, preserving organizational shape without leaking identity. |
| Organizational Rollout Mode as first-class safety gate | Seeding epic (E6) provisions new organizations with `promotion_mode = CALIBRATION` by default; Configuration epic (E7) exposes the Rollout-Mode admin surface and the Bootstrap Eligibility Snapshot capture; Promotion epic (E13) enforces the mode server-side on every promotion-mutating endpoint. |
| HR / People persona is operational, not configuration-only | HR-specific surfaces (Calibration Queue, Calibration Flag, Rollout-Mode control, Bootstrap Eligibility Snapshot explorer, Manager Approval Pattern report) are split across Promotion (E13) and 2D Deep Views (E15) epics — HR has dedicated analytics surfaces alongside the configuration surfaces. |
| Development context lives alongside progression data | Detail Panel epic (E12) owns Manager Development Notes with `PRIVATE` / `SHARED_WITH_EMPLOYEE` visibility and one-way share transition, so managers can capture 1:1 context next to the scoring data they are reviewing. |

---

## 3. Build Order Rationale

The sequence follows a **skeleton → plumbing → domain → experience → hardening** arc:

1. **Skeleton (E1–E3):** monorepo, auth, audit. Without these, nothing else can be built production-grade.
2. **Plumbing (E4–E5):** async jobs and realtime fanout. Every domain downstream depends on these channels.
3. **Tenant Content (E6–E7):** organization bootstrap, CDF seed, then the admin-editable configuration domain.
4. **Core Domain (E8–E9):** evidence lifecycle then the scoring + forecasting engine that feeds every progression output.
5. **Core Experience (E10–E12):** the 3D career map — data contract, rendering core, then navigation shell and panels.
6. **Completeness (E13–E15):** promotion workflow, notifications, 2D deep views.
7. **Hardening (E16):** operational readiness beyond the per-epic baseline — load, drills, SLO tuning, cold-tier archival automation.

**No epic is a "polish" epic**, and the 3D is not the last step. The 3D must be running before promotion flows complete because "Initiate Promotion" lives in the 3D detail panel.

---

## 4. Epic List (Implementation Order)

### EPIC-1 — Platform & Operational Foundations

**Goal.** Stand up the production-credible skeleton: monorepo, both app runtimes, managed data stores, migrations tooling, CI/CD, environments, and observability baseline. After this epic, the team can deploy an empty app end-to-end through dev → staging → prod.

**Scope (in).**
- Monorepo per architecture §18 (`apps/web`, `apps/api`, `packages/domain-contracts`, `packages/scoring-core`, `infra/`).
- NestJS modular monolith scaffold with dual-mode bootstrap (API mode and worker mode from the same codebase).
- Next.js 14+ App Router scaffold with dark-mode theme, TailwindCSS + CSS variables, shadcn/ui base, TanStack Query, Zustand.
- Prisma + schema baseline; migration tooling integrated into CI; pre-deploy migration job convention.
- Managed Postgres 15+, Redis 7+, S3-compatible object storage provisioned via IaC (Terraform) across dev / staging / prod.
- Container builds, Kubernetes manifests, ingress, HPA conventions for API and worker fleets.
- Observability baseline: pino structured logs with correlation IDs, Prometheus `/metrics` (auth-gated), OpenTelemetry SDK wired end-to-end, Sentry browser + Node.
- Health probes `/healthz`, `/readyz`; worker heartbeat.
- Secrets management via cloud secret manager; zero secrets in code or images.

**Scope (out).** Any domain logic (Identity, Config, Evidence, etc.).

**Architectural commitments.** AG1, AG7; AD-1, AD-10, AD-12.

**Depends on.** Nothing.

---

### EPIC-2 — Identity, SSO, Tenancy & RBAC Backbone

**Goal.** Deliver production-grade authentication, org-scoped tenancy, and three-layer RBAC. After this epic, every subsequent domain service inherits correct ActorContext, correct role enforcement, and correct tenant isolation for free.

**Scope (in).**
- OIDC / SSO integration via openid-client + NextAuth session cookie; refresh flow.
- Bootstrap admin fallback (bcrypt username/password), automatically disabled after the first OIDC-linked Admin exists.
- Server-side session store in Redis; forced logout / session revocation; 24h expiry + 2h idle.
- ActorContext propagation through REST, WebSocket, and BullMQ job payloads.
- Role model `(user_id, organization_id, role)` with EMPLOYEE / MANAGER / ADMIN.
- **Layer 1 (API edge):** global AuthGuard, `@Roles` decorator, CORS lock-down.
- **Layer 2 (domain):** ActorContext-accepting service pattern, resource-level authorization helpers, self-approval guard primitive.
- **Layer 3 (data):** Postgres Row-Level Security policies on every tenant-scoped table, `app.current_org_id` setting applied per request and per job.
- OIDC-outage admin recovery codes issued at org bootstrap; runbook stub.
- Cross-organization integration test asserting RLS denies cross-org reads.

**Scope (out).** Any business-specific authorization rules (evidence approver chain, promotion self-approval) — the *primitives* land here; domain epics consume them.

**Architectural commitments.** AG5; AD-8, AD-11.

**Depends on.** E1.

---

### EPIC-3 — Audit Spine & Outbox/Event Infrastructure

**Goal.** Build the immutable audit log, the transactional outbox, and the outbox relay worker. After this epic, any later domain operation writes audit events and emits fanout events *by inserting outbox rows in its own transaction* — with a guaranteed at-least-once delivery, filtered, partitioned, and queryable store behind them.

**Scope (in).**
- `audit_events` table, partitioned monthly by `occurred_at`, JSONB before/after with GIN indexes, append-only.
- Database-level append-only enforcement: `INSERT`-only role grant + BEFORE UPDATE/DELETE trigger raising.
- `outbox_events` table; post-commit LISTEN/NOTIFY trigger feeding the relay.
- Outbox relay worker (BullMQ `audit.outbox-relay` queue consumer) writing to `audit_events`, enqueueing downstream jobs, and publishing realtime fanout messages. At-least-once with idempotent consumers; `event_id` de-dup contract.
- Event-type taxonomy and AuditEvent payload contract formalized in `domain-contracts`.
- Role-scoped audit read API (own / team / all) with filter predicates (actor, event_type, entity, date range).
- Audit export contract (CSV) endpoint skeleton; PDF export deferred into E15 where the admin UI lives.
- Partition-maintenance scheduled job (scaffold; creates partitions N months ahead).
- DLQ and depth alert for the outbox relay queue.

**Scope (out).** Domain-specific event emissions (they land in each domain epic). Audit browser UI (E15).

**Architectural commitments.** AD-7; §9.3, §9.4, §10.

**Depends on.** E1, E2.

---

### EPIC-4 — Async Job Infrastructure (BullMQ)

**Goal.** Stand up all job queues, retry/backoff, dead-letter handling, idempotency primitives, and cron schedulers. After this epic, any later epic that needs asynchronous work plugs in a consumer against a pre-existing queue with pre-agreed semantics.

**Scope (in).**
- BullMQ module (`@nestjs/bullmq`) and NestJS worker bootstrap.
- Queue definitions per architecture §7.2: `scoring.recalc-employee`, `scoring.recalc-org-bulk`, `evidence.expiry-scan`, `snapshot.partition-maintenance`, `notification.deliver`, `observability.client-metrics`. (`audit.outbox-relay` lives in E3.)
- Per-queue concurrency, backoff, max-attempts, rate-limit, DLQ wiring.
- Idempotency registry `recalc_jobs(employee_id, triggering_event_id)` with `FOR UPDATE` pattern.
- Cron scheduler pattern (daily, weekly).
- Internal admin tool for DLQ inspection + re-enqueue.
- `recalculation_pending` / `recalculation_stale` status primitives exposed in the domain-contracts package for later UI consumption.
- Prometheus metrics per queue (depth, duration histogram, DLQ depth); DLQ depth → page alert.

**Scope (out).** Any business logic inside a consumer (lands in E8, E9, E13, E14).

**Architectural commitments.** AD-5; AG4; §7.

**Depends on.** E1, E2.

---

### EPIC-5 — Realtime Gateway & Push Infrastructure

**Goal.** Deliver the Socket.IO gateway, Redis adapter for horizontal scale, room model, and room-join authorization. After this epic, domain epics publish events by writing outbox rows, and clients in the right rooms receive filtered, authorized, real-time updates.

**Scope (in).**
- Socket.IO server integrated into `fcm-api` with Socket.IO Redis adapter.
- Handshake authentication using the same session JWT as REST.
- Room taxonomy: `user:{user_id}`, `org:{organization_id}`, `employee:{employee_id}`, `manager-team:{manager_user_id}`.
- Room-join authorization enforcing visibility / RBAC (no non-Admin joins `org:*`, etc.).
- Outbound event filter: every event pruned per recipient's visibility rule before emission.
- Event-type contract catalog (in `domain-contracts`): `snapshot.updated`, `evidence.*`, `promotion.*`, `recalc.*`, `config.changed` — emitters land in later epics.
- Client Socket.IO hook and TanStack Query cache-invalidation integration in `fcm-web`.
- Polling fallback at `/latest-snapshot` with `If-Modified-Since` semantics (30s cadence on WS failure).
- Realtime-specific metrics: connected clients, disconnect rate, fanout latency.

**Scope (out).** The actual event emissions (land in E8, E9, E13, E14).

**Architectural commitments.** AD-6; §8; AR-7.

**Depends on.** E1, E2, E3 (outbox), E4 (relay worker).

---

### EPIC-6 — Organization Bootstrap & CDF Seeding

**Goal.** Deliver the one-shot provisioning path that brings a new organization from "we have OIDC configured" to "employees appear as nodes on the 3D map." Explicitly treat the CDF seed as an **editable starting template**, not a hardcoded model.

**Scope (in).**
- `organizations` entity and tenant provisioning flow (slug, name, OIDC config, visibility default, approval workflow default).
- Configuration schema — tables for `career_tracks`, `levels`, `layers`, `requirements`, `promotion_rules` — established *as data*, not code constants.
- `SeedingService` that populates a fresh org with the CDF defaults: Software Engineering L1–L5, Architecture L4–L5, Management L3–L5; Capability / Delivery / Influence layers; Fibonacci default weights (1, 2, 3, 5, 8, 13, 21); default promotion rules; default visibility `OWN_ONLY`; default approval workflow `SINGLE`; default **Rollout Mode `CALIBRATION`** (new organizations ship in calibration posture; promotion initiation suppressed org-wide until an Admin transitions to `ACTIVE` per E7).
- First-Admin bootstrap flow (fallback credentials, then swap to OIDC-linked Admin).
- Employee roster CSV bulk import (`POST /employees/bulk-import`) with validation, dry-run preview, and error reporting.
- Assign employees to `(track, level)` at the time of import.
- Audit events emitted for every bootstrap action.
- Integration test: seed → assign → fetch map employees returns the expected shape (validates the full tenant-ready path).

**Scope (out).** Admin-editable CRUD UI for configuration (E7). HR roster sync from HRIS (V2).

**Architectural commitments.** AG5; §5.1 (organization module, SeedingService).

**Depends on.** E1, E2, E3.

---

### EPIC-7 — Configuration Domain (Admin-Editable Career Model)

**Goal.** Deliver the admin-facing CRUD domain for every configurable dimension in PRD §8, with impact preview, audit logging, and the `ConfigurationChanged` event that later drives bulk recalculation. This is what makes FCM an org-configurable platform instead of a CDF-locked product.

**Scope (in).**
- CRUD for Career Tracks, Levels (non-overlapping score bands enforced via exclusion constraint), Layers, Requirements (weight, mandatory flag, evidence type, expiry period), Promotion Rules.
- CRUD for Visibility Rules (OWN_ONLY / TEAM / ORG_SUMMARY / ORG_FULL). Visibility settings govern both detail access and **map-level anonymization**: under `OWN_ONLY` the Map Data Contract (E10) renders all non-self nodes as anonymous shape placeholders; escalation to broader visibility is an explicit Admin action and is audited.
- CRUD for Approval Workflows (SINGLE / DUAL_MANAGER / HR_GATE), including per-level override.
- **Rollout Mode management surface** (Admin-only): view current mode and last transition; transition `CALIBRATION → ACTIVE` requires a mandatory rationale ≥100 characters and triggers synchronous Bootstrap Eligibility Snapshot capture inside the same transaction (architecturally enforced per architecture §5.4 and §6.2). Reverse transition (`ACTIVE → CALIBRATION`) allowed with rationale, does not re-snapshot. Org-wide banner event fans out via the realtime gateway on transition.
- Change-impact preview: "this will affect N employees" computed and shown before save (FR-6.8).
- Emission of `ConfigurationChanged` domain event on save via outbox; bulk recalc consumer lands in E9.
- Audit logging on every field change (before/after values).
- Admin Settings screens (2D) for the full configuration surface, role-gated to Admin.

**Scope (out).** Bulk recalc fanout consumer (lives inside E9 where scoring exists). Any non-admin view of configuration.

**Architectural commitments.** §5.1 (configuration module), §5.4 (configuration change transactional shape).

**Depends on.** E1, E2, E3, E4, E5, E6.

---

### EPIC-8 — Evidence Lifecycle, Storage, Review & Expiry

**Goal.** Deliver the end-to-end evidence flow: employee submits, manager reviews, approval/rejection with mandatory reasons, expiry, and retroactive rejection — all riding direct-to-S3 uploads with zero API-handled bytes. After this epic, the system has a valid stream of approved evidence for the scoring engine to consume.

**Scope (in).**
- `evidence` entity with state machine: DRAFT → PENDING_APPROVAL → APPROVED / REJECTED → EXPIRED.
- Pre-signed S3 upload slot flow (`upload-slot` + `finalize`), 15-min TTL, content-length bounded, org-scoped keys `org/{organization_id}/evidence/{employee_id}/{uuid}/{filename}`.
- Pre-signed retrieval flow with RBAC + visibility checks, 10-min TTL.
- `approval_records` for every decision (actor, decision, reason, timestamp).
- Approve / reject with mandatory reason (min length enforced per PRD 6.3); self-approval prohibited at domain layer.
- Admin/HR-level approve/reject path with separate permission check.
- Retroactive rejection of `APPROVED` evidence → triggers recalc + flags audit with date discrepancy.
- Evidence expiry cron consumer (`evidence.expiry-scan`): daily 02:00 UTC, transitions APPROVED → EXPIRED on past `expires_at`, enqueues recalc with synthetic `EvidenceExpired` triggering event, writes audit + notification via outbox.
- Emits `EvidenceSubmitted`, `EvidenceApproved`, `EvidenceRejected`, `EvidenceExpired` onto the event bus.
- Manager review latency metric emitted for observability (feeds the nudges epic and the ops dashboards).

**Scope (out).** Scoring recalculation itself (E9). Notifications center UI (E14). Evidence submission UI inside the detail panel (lands in E12 where the panel is built; this epic ships the API and the backing services).

**Architectural commitments.** AD-9; §5.1 (evidence module), §5.4 (evidence approval transactional shape), §9.1–§9.2.

**Depends on.** E1, E2, E3, E4, E5, E6.

---

### EPIC-9 — Scoring & Forecasting Engine (Core, Orchestrator, Snapshots, Bulk Recalc)

**Goal.** Deliver the **architectural heart** of FCM: the deterministic, asynchronous calculation engine that produces the three distinct outputs — Score Progress, Readiness %, Promotion Eligibility — and the paired ETA + Confidence. This engine is the single source of truth for every progression signal in the product.

**Scope (in).**
- **Pure calculation core** in `packages/scoring-core` (zero I/O): `calculateScore`, `calculateReadiness`, `evaluateEligibility`, `calculateETA`, `calculateConfidence`. Explicit `now` parameter; no hidden clocks.
- Unit test suite asserting determinism: same inputs → same outputs across thousands of permutations.
- **ScoringOrchestrator** (consumer of `scoring.recalc-employee`): loads inputs as-of `triggering_event.occurred_at`, calls the pure functions, writes a single `score_snapshots` row containing **all five** outputs atomically, emits `ScoreRecalculated` via outbox.
- Score Progress / Readiness % / Promotion Eligibility persisted as three distinct columns on the snapshot — enforcing the PRD invariant at the data model.
- `score_snapshots` monthly partitioning per architecture §6.3; `employee_current_snapshot` materialized view refreshed via trigger on insert.
- `inputs_hash` (SHA-256 of evidence set + config version) on every snapshot for reproducibility.
- Idempotency enforcement via `recalc_jobs` registry from E4.
- **Bulk recalculation on configuration change:** consumer of `scoring.recalc-org-bulk`, rate-limited, fans out per-employee jobs with a shared `triggering_event_id`, emits progress events to realtime for the "Recalculation pending (N/M)" admin UI.
- **Score Breakdown API** (`GET /employees/:id/score-breakdown`): returns the contributing evidence list, weights, approvers, and per-item subtotals derived from snapshot + joins (not recomputation) — PRD §10.3 explainability.
- Forecast window selector contract: 3 / 6 / 12 months (affects display semantics; velocity remains 90-day).
- New-employee edge-case handling (velocity = 0 → "Insufficient data" + Low confidence).
- `recalculation_pending` / `recalculation_stale` flags surfaced on the employee DTO for UI consumption (FR-5.12).

**Scope (out).** The 3D map rendering of these values (E11, E12). Promotion workflow enforcement using `promotion_eligible` (E13).

**Architectural commitments.** AG3, AG4; AD-3 (readiness encoding inputs), §5.2 (scoring module is the architectural heart); §6.3; §7; §9.4.

**Depends on.** E1, E2, E3, E4, E5, E6, E7, E8.

---

### EPIC-10 — 3D Map Data Contract & Projection API

**Goal.** Deliver the server-shaped, RBAC-enforced backing API that the 3D canvas consumes. The client is **never** trusted to hide data it receives; all filtering happens server-side. This is a thin but non-trivial epic because it locks in the exact contract the 3D consumes.

**Scope (in).**
- `mapprojection` NestJS module: pure math converting `(track, level, band_position)` into spiral coordinates given an org configuration.
- `GET /map/projection`: returns the spiral shape for the current org config version (tracks, levels, layers, geometric seed data the client's Web Worker uses to regenerate geometry deterministically).
- `GET /map/employees`: returns `{ employee_id (nullable when anonymized), track_id, level_id, band_position (0–1), score (nullable), readiness_pct (nullable), promotion_eligible (nullable), eligibility_state, at_risk (nullable), anonymized }[]`, server-shaped per viewer role and per org Rollout Mode.
- **Enterprise-safe anonymization** enforced server-side: when the viewer's visibility scope (per E7 Visibility Rules) excludes a subject, the node is emitted with `anonymized = true`, `employee_id` replaced by an opaque per-render token, and all identity/score/readiness/eligibility fields `null`. Track / level / band_position remain populated to preserve the organizational shape visible on the map. Anonymized nodes are non-clickable. This guarantees the `OWN_ONLY` default map experience preserves FCM's "see where you are in the whole" effect without leaking any peer identity.
- **Rollout Mode overlay** at the contract boundary: when `organization.promotion_mode = CALIBRATION`, `eligibility_state` reports `PENDING_CALIBRATION` for anyone who would otherwise be `ELIGIBLE`. This guarantees no client variant can render a "promotion-ready" affordance during calibration mode, regardless of client bugs.
- Response headers `X-FCM-Rollout-Mode` and `X-FCM-Visibility-Scope` emitted so the client can banner appropriately without a second round-trip.
- Manager default filter scope = "My Team" (FR-2.15, §14.5).
- Cache-key strategy keyed on `(organization_id, config_version)` for the projection; per-request auth-scoped shaping for the employees call (**viewer_id + visibility_scope + promotion_mode** included in the cache key or bypassed entirely).
- Realtime integration: `snapshot.updated`, `config.changed`, and `organization.promotion_mode.changed` events invalidate client-side cache in-place (partial update, no full re-render).
- Integration tests asserting: (a) `OWN_ONLY` viewer never receives any `employee_id` other than their own; (b) `TEAM` viewer never receives identity for non-team peers; (c) `CALIBRATION`-mode org produces no node with `eligibility_state = 'ELIGIBLE'`.

**Scope (out).** Any client rendering (E11). Any interactive UI (E12).

**Architectural commitments.** §5.1 (mapprojection module), §13.3 (map data contract), T9 (server-shaped over client-shaped).

**Depends on.** E2 (RBAC), E7 (config), E9 (snapshot data).

---

### EPIC-11 — 3D Career Map Rendering & Interaction Core

**Goal.** Deliver the 3D canvas as a **real product surface**, not a retrofit: React Three Fiber scene, InstancedMesh nodes, 3-tier LOD, BVH raycasting, Web Worker geometry, bounded performance budget. This is the product's primary home screen; it ships with operational telemetry from day one.

**Scope (in).**
- R3F scene graph; declarative, data-driven from `/map/projection` and `/map/employees`.
- Spiral geometry generator in a Web Worker; result cached in IndexedDB keyed by `(organization_id, config_version)` and regenerated only on config change.
- `InstancedMesh` for employee nodes; per-instance color, opacity, emissive intensity, pulse phase via `InstancedBufferAttribute`.
- 3-tier LOD: near (full detail + labels), mid (simplified), far (clustered billboards with count glyphs and configurable threshold).
- Frustum culling + track-segment occlusion pass.
- BVH-accelerated raycasting (`three-mesh-bvh`); throttled 60Hz hover, single-cast pointer-up click.
- OrbitControls (damped); reset-view tween.
- Promotion-Ready emissive pulse driven by shader uniform — **bound to `promotion_eligible`, never to `readiness_pct`**. `prefers-reduced-motion` → static halo alternative.
- Readiness encoding: per-instance opacity + emissive blended from `readiness_pct`; minimum 40% opacity clamp so 0%-readiness nodes remain clickable.
- Single bloom post-processing pass on the emissive channel.
- Level color coding: L1 blue / L2 teal / L3 purple / L4 tan / L5 silver (per reference artifacts).
- Performance budget enforcement and instrumentation: FPS histogram, dropped frames, draw calls, triangle count, JS heap for the scene; end-of-session beacon to `/metrics/client`.
- Persistent 3D canvas across non-3D routes (scene preserved in memory, regenerates only on config change).

**Scope (out).** Filters panel, detail panel, and hover tooltip (E12). Any employee-action UI (E12, E13).

**Architectural commitments.** AG2; AD-3; §4.3; AR-1.

**Depends on.** E1, E10.

---

### EPIC-12 — 3D Navigation Shell, Filters Panel & Employee Detail Panel

**Goal.** Deliver the interaction layer that makes the 3D canvas usable: top-nav ("Career Map / Dashboard / Analytics / Settings"), left-side Filters panel, hover tooltip, click-to-detail Employee Panel as an overlay over the persistent 3D scene, and the accessible list-view fallback. After this epic, users can explore the organization entirely inside the 3D context.

**Scope (in).**
- Top navigation bar with four entries; Career Map as default landing.
- Left Filters panel: Career Track checkboxes with live employee counts; Level checkboxes (L1–L5); session-persisted selections (FR-2.13).
- Hover tooltip (name, level, track) — lightweight, throttled.
- Employee Detail Panel slide-in from right; 3D canvas remains visible and rotatable behind it (FR-3.2).
- Panel content surfaces **three visually distinct outputs** (Score Progress, Readiness %, Promotion Eligibility) and a **paired ETA + Confidence** (FR-3.6, FR-3.7).
- Capability / Delivery / Influence layer breakdown with progress bars and percentages.
- Next Requirements list.
- Forecast window selector (3 / 6 / 12 months).
- Role-gated panel actions:
  - Employee on own panel: Submit Evidence (wired to E8 API).
  - Manager on report's panel: Approve / Reject pending evidence inline (wired to E8 API).
  - "Initiate Promotion" button rendered but wired in E13; suppressed entirely when the organization's Rollout Mode is `CALIBRATION` and replaced with the "Eligible — Pending Calibration" label.
  - "Flag for Calibration" action visible to HR only on any employee in `ELIGIBLE` state (wired in E13; requires reason ≥40 chars).
  - "View Full Profile" link for Manager and Admin (wired in E15).
- **Manager Development Notes tab** (FR-3.14) — visible to Manager and HR on a direct-report's panel; notes may be marked `PRIVATE` (Manager/HR only) or `SHARED_WITH_EMPLOYEE` (additionally visible to the Employee). Share is a one-way transition (a shared note cannot be un-shared) and audited. Intended as the in-system surface for 1:1 performance context — the "soft layer" alongside scores.
- Panel visibility-rule enforcement: peer panel strips score / ETA / evidence / development notes if viewer's role + visibility rule disallows. For an Employee viewing a peer node they are permitted to see, Score / ETA / Confidence / Development Notes are never exposed (FR-3.17).
- **Rollout Mode awareness:** when `organization.promotion_mode = CALIBRATION`, the panel renders a top-of-panel banner ("Your organization is in calibration; promotion workflow is paused") visible to Managers and HR; Employees see the reworded Eligibility label without the operational banner. The banner consumes the `X-FCM-Rollout-Mode` header and live `organization.promotion_mode.changed` realtime event.
- Realtime integration: `snapshot.updated` for the open employee updates panel in place.
- Reset-camera control; close-panel returns to 3D canvas with node deselected.
- **Accessible "List View" toggle** — swaps the 3D canvas for a screen-reader-friendly table equivalent using the same data feed. This is the compliance fallback for users who cannot operate the 3D surface.
- `aria-label` summary of the 3D view.

**Scope (out).** Initiate Promotion wiring (E13). Full Profile page (E15). Audit browser (E15). Notifications center (E14).

**Architectural commitments.** AG2; §4.2, §4.4, §4.5, §4.6.

**Depends on.** E5, E8, E9, E10, E11.

---

### EPIC-13 — Promotion Workflow & Track Transfer

**Goal.** Deliver the promotion lifecycle end-to-end as a **human-authored decision mediated by the system**: the server-side Promotion Eligibility gate, the Manager Recommendation with mandatory Performance Narrative, the HR Calibration Flag intervention path, the org-level Rollout Mode gate, the approval flow per configured workflow (SINGLE / DUAL_MANAGER / HR_GATE), and the track transfer path. Enforce **Promotion Eligibility, never Readiness %**, at every decision point — and enforce that eligibility is necessary, not sufficient.

**Scope (in).**
- `promotion_records` entity with approval-chain state machine.
- `promotion_recommendations` entity — append-only table storing the Manager's Performance Narrative (≥200 characters, DB CHECK constraint) and the Recommendation commit timestamp. The Narrative is immutable after write.
- `calibration_flags` entity — HR-applied hold on any employee in `ELIGIBLE` state or any pending promotion; OPEN / RESOLVED_RELEASE / RESOLVED_REJECT states with partial unique index guaranteeing at most one open flag per employee.
- `POST /employees/:id/promotions`: re-verifies Promotion Eligibility server-side AND Rollout Mode = `ACTIVE` AND no open Calibration Flag AND `performance_narrative` ≥200 chars; rejects with structured errors naming the specific failing condition for each failure mode (FR-7.4, FR-7.10, FR-7.12, FR-7.13).
- `POST /promotions/:id/recommend` — Manager commits the Recommendation + Performance Narrative, opening the approval chain. The Recommendation write is what opens the workflow; the level change happens only at Promotion commit after the chain is complete.
- `POST /employees/:id/calibration-flags` (HR only) — opens a Calibration Flag with mandatory reason ≥40 chars; blocks any promotion approval path until resolved.
- `PATCH /calibration-flags/:id/resolve` (HR only) — resolves with `RESOLVED_RELEASE` (lifts the hold) or `RESOLVED_REJECT` (persists as organizational context, does not lift the underlying eligibility computation but does end the active hold state) plus optional resolution note.
- Approval workflow execution honoring the per-org / per-level configuration from E7.
- Self-approval prohibited: actor cannot approve a promotion they initiated or recommended; a second Admin is required for counter-sign when workflow demands it.
- Single-transaction commits (§5.4): Recommendation, Calibration Flag set/resolve, Promotion commit are each atomic; outbox-delivered audit + notification + 3D refresh.
- Emits `promotion.completed` → 3D canvas node-reposition animation (interfaces with E11 instance updates and E12 panel state).
- Rejection at any approval step: reason recorded, employee notified, no level change.
- **Track transfer flow:** score archived (previous level preserved in history), new track starts fresh at the target level (PRD §14.6 conservative default). Full history retained for audit.
- **Rollout Mode enforcement at every promotion-mutating endpoint:** when `organization.promotion_mode = CALIBRATION`, endpoints respond `409 ORG_IN_CALIBRATION_MODE` and the rejection itself is audited.
- "Initiate Promotion" button in the Employee Detail Panel becomes interactive, enabled only when `promotion_eligible = true` AND Rollout Mode = `ACTIVE` AND no open Calibration Flag. The initiate action opens a Performance Narrative composition modal (≥200-char counter, save-and-submit).
- End-to-end integration tests asserting the four independent gate paths: (a) high-Readiness-%, low-Eligibility employee cannot be promoted; (b) Eligible employee in CALIBRATION-mode org cannot be promoted; (c) Eligible employee with open Calibration Flag cannot be promoted; (d) Eligible employee with missing Performance Narrative cannot be promoted.

**Scope (out).** Notifications center UI (E14 owns the render; this epic emits the events). HR Calibration Queue analytics view (owned by E15). Dev Notes affordance in detail panel (owned by E12).

**Architectural commitments.** §5.1 (promotion module + developmentnotes module), §5.4 (promotion, recommendation, calibration-flag, rollout-mode transactional shapes); §6.2 (new tables); PRD §6.5, §6.8, §6.9, §7.5, §11.7.

**Depends on.** E3, E5, E7, E8, E9, E12.

---

### EPIC-14 — In-App Notifications & Manager Engagement Nudges

**Goal.** Deliver the in-app notification center and the manager-engagement nudges that resolve PRD blocker #1 (manager engagement). Every cross-user business event becomes a persistent notification with read/unread state, pushed in real time.

**Scope (in).**
- `notifications` entity + NotificationService.
- Event consumers: pending evidence review, evidence approval / rejection, score change events, promotion initiation / decision, configuration change affecting the user (FR-9.1).
- Realtime delivery via the `user:{user_id}` room from E5.
- Notification center UI with read / unread state, filter, and pagination.
- **Manager Dashboard widgets (nudges):** "Pending Reviews" badge with count; "Stale Reviews" section (>7 days) with elevated visual emphasis (FR-12.1, FR-12.2).
- **Admin-only organization report:** managers ranked by average evidence review latency (FR-12.3).
- Review latency metric emitted from E8 is surfaced in this epic's Admin report and in Prometheus (FR-12.4).
- Email and Slack channels are **explicitly out of scope** (FR-9.4) — this epic does not wire them.

**Scope (out).** Email / Slack integration (V2). Full Dashboard page (E15 covers the broader dashboard; this epic contributes the nudge widgets).

**Architectural commitments.** §5.1 (notification module); §14.1 (manager engagement).

**Depends on.** E3, E5, E8, E9, E13.

---

### EPIC-15 — 2D Deep Views: Dashboard, Analytics, Full Profile, Audit Browser

**Goal.** Deliver the intentional deeper modes: Dashboard (summary KPIs), Analytics (distribution, trends, at-risk), Full Employee Profile (forensic investigation surface, the only context in which a user leaves the 3D for a person), and Audit Log Browser (Admin / HR compliance surface). These are *deliberately* secondary to the 3D.

**Scope (in).**
- **Dashboard (2D):** role-scoped KPIs, quick links, pending actions, notifications preview (FR-11.1–11.3).
- **Analytics (2D):** org or team-level distribution by track and level; promotion-ready / stalled / at-risk lists; aggregate velocity and readiness trends over time (FR-10.1–10.4); role-scoped.
- **Full Employee Profile (2D):** complete evidence history, approval history, audit trail slice for the employee, full score change timeline, Score Breakdown section consuming the E9 explainability API. Shareable URL. Manager sees own reports; Admin sees all.
- **Audit Log Browser (2D):** filter by actor, event type, target entity, date range (FR-8.4); CSV and PDF export (FR-8.5); role-scoped (own / team / all).
- **HR Calibration Queue (2D, HR-only):** lists all employees currently in `ELIGIBLE` or `CALIBRATION_HOLD` state, sortable by eligibility date, manager, track, level; each row supports one-click navigation into the employee's Detail Panel and into the Calibration Flag resolution action (FR-10.5). This is the operational surface HR uses before and during promotion cycles.
- **Bootstrap Eligibility Snapshot Explorer (2D, HR-only):** once the organization has transitioned from `CALIBRATION` → `ACTIVE`, HR can view the immutable snapshot captured at transition, compare any employee's state-at-transition against current state, and export the snapshot for compliance (FR-10.6).
- **Manager Approval Pattern Report (2D, HR-only):** per-manager counts of promotions recommended, eligibility-to-recommendation latency distribution, Performance Narrative length distribution, and rejection rates — the calibration-support surface that helps HR detect outlier managers without weaponizing the data (FR-10.7).
- Full keyboard navigation and screen-reader labeling (NFR-10.4, 10.5) across all six surfaces.
- Dimmed or replaced-canvas transition from 3D into these modes per PRD §5.3.

**Scope (out).** The 3D canvas itself (done in E11, E12). Any surface that is properly a *primary* interaction (that lives in the 3D).

**Architectural commitments.** §4.2 (route layout); PRD §5.3 (deeper modes), §5.4 (Full Profile role).

**Depends on.** E3 (audit), E7 (config), E8, E9, E13.

---

### EPIC-16 — Operational Hardening & Production Readiness

**Goal.** Beyond the per-epic observability baseline, bring the system to an operationally defensible production posture: SLO alerts, runbooks, load and DR drills, cross-tenant regression guardrails, cold-tier archival, and security hygiene automation.

**Scope (in).**
- Grafana dashboards shipped in-repo (`ops/grafana/`), deployed via CI, covering API, workers, queues, realtime, 3D client FPS, evidence review latency.
- SLO-driven alerts wired into pager + chat per §11.5: API 5xx rate, DLQ depth, recalc duration p95, DB pool saturation, BullMQ backlog, realtime disconnect rate.
- Runbooks in `docs/ops/runbooks/` (§11.6): recalc backlog, outbox relay stuck, OIDC outage, 3D FPS crater, pre-signed URL issuance failure, RLS deny-all incident.
- **Load test suite:**
  - 500-node 3D render FPS verification against the performance budget.
  - Recalc storm test: configuration change over a 10k-employee org; verify bulk queue does not starve interactive queue.
  - WebSocket fanout at sustained scale; disconnect rate under load.
- **Disaster recovery drill:** Postgres PITR restore into staging; S3 versioning rollback; validate RPO ≤ 24h + ≤15 min PITR, RTO < 2h.
- **Security hygiene automation:** Renovate Bot, Trivy container scanning in CI, SBOM generation per build, secret-scanning in pre-commit + CI.
- **Cross-tenant regression suite** (expanded from the E2 scaffold): every new repository added by domain epics is covered by a dual-org cross-read assertion.
- **Pre-signed URL scope regression tests:** evidence URLs issued for org-A cannot fetch bytes stored under org-B keys.
- **Snapshot and audit partition automation:** weekly jobs create partitions N months ahead; archival job moves partitions to cold-tier storage starting month 13.
- **Client memory creep verification:** long-session profile for the 3D canvas (1h+) asserting no runaway heap growth; Sentry memory breadcrumbs.
- Penetration-test readiness checklist (the test itself is post-MVP).

**Scope (out).** Any new product feature. Multi-region active-active (explicit non-goal).

**Architectural commitments.** AG7; §11; §12.5, §12.6; §17 (risk mitigations).

**Depends on.** All prior epics.

---

## 5. Dependency Graph (Epic Level)

```
E1 ──► E2 ──► E3 ──► E5 ──► E6 ──► E7 ──► E8 ──► E9 ──► E10 ──► E11 ──► E12 ──► E13 ──► E14 ──► E15 ──► E16
         │     │      ▲      │      │      │      │       │       │       │       │       ▲
         │     │      │      │      │      │      │       │       │       │       │       │
         │     └──────┼──────┼──────┼──────┼──────┼───────┼───────┼───────┼───────┼───────┘
         │            │      │      │      │      │       │       │       │       │
         └────────────┴──────┴──────┴──────┴──────┴───────┴───────┴───────┴───────┘
                      │
                      └── E4 (Async Jobs) feeds: E3 (relay), E5 (fanout), E7 (config bulk event), E8 (expiry), E9 (recalc), E14 (notification.deliver)
```

### Key Dependency Notes

| Dependency | Why it exists |
|---|---|
| E3 (Audit) before any domain epic | Every domain mutation emits audit via outbox. Building audit late forces retrofits. |
| E4 (Async) before E8 (Evidence) | Evidence approval enqueues recalc jobs; evidence expiry needs cron. |
| E4 (Async) before E9 (Scoring) | The Scoring Orchestrator is a BullMQ consumer. |
| E5 (Realtime) before E8 / E9 / E13 / E14 | Every domain event fans out to a room; without the gateway, the UX regresses to stale-until-refresh. |
| E6 (Seeding) before E7 (Config CRUD) | The configuration schema must exist and be seeded before the CRUD UI is meaningful to build or test. |
| E7 (Config) before E9 (Scoring) | Scoring consumes configuration (bands, weights, promotion rules). Config change also triggers bulk recalc consumed inside E9. |
| E8 (Evidence) before E9 (Scoring) | Scoring sums approved evidence; without the evidence stream there is nothing to compute. |
| E9 (Scoring) before E10 (Map API) | `/map/employees` exposes `readiness_pct`, `promotion_eligible` etc. — these must be real values from real snapshots. |
| E10 (Projection) before E11 (Render) | The client cannot render without a data contract. |
| E11 (Render) before E12 (Panels) | Panels hang off node clicks; need a canvas to click into. |
| E11 + E12 before E13 (Promotion) | "Initiate Promotion" lives inside the detail panel on the 3D canvas. |
| E9 + E13 before E14 (Nudges) | Nudges render review-latency and pending-review data emitted by Evidence + Scoring + Promotion. |
| E13 before E15 (Full Profile) | The Full Profile exposes the complete promotion history. |
| E16 depends on everything | Hardening cannot precede the systems being hardened. |

### Parallelizable Work Windows

- **E4 and E5** can progress in parallel once E3 is done — different engineers, minimal conflict.
- **E10 API work** can start in parallel with **E8 (Evidence)** once E7 is done, because `/map/projection` is independent of evidence.
- **E11 (3D rendering)** can be prototyped in parallel with **E9 (Scoring)** against stubbed data, merging on the real `/map/employees` contract when E9 + E10 are ready.
- **E15 (2D deep views)** shares almost nothing with **E13 (Promotion)** at the UI layer and can be built alongside.

---

## 6. Coverage Audit vs. Architecture §19 Implementation Readiness Checklist

| Architecture commitment | Epic(s) |
|---|---|
| Identity & SSO | E2 |
| Organization bootstrap + CDF seeding | E6 |
| Configuration domain | E7 |
| Evidence lifecycle | E8 |
| Evidence storage | E8 |
| Scoring engine | E9 |
| Forecasting engine | E9 (merged) |
| Promotion workflow | E13 |
| Audit system | E3 |
| Async job infrastructure | E4 |
| Realtime gateway | E5 |
| 3D Career Map | E10 + E11 + E12 |
| 2D deep views | E15 |
| Notification center | E14 |
| Observability baseline | E1 (scaffold) + E16 (hardening) |
| Environment topology | E1 + E16 |
| Security hardening | E2 (RBAC/RLS) + E16 (pen-test readiness, scans, partition archival) |

Every item in the architecture's implementation-readiness checklist is covered, and none of the seven architect-level open questions (AO1–AO7) land in a late-stage epic.

---

## 7. What This Artifact Is Not

- It is not stories. Each epic will be decomposed into stories in the next workflow step.
- It is not a re-specification of the PRD or architecture — both remain authoritative.
- It is not an implementation plan at the code or file level — that belongs in per-story technical notes.
- It is not a schedule or estimation. Ordering is implementation-sensible but not timeboxed.

---

## 8. Next Workflow

- Next step: `bmad-create-epics-and-stories` to expand each epic above into production-ready stories with acceptance criteria, cross-referenced back to PRD FR-IDs and architecture sections.
- No stories are created in this artifact. This deferral is intentional per the PM brief for this pass.

---

*Epic Breakdown — Fibonacci Career Map (FCM) — Version 1.0 Draft — 2026-04-18*
*Status: Ready for Epics-and-Stories Workflow (`/bmad-create-epics-and-stories`). Stories intentionally deferred.*
