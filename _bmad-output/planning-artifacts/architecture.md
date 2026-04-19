---
title: "Architecture Document: Fibonacci Career Map (FCM)"
status: "draft"
version: "1.0"
created: "2026-04-18"
updated: "2026-04-18"
workflowType: "architecture"
project_name: "FCM"
user_name: "Emilio"
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/product-brief-FCM.md"
  - "_bmad-output/brainstorming/brainstorming-session-2026-04-18-1500.md"
  - "docs/MVP/mvp_documentation/MVP of FCM APP.pdf"
  - "docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_45_09 AM.png"
  - "docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_46_35 AM.png"
---

# Architecture Document: Fibonacci Career Map (FCM)

**Version:** 1.0 — MVP Architecture
**Status:** Draft — Ready for Epics & Stories Workflow
**Date:** 2026-04-18

---

## 1. Purpose and Scope

This document defines the production-grade MVP architecture for **Fibonacci Career Map (FCM)**, a career progression intelligence platform navigated through an interactive 3D career map.

It translates the validated PRD (v1.0) into an implementable system design. It is the direct input for epic/story generation and implementation planning. It does not re-specify product behavior: for business rules, consult the PRD.

### Scope

- System shape and major components
- Frontend and 3D interaction architecture
- Backend modular boundaries (domain-oriented)
- Data model direction (logical, not physical DDL)
- Asynchronous recalculation and job architecture
- Evidence storage flow
- Authentication and RBAC architecture
- Audit/event strategy
- Observability posture
- Environment and deployment topology
- API and integration posture
- Resolution of all seven PRD-flagged architect-level open questions (AO1–AO7)

### Out of Scope for This Document

- Epics and stories (next workflow)
- Concrete DDL/migrations (implementation artifact)
- UI component library selection at the widget level (frontend implementation artifact)
- Hard cloud-provider vendor lock-in (we specify "managed equivalents")

---

## 2. Architecture Goals, Principles, and Non-Goals

### 2.1 Goals

| # | Goal |
|---|---|
| AG1 | Ship a production-credible MVP on day one: real auth, real environments, real audit, real observability |
| AG2 | Preserve the 3D career map as a first-class, performant, maintainable surface — not a retrofit |
| AG3 | Enforce the PRD's three-output business rule (Score / Readiness / Promotion Eligibility) consistently from database to rendered pixel |
| AG4 | Keep recalculation deterministic, asynchronous, idempotent, and auditable |
| AG5 | Keep org-scoping (tenancy) correct and defense-in-depth from the first commit, so SaaS multi-tenancy is a scaling step, not a rewrite |
| AG6 | Keep backend modular enough that future service extraction is possible without re-architecting the domain |
| AG7 | Keep operational readiness baked in: structured logs, metrics, tracing, dead-letter queues, runbooks |

### 2.2 Principles

1. **Modular monolith over microservices for MVP.** Domain boundaries drawn as NestJS modules with explicit public interfaces. Extraction path exists; premature extraction does not.
2. **Deterministic core, asynchronous periphery.** Scoring/forecasting are pure functions over snapshotted inputs; jobs are idempotent orchestration around them.
3. **3D is a real product surface, not a gimmick.** It gets a dedicated rendering architecture, a performance budget, and server-side data shaping.
4. **Authoritative gate in backend, informational signal in UI.** Promotion Eligibility is enforced server-side; Readiness % is never a gate anywhere.
5. **Org-scope everything.** Every domain entity, every query, every API call carries `organization_id` from JWT claim to row-level security policy.
6. **Append-only audit, outbox-delivered.** Audit events are published via the transactional outbox pattern and written to an immutable partitioned log.
7. **Evidence bypasses the API for bytes.** Pre-signed direct-to-S3 upload/download; API holds only metadata and access decisions.
8. **Observability is not optional.** Correlation IDs, structured logs, Prometheus metrics, OpenTelemetry traces from MVP.
9. **Promotion is a human decision mediated by the system, not automated by it.** The system computes Promotion Eligibility, blocks ineligible actions, and captures the decision rigorously (Manager Recommendation, Performance Narrative, configured approval workflow, Calibration Flag). The system never advances an employee's level from a computed signal alone; a level write is always preceded by a recorded human decision chain.
10. **Organizational posture is a first-class configuration axis.** Rollout Mode (`CALIBRATION` / `ACTIVE`) gates the promotion surface at org level and defaults to `CALIBRATION` on new organizations; transition captures an immutable Bootstrap Eligibility Snapshot. Scoring and recalculation are not affected by the mode — only promotion-initiation surface area is.
11. **Enterprise-safe visibility by default.** Map data is shaped server-side under the visibility rule. The default posture anonymizes non-visible peer nodes while preserving organizational shape (track/level/score band) so the map works without leaking identity.

### 2.3 Non-Goals (Architectural)

- Event-sourced rewrite of state (state-of-record is relational; audit is a supplementary append-only log)
- GraphQL federation (REST/OpenAPI for MVP; GraphQL may be added later if needed)
- Multi-region active-active (single-region MVP with DR backup posture)
- Microservice decomposition at MVP
- Self-hosted Kubernetes cluster as a MVP differentiator (managed cluster preferred)

---

## 3. System Shape (AD-1)

**Decision:** **Modular monolith with independently scaled worker fleet, Next.js frontend, and a thin realtime gateway.**

### 3.1 Top-Level Components

| Component | Role | Runtime |
|---|---|---|
| **fcm-web** | Next.js App Router frontend, React Three Fiber 3D canvas, 2D deep views | Container; CDN-fronted |
| **fcm-api** | NestJS modular monolith exposing REST (OpenAPI 3), WebSocket gateway, and domain services | Container behind L7 load balancer |
| **fcm-worker** | Same NestJS codebase, started in worker-mode; consumes BullMQ queues for recalc, expiry scan, notification delivery, snapshot archival | Container; scaled independently |
| **fcm-postgres** | Managed PostgreSQL 15+; primary system of record | Managed service (RDS / Cloud SQL / Azure Flexible) |
| **fcm-redis** | Managed Redis 7+; job queues (BullMQ), cache, realtime pub/sub fanout | Managed service (ElastiCache / Memorystore) |
| **fcm-objectstore** | S3-compatible object storage for evidence files | Managed service (S3 / GCS / R2) |
| **fcm-oidc-proxy** | OIDC session management at the edge (Next.js middleware + backend validation) | In-process |

### 3.2 Why Modular Monolith

- PRD's domain boundaries are real (Identity, Configuration, Evidence, Scoring, Forecasting, Promotion, Audit, Notification) but heavily **transaction-coupled** (e.g., "approve evidence + enqueue recalc + write audit event" must be atomic). Distributed transactions across services would be the wrong tax to pay for MVP.
- NestJS modules give us:
  - Clear public interfaces per domain (services exported, internals hidden)
  - Independent testability (module-scoped test harnesses)
  - A viable future extraction path (each module has a bounded domain and can become a standalone service if load demands)
- Worker is **the same codebase** in a different process mode. One build, two deployments, no code duplication, identical domain behavior between sync and async paths.

### 3.3 Why Frontend Is Separate

- Next.js has its own runtime, build, and scaling profile (CDN + edge + SSR).
- Keeping the frontend independently deployable means rendering changes (including 3D tuning) ship without blocking API releases.
- The API never serves HTML; the frontend never owns business logic.

### 3.4 Component Interaction Diagram (textual)

```
                          ┌────────────────────────────┐
                          │  Browser (Desktop)         │
                          │  Next.js + R3F 3D canvas   │
                          └──────┬───────────┬─────────┘
                                 │ HTTPS     │ WSS
                                 ▼           ▼
                          ┌────────────────────────────┐
                          │   fcm-web (Next.js)        │
                          │   SSR + static + API proxy │
                          └──────────────┬─────────────┘
                                         │ REST / WS
                                         ▼
                   ┌──────────────────────────────────────────┐
                   │   fcm-api (NestJS modular monolith)      │
                   │   Identity │ Config │ Evidence │ Scoring │
                   │   Forecast │ Promotion │ Audit │ Notif   │
                   │   Realtime Gateway │ MapProjection       │
                   └────┬────────────┬─────────────────┬──────┘
                        │            │                 │
                        ▼            ▼                 ▼
                ┌────────────┐ ┌────────────┐ ┌────────────────┐
                │ PostgreSQL │ │   Redis    │ │ Object Storage │
                │ (primary)  │ │ queues+PS  │ │ (evidence)     │
                └─────┬──────┘ └──────┬─────┘ └────────┬───────┘
                      │               │                │
                      │ LISTEN/NOTIFY │ BullMQ         │ Presigned URLs
                      │               ▼                │
                      │        ┌──────────────┐        │
                      └────────┤  fcm-worker  ├────────┘
                               │  (NestJS in  │
                               │  worker mode)│
                               └──────────────┘
```

---

## 4. Frontend Architecture (AD-2, AD-3)

### 4.1 Framework and Rendering Strategy

- **Next.js 14+ App Router** with a mix of:
  - **Server Components (RSC)** for 2D deep views (Dashboard, Analytics, Settings, Full Profile)
  - **Client Components** for the 3D canvas route and any interactive panel state
- **TypeScript strict mode** everywhere.
- **TailwindCSS + CSS variables** for theming (dark mode first).
- **UI primitives:** shadcn/ui (Radix-based) for 2D forms, panels, tables, dialogs. Accessible by default.

### 4.2 Route Layout

| Route | Role | Rendering |
|---|---|---|
| `/` | Redirect to `/map` on auth, or to `/login` otherwise | Edge |
| `/map` | **Primary home.** 3D Career Map canvas with filter rail, detail panel overlay | Client component (inside RSC shell) |
| `/dashboard` | 2D manager/admin summary | RSC + client islands |
| `/analytics` | 2D distribution, trends, at-risk lists | RSC + client charts |
| `/settings/*` | Admin configuration screens | RSC + form islands |
| `/profile/:employeeId` | Full Employee Profile (forensic/audit) | RSC |
| `/audit` | Audit log browser (Admin) | RSC + client filters |

### 4.3 3D Rendering Architecture (resolves AO1)

**Library:** **React Three Fiber (R3F)** over **Three.js**, with **`@react-three/drei`** helpers.

**Design rules:**

1. **Scene graph is declarative and data-driven.** The spiral structure and level bands are generated once from the organization's configuration (tracks × levels × layers) into static geometry; employee nodes are a separate, dynamic instanced layer.
2. **`InstancedMesh` for employee nodes.** A single draw call rendering up to thousands of nodes. Per-instance attributes (color, opacity/brightness, pulse phase) passed via `InstancedBufferAttribute`. This is the decisive choice for 500+ employee performance.
3. **Level-of-Detail (LOD) strategy — three tiers:**
   - **Near tier** (zoom close to a segment): full-detail instanced spheres with per-node outline, label on hover.
   - **Mid tier** (default zoom): instanced spheres, no labels, simplified materials.
   - **Far tier** (whole-org view): clustered aggregate billboards per `{track, level}` bucket with count glyphs; individual nodes hidden. Cluster count > configurable threshold (default 12) triggers aggregation.
4. **Culling:** Frustum culling (built into Three.js) plus a **track-segment occlusion pass** — spiral segments outside camera frustum skip their node instance updates entirely.
5. **Raycasting (click detection):** Use **BVH-accelerated raycast** (`three-mesh-bvh`) against the node instance mesh. Hover uses a throttled 60Hz raycast; click uses a single cast on pointer-up.
6. **Spiral geometry generation:** Runs once per org configuration load, off the main thread via a **Web Worker** (returns `BufferGeometry` attributes to main thread). Cached in `IndexedDB` keyed by `(organization_id, config_version)`.
7. **Promotion-Ready pulse:** Subtle emissive pulse driven by shader uniform (`time`). Accessible alternative: a static ring halo when `prefers-reduced-motion` is set. This visual is bound to Promotion Eligibility `ELIGIBLE`, never to Readiness %.
8. **Readiness encoding:** Per-instance `opacity` + `emissiveIntensity` blended from the server-sent `readiness_pct`. A shader-side clamp prevents "invisible" nodes at 0% (minimum 40% opacity so nodes remain clickable).
9. **Camera:** `PerspectiveCamera` with `OrbitControls` (damped). Reset-view action tweens back via `drei`'s `<CameraControls>` animations.
10. **Post-processing:** Minimal. A single bloom pass on the emissive channel to make the Promotion-Ready pulse legible on dark backgrounds. No SSAO, no DoF for MVP.
11. **Performance budget:**
   - Frame budget: 16.6 ms target (60 fps), 33 ms acceptable (30 fps) at 500 nodes on standard desktop (Intel UHD or equivalent, non-gaming GPU).
   - Draw calls: < 30 per frame (spiral static + 1 instanced node mesh + clusters + helpers).
   - Triangle count: < 250k visible at mid tier.
   - JS heap: 3D scene state < 80 MB.
12. **Instrumentation:** Client reports FPS histogram and dropped-frame count to the API `/metrics/client` endpoint at session end (non-blocking beacon). Prometheus scrapes server-side aggregate.

### 4.4 3D-First Navigation Model

- The 3D canvas is a **persistent layout**, not a destination page. When the user clicks "Settings", the 3D scene is preserved in memory and revealed on return (unless organization config changed, in which case it regenerates).
- The **Employee Detail Panel** is an overlay (absolute-positioned slide-in) managed by client-side state (Zustand store). The 3D canvas remains mounted and rotatable behind it.
- Top navigation ("Career Map" / "Dashboard" / "Analytics" / "Settings") triggers a soft route transition. Non-map routes render on top of a dimmed, frozen 3D canvas or replace it entirely — PRD calls these "intentional deeper modes."

### 4.5 State and Data Fetching

- **TanStack Query (React Query)** for all server data. Query keys namespaced by `organization_id` from session. Background refetch on focus disabled for 3D data (too expensive); driven instead by WebSocket invalidations.
- **Zustand** for transient client state (selected node, panel open/closed, filter selections, camera pose). Persisted to `sessionStorage` per PRD FR-2.13.
- **WebSocket client** (Socket.IO) for score/snapshot change events. On event, TanStack Query cache is invalidated for affected employee IDs; 3D instance attributes update in-place (no re-render of the scene).

### 4.6 Accessibility

- All 2D views fully keyboard-navigable and screen-reader labeled (per PRD NFR-10.4, 10.5).
- 3D canvas: `aria-label` summary of the current view and visible cohort. A **"List view" toggle** sits next to the 3D canvas that swaps it for an accessible table equivalent — this is the compliance fallback for users who cannot use the 3D surface and is cheap to ship because the data is already fetched.

---

## 5. Backend Modular Boundaries (AD-4)

### 5.1 Domain Modules (NestJS)

Each module is a self-contained NestJS module with: entities (TypeORM/Prisma models), repository, service, controller (REST), optional WebSocket gateway, domain events, and tests. Inter-module calls go through exposed services only.

| Module | Owns | Exposes |
|---|---|---|
| **identity** | User, Organization, RoleAssignment, Session | `UserService`, `SessionService`, OIDC controllers |
| **organization** | Organization bootstrap, CDF seeding, member roster, Rollout Mode state (`CALIBRATION`/`ACTIVE`), Bootstrap Eligibility Snapshot capture | `OrganizationService`, `SeedingService`, `RolloutModeService`, `BootstrapSnapshotService` |
| **configuration** | CareerTrack, Level, Layer, Requirement, PromotionRule, VisibilityRule, ApprovalWorkflow | `ConfigurationService`; emits `ConfigurationChanged` domain events |
| **evidence** | Evidence entity, lifecycle state machine (DRAFT → PENDING_APPROVAL → APPROVED/REJECTED/EXPIRED) | `EvidenceService`; emits `EvidenceApproved`, `EvidenceRejected`, `EvidenceExpired` |
| **scoring** | Pure scoring/readiness/eligibility calculation, ScoreSnapshot persistence | `ScoringService` (pure, deterministic); `SnapshotRepository` |
| **forecasting** | ETA and Confidence calculation | `ForecastingService` (pure, deterministic) |
| **promotion** | PromotionRecord, PromotionRecommendation, PerformanceNarrative, CalibrationFlag, approval chain execution, track transfer | `PromotionService`, `RecommendationService`, `CalibrationService`; enforces server-side Promotion Eligibility check (FR-7.4), Rollout-Mode gate (FR-7.13), Calibration Hold gate (FR-7.12), and Performance Narrative min-length (FR-7.10) |
| **developmentnotes** | Manager-authored notes on direct reports with `PRIVATE` / `SHARED_WITH_EMPLOYEE` visibility state and irreversible share transition | `DevelopmentNotesService`; enforces RBAC visibility (FR-3.14); emits `DevelopmentNoteShared` for audit |
| **audit** | AuditEvent append-only log, outbox consumer | `AuditService`; reads only — writes via outbox |
| **notification** | In-app notifications | `NotificationService` |
| **realtime** | WebSocket gateway, Redis pub/sub fanout, per-user/per-org rooms | `RealtimeGateway`, `PublishService` |
| **mapprojection** | Computes spiral coordinates for a given `(track, level, band_position)` tuple | `MapProjectionService` (pure) |
| **filestorage** | S3 client abstraction, pre-signed URL issuance | `FileStorageService` |
| **jobs** | BullMQ queue definitions, worker bootstrap, retry/DLQ config | `QueueService`, per-queue consumer classes |
| **observability** | Logger, tracer, metrics registry | Singleton providers |

### 5.2 Scoring Module Is the Architectural Heart

The Scoring module owns PRD §7 in code. Design rules:

- **Pure functions**: `calculateScore`, `calculateReadiness`, `evaluateEligibility`, `calculateETA`, `calculateConfidence` take explicit inputs (approved evidence list, level config, promotion rule, history window) and return outputs. **No implicit DB reads inside the math.**
- **Orchestration lives outside**: `ScoringOrchestrator` (a job consumer) loads inputs, calls the pure functions, writes the `ScoreSnapshot`, emits `ScoreRecalculated` domain event. This separation is what makes the core testable, deterministic, and reproducible.
- **Snapshot is immutable** once written. Reads are always from the latest snapshot; calculation is never done inline in a read path.
- **Deterministic clocks**: any time-dependent calculation (velocity window, minimum time at level) receives an explicit `now` parameter. Jobs pass the triggering event's timestamp; tests pass a fixed clock.

### 5.3 Module Dependency Graph (acyclic)

```
identity ─────────────────────────────────┐
                                          ▼
organization ──► configuration ──► scoring ──► forecasting
                        │            │           │
                        ▼            ▼           ▼
                     evidence ──► promotion ──► notification
                        │            │           ▲
                        └──► audit ◄─┴───────────┘
                              ▲
                              │ outbox
                              │
                         realtime ◄── jobs ◄── filestorage
                                                   ▲
                                                   └── mapprojection
```

No module imports a "downstream" module. Cross-cutting (audit, realtime, jobs, notification) is driven by domain events, not direct calls.

### 5.4 Transactional Boundaries

A single request/job executes a single DB transaction by default. The high-impact transactions:

- **Evidence approval** (single txn): update Evidence state → write ApprovalRecord → insert outbox rows (audit + score-recalc job enqueue + notification). Commit.
- **Promotion commit** (single txn): insert PromotionRecord → update Employee level → reset level-scoped score inputs → insert outbox rows (audit + notification + 3D refresh). Commit.
- **Configuration change** (single txn): mutate configuration rows → insert outbox rows (audit + bulk-recalc fanout). Commit.
- **Promotion Recommendation** (single txn): verify Eligibility = `ELIGIBLE`, Rollout Mode = `ACTIVE`, no active Calibration Hold, and Performance Narrative ≥200 chars → insert PromotionRecommendation with immutable Performance Narrative → advance approval-chain state → insert outbox rows (audit + notification + watchers). Commit. The Recommendation write is what opens the approval workflow; the level change happens only at Promotion commit after the chain is complete.
- **Calibration Flag set/resolve** (single txn): insert CalibrationFlag row (state `OPEN` / `RESOLVED_RELEASE` / `RESOLVED_REJECT`) with HR actor and reason → if resolving, link to resolution note → insert outbox rows (audit + notification to manager + notification to employee if configured). Commit. The flag's presence is what gates any promotion approval API server-side (FR-7.12).
- **Rollout Mode transition** (single txn): verify Admin actor + rationale ≥100 chars (on CALIBRATION→ACTIVE only) → update `organization.promotion_mode` → on CALIBRATION→ACTIVE, snapshot every employee's current Score / Readiness % / Promotion Eligibility / active CalibrationFlag into the immutable `bootstrap_eligibility_snapshot` table with a single `transition_id` → insert outbox rows (audit + org-wide banner event + manager notification fanout). Commit. Snapshot capture runs inside the same transaction as the mode change so that the "state at transition" claim is bit-exact.
- **Development Note share** (single txn): verify actor is Manager or HR → transition note visibility from `PRIVATE` to `SHARED_WITH_EMPLOYEE` (irreversible) → insert outbox rows (audit + employee notification). Commit.

The **outbox** pattern (§9.3) guarantees audit writes and job enqueues happen if-and-only-if the transaction commits.

---

## 6. Data Model Direction

### 6.1 Principles

- PostgreSQL as single system of record. **No polyglot persistence in MVP.**
- Logical schema, not microservice DB-per-service. Module ownership is enforced at the code layer (repositories), not the database layer.
- Every tenant-scoped table carries `organization_id UUID NOT NULL` (indexed, RLS-policied).
- Soft deletes only where business behavior requires (`deactivated_at`); hard deletes forbidden for audit-relevant entities.
- UUIDs as primary keys (v7 for time-ordering where scans benefit).
- Timestamps: `created_at`, `updated_at` (for mutable tables); audit and snapshot tables are append-only with a single `occurred_at`.

### 6.2 Core Tables (logical)

| Table | Notes |
|---|---|
| `organizations` | tenant root; has `slug`, `name`, OIDC config, visibility rule setting, approval workflow, `promotion_mode` enum (`CALIBRATION` \| `ACTIVE`, default `CALIBRATION`), `promotion_mode_changed_at`, `promotion_mode_changed_by` |
| `users` | authenticated identity; FK to `organizations` |
| `role_assignments` | `(user_id, organization_id, role)` — unique constraint |
| `career_tracks` | org-scoped; `display_order`; unique `(organization_id, slug)` |
| `levels` | FK to track; `score_band_start`, `score_band_end`; CHECK non-overlapping via exclusion constraint |
| `layers` | FK to level; names; display_order |
| `requirements` | FK to layer; type enum; weight INT; mandatory BOOL; expiry_months INT nullable |
| `promotion_rules` | FK to level; min_score, min_time_at_level_months, manager_required, hr_required, blocker_check |
| `employees` | FK to user + track + level; assigned_at; profile metadata |
| `evidence` | FK to employee + requirement; state enum; payload JSONB (text/URL/structured) OR `storage_object_key`; `submitted_at`, `approved_at`, `expires_at` |
| `approval_records` | FK to evidence_id OR promotion_record_id; actor_id; decision enum; reason; `decided_at` |
| `score_snapshots` | FK to employee; level_id at time of snapshot; score, readiness_pct, promotion_eligible BOOL, eta_months, confidence enum, triggering_event_id; `occurred_at`; **append-only** |
| `promotion_records` | FK to employee; from_level_id, to_level_id; approval chain state; `initiated_at`, `completed_at` |
| `track_transfers` | FK to employee; from_track_id, to_track_id; reason; `transferred_at` |
| `notifications` | FK to user; kind enum; payload JSONB; read_at |
| `audit_events` | **append-only** partitioned; organization_id; actor_id; event_type; entity_type; entity_id; before JSONB; after JSONB; reason; `occurred_at` |
| `outbox_events` | transactional outbox; `published_at` nullable; picked up by relay |
| `recalc_jobs` | idempotency registry: `(employee_id, triggering_event_id)` unique; status |
| `promotion_recommendations` | FK to promotion_record_id + manager_id; `performance_narrative TEXT NOT NULL CHECK (char_length(performance_narrative) >= 200)`; `recommended_at`; append-only (no UPDATE/DELETE at DB role) |
| `calibration_flags` | FK to employee_id + flagger_id (HR); state enum (`OPEN` \| `RESOLVED_RELEASE` \| `RESOLVED_REJECT`); open_reason TEXT NOT NULL CHECK (≥40 chars); resolution_note TEXT nullable; `opened_at`, `resolved_at`; partial unique index `(employee_id) WHERE state = 'OPEN'` (at most one open flag per employee) |
| `development_notes` | FK to manager_id + employee_id; body TEXT; visibility enum (`PRIVATE` \| `SHARED_WITH_EMPLOYEE`); `created_at`, `shared_at` nullable; share transition is one-way (enforced by BEFORE UPDATE trigger rejecting reverse transitions) |
| `bootstrap_eligibility_snapshots` | FK to organization_id + transition_id; one row per employee per transition; captures employee_id, level_id, score, readiness_pct, promotion_eligible, calibration_flag_open, occurred_at; **append-only**; partitioned by `RANGE (occurred_at)` quarterly |
| `rollout_mode_transitions` | FK to organization_id + actor_id; from_mode, to_mode, rationale TEXT (CHECK ≥100 chars only when from_mode='CALIBRATION'); `transitioned_at`; append-only |

### 6.3 ScoreSnapshot Partitioning (resolves AO4 — part 1)

- `score_snapshots` partitioned by `RANGE (occurred_at)` monthly.
- Retention policy: hot (last 12 months) on primary storage; older partitions moved to a cold read-only tablespace (still queryable, cheaper storage). MVP ships with monthly partitions and a scheduled job creating partitions 3 months ahead; archival to cold storage is automated from month 13.
- Indexes: `(employee_id, occurred_at DESC)` for latest-snapshot lookup; `(organization_id, occurred_at)` for tenant-wide analytics.
- **Latest snapshot access** is served via a materialized `employee_current_snapshot` view refreshed within the same transaction that writes a new snapshot (trigger), avoiding per-read scans.

### 6.4 AuditEvent Retention (resolves AO4 — part 2)

- `audit_events` partitioned by `RANGE (occurred_at)` monthly, same partition cadence as snapshots.
- Indefinite retention in MVP per PRD §10.2. Cold-storage archival from month 25+ (configurable retention is a V2 feature — PRD says so).
- JSONB `before`/`after` columns with GIN indexes for field-level investigations.
- Append-only enforcement: app DB role has `INSERT` on `audit_events` only — `UPDATE` and `DELETE` are `REVOKE`'d. A BEFORE UPDATE/DELETE trigger raises an exception as defense-in-depth.

### 6.5 Migration Tooling

- **Prisma** as ORM + migration tool. Reasons:
  - Strong TypeScript integration with NestJS
  - Mature migration workflow in CI/CD
  - Schema-as-source-of-truth readable by all engineers
  - Supports raw SQL for RLS policies, partition management, triggers
- Alternative considered: TypeORM (more NestJS-native but migration ergonomics weaker). **Decision: Prisma.**

---

## 7. Async Recalculation and Job Architecture (AD-5, resolves AO2)

### 7.1 Queue Technology

**Decision:** **BullMQ** on Redis 7+.

**Rationale:**
- Native Node/TypeScript; first-class fit for NestJS (official `@nestjs/bullmq` integration).
- Robust features: retries with backoff, scheduled/cron jobs, job dependencies, rate limiting, priorities, DLQ.
- Operationally proven at relevant scale.
- Redis is already part of the stack for cache + pub/sub, so no new infra.

**Alternative considered:** Temporal.io. More powerful for multi-step workflows, but operationally heavier and introduces a second source of truth. **Rejected for MVP**; revisit for V2 if promotion workflows grow multi-stage with long SLAs.

### 7.2 Queues

| Queue | Trigger | Concurrency | Backoff | DLQ |
|---|---|---|---|---|
| `scoring.recalc-employee` | evidence approval/rejection, evidence expiry, promotion commit | 8 workers default | exponential, base 2s, max 5 attempts | yes |
| `scoring.recalc-org-bulk` | configuration change | 2 workers (rate-limited) | exponential, base 10s, max 5 | yes |
| `evidence.expiry-scan` | cron: daily at 02:00 UTC | 1 worker | exponential, 3 attempts | yes |
| `snapshot.partition-maintenance` | cron: weekly | 1 worker | 3 attempts | yes |
| `notification.deliver` | domain events | 4 workers | exponential, 3 attempts | yes |
| `audit.outbox-relay` | post-commit trigger (listen/notify) | 2 workers | exponential, infinite (poison queue escalates alert) | yes |
| `observability.client-metrics` | frontend beacon | 2 workers | 2 attempts | no (best-effort) |

### 7.3 Deterministic, Idempotent Recalculation

- Every recalc job carries `(employee_id, triggering_event_id)` as an idempotency key.
- Job handler:
  1. `SELECT ... FOR UPDATE` on `recalc_jobs(employee_id, triggering_event_id)`; INSERT if absent, ABORT if already `completed`.
  2. Load inputs: current level config, approved evidence, history window — all as-of `triggering_event.occurred_at`.
  3. Call pure scoring + forecasting functions.
  4. INSERT new `score_snapshots` row.
  5. Mark `recalc_jobs` row `completed`.
  6. Emit `ScoreRecalculated` domain event → notification + realtime fanout via outbox.
- Determinism guarantee: same evidence set + same config version + same `as_of` timestamp → identical snapshot, every time.

### 7.4 Bulk Recalculation (Configuration Change)

- A configuration change emits a single `ConfigurationChanged` event carrying affected `employee_id[]`.
- Bulk job iterates, enqueues a per-employee `scoring.recalc-employee` with the same `triggering_event_id`.
- Per-employee jobs process in parallel up to concurrency cap; UI shows "Recalculation pending (N/M complete)" progress via realtime.
- **Backpressure:** bulk queue rate-limited so a 10k-employee config change does not starve interactive approval recalcs.

### 7.5 Evidence Expiry Job

- Cron 02:00 UTC daily. Scans `evidence WHERE state = 'APPROVED' AND expires_at < NOW()`.
- For each: transition state to `EXPIRED` in a transaction, enqueue recalc with a synthetic `EvidenceExpired` triggering event, write audit + notification via outbox.
- Rate-limited to avoid thundering herd on large orgs; limits configurable per org.

### 7.6 Failure Handling

- Failed job → exponential backoff retry up to 5 attempts.
- After final failure → moved to DLQ → Prometheus alert fires (`fcm_dlq_depth > 0`).
- DLQ jobs are inspectable via an internal admin tool; re-enqueue after fix is a one-click action.
- UI surfaces `recalculation_pending` and `recalculation_stale` states on affected employees (PRD FR-5.12).

---

## 8. Real-Time Update Strategy (AD-6, resolves AO7)

**Decision:** **Socket.IO over WebSocket for push; SSE not used; polling fallback on disconnect.**

### 8.1 Rationale

- **WebSocket (Socket.IO)** gives us bidirectional, room-based pub/sub with battle-tested browser behavior (auto-reconnect, backoff, binary frames).
- **SSE** considered: simpler, HTTP-native, but single-direction and weaker browser support patterns for our use case. Rejected.
- **Polling-only** considered: cheap to build, but 3D map with frequent score updates is a poor fit — stale-until-refresh feels broken in a "live" product.
- **Hybrid:** Socket.IO for push, with a silent polling fallback if WS connection fails (every 30s, `If-Modified-Since` on latest-snapshot endpoint).

### 8.2 Channels (Rooms)

- `user:{user_id}` — personal notifications
- `org:{organization_id}` — org-wide snapshot summaries (for admin Analytics)
- `employee:{employee_id}` — snapshot updates for a specific employee (Manager opens detail panel → joins this room for the session)
- `manager-team:{manager_user_id}` — aggregated events for a manager's team

### 8.3 Event Types

| Event | Payload | Consumers |
|---|---|---|
| `snapshot.updated` | employee_id, score, readiness_pct, promotion_eligible, eta_months, confidence, occurred_at | 3D canvas (updates instance attributes), detail panel |
| `evidence.pending_review` | evidence_id, employee_id, requirement_id | Manager dashboard badge, notification center |
| `evidence.approved` / `evidence.rejected` | evidence_id, reason | Employee notification center, detail panel |
| `promotion.completed` | employee_id, from_level_id, to_level_id | 3D canvas (node reposition animation), notifications |
| `recalc.started` / `recalc.completed` | employee_id, triggering_event_id | UI pending indicator |
| `config.changed` | affected summary | Admin settings UI, triggers map regeneration |

### 8.4 Fanout Architecture

- API writes to `outbox_events`; outbox relay worker reads and publishes to Redis pub/sub channels (matching room names).
- All Socket.IO server instances subscribe to the Redis channels (Socket.IO Redis adapter). This is how horizontally scaled API nodes deliver the same event to any connected client.
- Messages are **small**: they signal "something changed, here are the new values"; clients update local state without re-fetching, unless they were out of sync (version number mismatch → full refetch).

### 8.5 Authorization at the Gateway

- Socket connection authenticates via the same session JWT as REST.
- Room-join requests are validated server-side against visibility/RBAC rules (e.g., a non-Admin cannot join `org:*`).
- Every outbound event is filtered against the recipient's role: Managers receive non-report employee events only at the summary granularity their visibility rule allows.

---

## 9. Evidence Storage and Audit Architecture (resolves AO5)

### 9.1 Evidence Upload Flow

1. **Client requests upload slot:** `POST /evidence/:requirement_id/upload-slot` → server validates requirement is open for the employee, generates a pre-signed S3 PUT URL with scoped key `org/{organization_id}/evidence/{employee_id}/{uuid}/{filename}`, TTL 15 minutes, single-use, content-length range bounded (requirement-configured max).
2. **Client uploads bytes directly to S3.** Browser → S3. API does not see the bytes.
3. **Client finalizes:** `POST /evidence/:requirement_id/finalize` with storage_object_key, metadata (title, description). Server validates the object exists (`HEAD` call), recording `storage_object_key`, `storage_etag`, `content_type`, `size_bytes`. Evidence record transitions DRAFT → PENDING_APPROVAL.
4. **Domain event:** `EvidenceSubmitted` → notification to manager.

### 9.2 Evidence Retrieval Flow

- Authenticated retrieval request → server checks RBAC + visibility → generates pre-signed GET URL, TTL 10 minutes, single-use.
- Client redirects or streams directly from S3.
- Pre-signed URLs **bypass CDN** (signing defeats caching and we don't want to cache personal evidence).
- For high-traffic, non-sensitive presentation assets (profile photos), a signed-cookie CDN distribution with per-org path prefix is used. Evidence files never use this path.

### 9.3 Audit Strategy (AD-7) — Outbox Pattern

- Every state-mutating domain operation inserts one or more rows into `outbox_events` **in the same DB transaction** as the mutation.
- A dedicated **outbox relay worker** (consumer of `audit.outbox-relay` queue, driven by Postgres `LISTEN/NOTIFY` fired on outbox insert) picks up unpublished rows and:
  - Writes to `audit_events` (immutable, partitioned)
  - Fans out realtime events via Redis pub/sub
  - Enqueues downstream jobs (recalc, notification)
- Outbox row is marked `published_at = NOW()` on successful fanout.
- **At-least-once delivery** with idempotent consumers. Duplicate fanouts are tolerated (clients deduplicate by `event_id`).
- Guarantees: if the business operation commits, the audit record is guaranteed to be written. If the transaction rolls back, the outbox row disappears too — no orphan audit or spurious events.

### 9.4 Explainability (PRD §10.3)

- Every `ScoreSnapshot` carries `triggering_event_id` and `inputs_hash` (SHA-256 of the serialized evidence set + config version that produced it).
- The Score Breakdown API returns for any snapshot: the list of contributing evidence items, each with weight, approval_date, approver_id, approver_reason, and the resulting subtotal. This is a DB join, not a recomputation.

---

## 10. Authentication and RBAC Architecture (AD-11, resolves AO3)

### 10.1 Authentication

- **Primary:** OIDC / SSO via **openid-client** (server-side, in fcm-api) paired with **NextAuth.js** (session cookie on fcm-web). Supports any OIDC-compliant IdP (Okta, Azure AD, Google Workspace, Auth0).
- **MVP admin bootstrap fallback:** username/password (bcrypt) for the initial Admin user who configures the OIDC connection (PRD FR-1.2). Disabled after first OIDC-linked Admin exists.
- **Session model:**
  - Front-channel: HTTP-only, Secure, SameSite=Lax session cookie (set by fcm-web after OIDC completion).
  - API calls: fcm-web attaches a short-lived (15 min) JWT bearer token extracted from the session. Refresh via secure server-side endpoint using refresh token held only on fcm-web backend.
  - Revocation: server-side session store (Redis) with org+user indexed entries; admin can force logout.
  - Default expiry: 24h (PRD FR-1.5), idle timeout 2h.

### 10.2 Role Model

Roles per `(user_id, organization_id)`:
- `EMPLOYEE`
- `MANAGER` (always also has employee profile)
- `ADMIN` (can optionally also hold an `EMPLOYEE` role in the same org — two role_assignment rows)

### 10.3 Defense-in-Depth Enforcement (PRD §9.3)

**Layer 1 — API Edge:**
- Global `AuthGuard` (NestJS) validates JWT and populates `request.user = { user_id, organization_id, role }`.
- Route-level `@Roles('ADMIN')` decorators.
- CORS locked to known frontend origins.

**Layer 2 — Domain:**
- Services accept an `ActorContext` parameter. Each service method performs resource-level authorization: "can this actor perform this action on this target?"
- Example: `evidenceService.approve(actor, evidence_id)` verifies `actor` is the direct Manager of the evidence's employee OR has Admin role; otherwise throws `ForbiddenResourceError`.
- Self-approval prohibited at this layer (PRD 9.2).

**Layer 3 — Data:**
- PostgreSQL **Row-Level Security (RLS)** enabled on every tenant-scoped table.
- Policy: `CREATE POLICY org_isolation ON <table> USING (organization_id = current_setting('app.current_org_id')::uuid)`.
- NestJS DB middleware sets `app.current_org_id` per request/job based on actor context.
- This is a belt-and-suspenders safeguard: even if an application-layer query forgets to scope, RLS prevents cross-org leakage.

### 10.4 Tenancy Posture (resolves AO6)

**Decision:** **Shared DB + row-level security + column-based `organization_id` scoping.**

**Why not schema-per-tenant:**
- Operational cost (migrations × N tenants; partition management × N) is too high for MVP scale.
- PRD says multi-tenant admin console is V2; MVP can be single-org per deployment but the code is **built as if** multi-tenant from day one (every entity has `organization_id`).

**Why not DB-per-tenant:**
- Same reasoning, more so. Prevents us from running analytics across tenants for product telemetry.

**MVP posture:**
- One shared DB, all orgs in it.
- Repository layer and RLS enforce org isolation.
- For a future customer demanding physical isolation, the architecture supports a dedicated deployment (same code, dedicated DB/Redis/S3 bucket) with zero code change. The repository pattern means schema-per-tenant could be bolted in later as an advanced option, but we do not invest in it now.

---

## 11. Observability and Operational Readiness (AD-12)

### 11.1 Logging

- **pino** JSON structured logger in all Node processes.
- Every log line includes: `correlation_id`, `user_id`, `organization_id`, `module`, `level`, `message`, `context`.
- Correlation ID injected at edge (Next.js middleware) and propagated via `x-correlation-id` header and OpenTelemetry trace context through to job payloads.
- Log shipping: stdout → container log driver → cloud provider log aggregator (CloudWatch / Cloud Logging / Loki). No per-service log writer in MVP.

### 11.2 Metrics

- **Prometheus** format via `prom-client` (Node) exposed on `/metrics` (internal, auth-gated).
- Standard metrics: HTTP request rate/duration/errors by route, DB pool saturation, BullMQ queue depth, BullMQ processing duration, WebSocket connected clients, recalc duration histogram, DLQ depth.
- Product metrics: evidence review latency (per manager), promotion completion rate, 3D client FPS distribution.
- Grafana dashboards shipped in-repo (`ops/grafana/`) deployed via CI.

### 11.3 Tracing

- **OpenTelemetry SDK** end-to-end: browser beacon → Next.js → fcm-api → fcm-worker → Postgres/Redis spans.
- Exporter: OTLP to a managed collector (Honeycomb, Datadog, Grafana Tempo, or Jaeger self-hosted — vendor-neutral; picked at deploy time).
- Sampling: 100% for errors, 10% head-based for success (cost control).

### 11.4 Error Tracking

- **Sentry** (browser + Node SDKs). Release-tagged. PII scrubbing enabled.

### 11.5 Alerts (SLO-driven)

| Alert | Threshold | Severity |
|---|---|---|
| API 5xx rate | > 1% over 5 min | Page |
| DLQ depth | > 0 for any queue | Page |
| Recalc duration p95 | > 60s sustained 10 min | Warn |
| DB connection pool saturation | > 85% | Warn |
| BullMQ backlog | > 5000 jobs | Warn |
| Realtime disconnect rate | > 5% clients in 5 min | Warn |
| Evidence review latency p50 (per-manager metric) | configurable per org | Informational |

### 11.6 Runbooks

Maintained in `docs/ops/runbooks/` in-repo: "Recalc backlog", "Outbox relay stuck", "OIDC provider outage", "3D client FPS crater", "Pre-signed URL issuance failure", "DB RLS policy deny-all incident".

### 11.7 Health Probes

- `/healthz` (liveness): process is up.
- `/readyz` (readiness): DB, Redis, S3 all reachable; OIDC discovery document accessible.
- Worker health: BullMQ client heartbeat.

---

## 12. Environments and Deployment Topology (AD-10)

### 12.1 Environments

| Environment | Purpose | Data | URL |
|---|---|---|---|
| **dev** | Engineer iteration, PR preview deploys | Synthetic + seeded CDF | `*.dev.fcm.internal` |
| **staging** | Full-stack integration, UAT, release-candidate | Anonymized production-shaped data | `staging.fcm.internal` |
| **prod** | Customer-facing | Real customer data | `app.fcm.<customer-domain>` |

Environment parity: same container images, same IaC, same migrations, differing only in secrets, scaling, and data.

### 12.2 Orchestration

- Containerized (Docker). Multi-arch builds.
- Orchestration: **Kubernetes** (managed: EKS / GKE / AKS) recommended for production; simpler alternative is **AWS ECS Fargate** for teams without Kubernetes operational experience. **Decision: Kubernetes** for MVP to keep horizontal-scale primitives uniform (HPA on API, HPA on worker, separately).
- Ingress: managed load balancer → Ingress controller (NGINX / Traefik) → fcm-api / fcm-web Services.
- fcm-web: optionally deployed to Vercel or a CDN-fronted static+SSR host, with fcm-api accessed via secure egress. Either works; pick per customer deployment model.

### 12.3 Managed Services

| Service | Provider-neutral target |
|---|---|
| PostgreSQL 15+ | RDS / Cloud SQL / Azure Flexible Server |
| Redis 7+ | ElastiCache / Memorystore / Azure Cache |
| Object Storage | S3 / GCS / R2 (S3-compatible API) |
| Secrets | AWS Secrets Manager / Secret Manager / Azure Key Vault |
| Certificate | ACM / Managed Certificate / Key Vault |
| DNS | Route53 / Cloud DNS / Azure DNS |

### 12.4 CI/CD

- **GitHub Actions** pipelines (or GitLab CI; provider-agnostic).
- Pipeline: `lint → typecheck → unit test → integration test → build image → push to registry → deploy (dev auto, staging on merge to main, prod on tag)`.
- Database migrations run as a **pre-deploy job** (`prisma migrate deploy`), not by the app on boot, to avoid concurrent-migration races.
- Feature flags (if needed post-MVP): GrowthBook or LaunchDarkly; not required for MVP scope.

### 12.5 Backup and DR

- Postgres: automated daily snapshots, 30-day retention, point-in-time recovery within 7 days.
- Object storage: versioning enabled on evidence bucket; lifecycle policy archives noncurrent versions to cheaper tier at 90 days.
- Redis: not a source of truth; no backup needed (queues can replay from outbox; cache is regenerable).
- RPO: 24h backup + ≤15 min PITR. RTO: < 2h for single-region restore.

### 12.6 Security Posture

- TLS 1.2+ everywhere (mTLS between internal services optional — not MVP).
- Secrets never in code, env files, or images. Injected at runtime via secret manager.
- Container base images: distroless or minimal Alpine; scanned in CI (Trivy).
- SBOM generated per build; retained in artifact registry.
- Dependency upgrades: Renovate Bot auto-PRs.
- Penetration testing: annual third-party test (post-MVP, pre-enterprise-GA).

---

## 13. API and Integration Posture

### 13.1 API Style

- **REST** over HTTPS. JSON request/response bodies. **OpenAPI 3.1** spec generated from NestJS decorators (via `@nestjs/swagger`) and published as artifact.
- Versioning: URL-prefix `/v1/` from MVP to allow later non-breaking v2 coexistence.
- Pagination: cursor-based (`?cursor=...&limit=50`) on list endpoints; `X-Total-Count` provided where cheap.
- Filtering: predicates via `filter[field]=op:value` syntax, bounded to indexed columns.
- Sorting: `sort=field,-field2`.

### 13.2 Key Endpoint Families (indicative, not exhaustive)

- `POST /auth/oidc/callback`, `POST /auth/logout`, `GET /auth/session`
- `GET /organizations/me`, `PATCH /organizations/me`
- `GET/POST/PATCH /career-tracks`, `.../levels`, `.../layers`, `.../requirements`, `.../promotion-rules`
- `GET/POST /employees`, `GET /employees/:id`, `PATCH /employees/:id`
- `GET /employees/:id/snapshot/latest`, `GET /employees/:id/snapshots`, `GET /employees/:id/score-breakdown`
- `POST /requirements/:id/evidence/upload-slot`, `POST /requirements/:id/evidence/finalize`
- `GET /evidence/:id`, `PATCH /evidence/:id/approve`, `PATCH /evidence/:id/reject`
- `POST /employees/:id/promotions` — creates a PromotionRecord; server-side verifies Eligibility + Rollout Mode = `ACTIVE` + no open Calibration Flag; body requires `performance_narrative` (≥200 chars)
- `POST /promotions/:id/recommend` — Manager commits the Recommendation + Performance Narrative (append-only); opens the approval chain
- `PATCH /promotions/:id/approve`, `PATCH /promotions/:id/reject` — approval-chain transitions; reject Calibration-Held and Calibration-Mode orgs with structured errors
- `POST /employees/:id/calibration-flags` — HR flags an employee for calibration; body requires `reason` (≥40 chars); returns flag ID
- `PATCH /calibration-flags/:id/resolve` — HR resolves with `RESOLVED_RELEASE` or `RESOLVED_REJECT` and optional resolution note
- `GET /organizations/me/promotion-mode` — returns current Rollout Mode + last transition metadata
- `PATCH /organizations/me/promotion-mode` — Admin-only; transitioning `CALIBRATION` → `ACTIVE` requires `rationale` (≥100 chars) and triggers synchronous Bootstrap Eligibility Snapshot capture inside the same transaction
- `GET /organizations/me/bootstrap-snapshots`, `GET /organizations/me/bootstrap-snapshots/:transition_id` — HR access to immutable snapshot history
- `GET/POST /employees/:id/development-notes`, `PATCH /development-notes/:id/share` — Manager-authored notes; share is one-way and audited
- `GET /analytics/calibration-queue` — HR Calibration Queue feed (FR-10.5) listing Eligible + Calibration-Hold employees
- `GET /analytics/manager-approval-patterns` — HR-scoped manager approval pattern report (FR-10.7)
- `GET /audit-events`, `GET /audit-events/export`
- `GET /map/projection` — returns spiral projection data for the current org configuration
- `GET /map/employees` — returns server-filtered, server-shaped node data (respecting visibility/RBAC + Rollout Mode + anonymization)
- `GET /notifications`, `PATCH /notifications/:id/read`
- `GET /analytics/*` scoped read-only endpoints

### 13.3 Map Data Contract (key 3D backing API)

`GET /map/employees` returns:
- `nodes[]`: `{ employee_id (nullable when anonymized), track_id, level_id, band_position (0–1), score (nullable), readiness_pct (nullable), promotion_eligible (nullable), eligibility_state ('ELIGIBLE' | 'NOT_ELIGIBLE' | 'CALIBRATION_HOLD' | 'PENDING_CALIBRATION'), at_risk (nullable), anonymized BOOLEAN }`
- `eligibility_state` encodes the four orthogonal UI states: the binary eligibility (`ELIGIBLE` / `NOT_ELIGIBLE`), the HR-applied Calibration Hold override (`CALIBRATION_HOLD`), and the org-level Rollout-Mode override (`PENDING_CALIBRATION` — surfaced when `organization.promotion_mode = CALIBRATION`). Only one state is returned per node; the server applies the override hierarchy (Rollout Mode > Calibration Hold > Eligibility).
- `anonymized=true` nodes: `employee_id` is replaced with an opaque per-render token (no stable employee reference); `score`, `readiness_pct`, `promotion_eligible`, and `at_risk` are all `null`; node is marked non-clickable; `track_id`, `level_id`, and `band_position` remain populated to preserve the spatial shape.
- **Anonymization is enforced server-side** by a Map Projection authorization pass that runs after RBAC scoping: for each node the service decides `should_reveal(viewer, subject)` per the org's `VisibilityRule`, the viewer's role, and whether the subject is a direct report of the viewer. Nodes failing `should_reveal` are emitted in anonymized form — the client never receives identity payload for non-visible peers. The server is **never** trusted to send data it then asks the client to hide.
- **Rollout Mode influence on visual payload**: when `promotion_mode = CALIBRATION`, all nodes receive `eligibility_state = 'PENDING_CALIBRATION'` for anyone who would otherwise compute as `ELIGIBLE` — the UI uses this to suppress the "promotion-ready" pulse and render the calibration label instead. Suppression is applied at the Map Data Contract boundary so no client variant needs to know the mode.
- **Response headers**: `X-FCM-Rollout-Mode: CALIBRATION | ACTIVE` and `X-FCM-Visibility-Scope: OWN_ONLY | TEAM | ORG_SUMMARY | ORG_FULL` are emitted so the client can render the banner and state without a second round-trip.

### 13.4 Webhooks (Infrastructure-Ready, Not Wired in MVP)

- Data model supports webhook subscriptions per organization; admin UI to configure delivery endpoints is a V2 enhancement.
- Event types planned: `score.snapshot.created`, `promotion.completed`, `evidence.approved`. Same shape as internal realtime events.

### 13.5 External Integrations (Planned Interfaces)

- **HRIS** (Workday, BambooHR) — V2: a sync job that reconciles employee roster and role assignments. MVP exposes `POST /employees/bulk-import` (CSV).
- **LMS** (LinkedIn Learning, Coursera) — V2: inbound webhook "course_completed" → auto-submit evidence.
- **Identity Provider** — OIDC MVP, SCIM provisioning V2.

---

## 14. Resolution of PRD Architect-Level Open Questions (AO1–AO7)

| # | Question | Resolution Location |
|---|---|---|
| AO1 | 3D LOD/clustering strategy and WebGL budget | §4.3 |
| AO2 | Job queue technology and scheduling | §7.1, §7.2 |
| AO3 | OIDC library and session management | §10.1 |
| AO4 | ScoreSnapshot and AuditEvent retention at scale | §6.3, §6.4 |
| AO5 | Evidence file access control, URL lifetimes, CDN interaction | §9.1, §9.2 |
| AO6 | Multi-tenancy posture | §10.4 |
| AO7 | Real-time update strategy | §8 |

All seven are resolved with concrete decisions.

---

## 15. Architecture Decision Records (Summary)

| # | Decision | Status |
|---|---|---|
| AD-1 | Modular monolith (NestJS) + separate worker fleet + separate Next.js frontend | Accepted |
| AD-2 | Next.js App Router; RSC for 2D, client components for 3D canvas | Accepted |
| AD-3 | React Three Fiber with InstancedMesh, BVH raycasting, 3-tier LOD, web-worker spiral generation | Accepted |
| AD-4 | Domain modules with acyclic dependency graph and event-driven cross-cutting | Accepted |
| AD-5 | BullMQ on Redis with per-queue backoff, DLQ, and idempotency via `(employee_id, triggering_event_id)` | Accepted |
| AD-6 | Socket.IO for realtime push with Redis adapter; polling fallback | Accepted |
| AD-7 | Outbox pattern for audit + fanout; append-only partitioned `audit_events` | Accepted |
| AD-8 | PostgreSQL 15 + Prisma; RLS + column-based `organization_id` scoping | Accepted |
| AD-9 | Pre-signed S3 URLs for direct client-to-S3 upload/download; CDN excluded for evidence | Accepted |
| AD-10 | Containerized Kubernetes deployment; dev/staging/prod parity; managed PG/Redis/S3 | Accepted |
| AD-11 | OIDC via openid-client + NextAuth session; defense-in-depth RBAC across API/domain/DB | Accepted |
| AD-12 | pino logs + Prometheus metrics + OpenTelemetry traces + Sentry errors from MVP | Accepted |

---

## 16. Tradeoffs Considered

| # | Tradeoff | Chosen | Rejected Alternative | Why |
|---|---|---|---|---|
| T1 | Monolith vs. microservices | Modular monolith | Microservices from day one | Domain is transaction-coupled; monolith preserves atomicity cheaply; extraction path stays open |
| T2 | Three.js raw vs. React Three Fiber | R3F | Raw Three.js | R3F integrates with React lifecycle/state; still allows drop-down to raw Three.js for performance pockets |
| T3 | BullMQ vs. Temporal | BullMQ | Temporal | Scope fits BullMQ; Temporal is valuable for multi-step long-running workflows we don't have in MVP |
| T4 | Shared DB RLS vs. schema-per-tenant | Shared DB + RLS | Schema-per-tenant | Operational cost at current scale; architecture-ready to switch for dedicated enterprise deployments |
| T5 | Socket.IO vs. SSE vs. polling-only | Socket.IO + polling fallback | SSE-only; polling-only | Bidirectional + rooms + battle-tested reconnect; SSE too limited; pure polling feels stale in 3D |
| T6 | REST vs. GraphQL | REST + OpenAPI | GraphQL | REST meets PRD's integration-readiness; GraphQL adds complexity not paid back at MVP |
| T7 | Prisma vs. TypeORM | Prisma | TypeORM | Better TS ergonomics, mature migrations, easier for team onboarding |
| T8 | Event-sourcing core vs. state-of-record with outbox | State-of-record + outbox audit | Full event sourcing | Complexity/time budget; outbox gets us auditability and fanout without full ES rebuild |
| T9 | Client-shaped vs. server-shaped map data | Server-shaped (`/map/employees`) | Client-shaped | Visibility/RBAC cannot be enforced on client; payload stays lean |
| T10 | CDN for evidence vs. direct S3 | Direct pre-signed S3 | CDN-fronted | Signing bypasses cache; personal evidence shouldn't be cached; CDN reserved for public presentation assets |
| T11 | Dedicated 3D service vs. in-monolith | In-monolith `mapprojection` module | Separate 3D service | Map projection is cheap math; no scaling reason to split |
| T12 | WebSocket per-user vs. broadcast | Room-scoped (user / org / employee / manager-team) | Broadcast-everything | Privacy + scalability; every event filtered by recipient's visibility rules |

---

## 17. Risks and Mitigations (Architectural)

| # | Risk | Mitigation |
|---|---|---|
| AR-1 | 3D performance degrades beyond 500 employees | InstancedMesh + 3-tier LOD + BVH + frustum culling + Web Worker geometry gen; FPS telemetry from MVP for early detection |
| AR-2 | Recalc storm after large config change overwhelms workers and starves interactive recalcs | Separate queues for interactive vs. bulk; rate-limited bulk queue; per-org concurrency caps |
| AR-3 | Outbox relay stalls → stale audit/realtime | Outbox depth alert (Prometheus); DLQ with page-level severity; runbook defined |
| AR-4 | RLS misconfiguration causes cross-tenant leakage | Shared test fixture asserts RLS denies cross-org reads; integration tests per repository include a dual-org cross-read assertion |
| AR-5 | Pre-signed URL scope mistakes leak evidence | Signed URLs include user_id-bound request headers; URL issuance requires domain-layer RBAC pass; 10-min TTL limits blast radius |
| AR-6 | OIDC provider outage blocks all logins | MVP fallback: short-lived admin recovery codes issued at org bootstrap; documented in runbook |
| AR-7 | WebSocket sticky-session issues under scale | Socket.IO Redis adapter eliminates sticky requirement; HPA scales horizontally |
| AR-8 | Snapshot partition growth unbounded | Monthly partitioning + 12-month hot window + cold-tier archival job (scheduled weekly) |
| AR-9 | Client-side 3D state memory creep on long sessions | Geometry caches bounded; OrbitControls/InstancedMesh disposed on route exit; Sentry memory breadcrumbs |
| AR-10 | Latency between snapshot write and 3D reflection | Outbox relay p95 < 2s target; fallback polling keeps stale window bounded to 30s |
| AR-11 | Bootstrap promotion surge at first activation creates org-wide "all eligible" signal, loss of trust, or accidental auto-promotion path | Organization `promotion_mode` defaults to `CALIBRATION` (see §6.2); all promotion-mutating API endpoints enforce the mode check server-side (see §5.4) and return structured errors when the org is in `CALIBRATION`; the Map Data Contract (§13.3) emits `eligibility_state = 'PENDING_CALIBRATION'` so the UI never displays a promotion-ready affordance org-wide; transition to `ACTIVE` requires an Admin action with rationale ≥100 chars and captures an immutable Bootstrap Eligibility Snapshot inside the same transaction — architectural atomicity guarantees the "state at transition" claim is defensible. |
| AR-12 | Promotion Eligibility misinterpreted as promotion decision in client/API consumer code | Eligibility check in backend is necessary-not-sufficient: promotion `POST` endpoints additionally verify Rollout Mode, Calibration Hold absence, and Performance Narrative presence (≥200 chars) in a single transaction (see §5.4); `promotion_recommendations` table is append-only at the DB role level; integration tests assert the four orthogonal gate paths. |
| AR-13 | Map server payload leaks identity for non-visible peers | Map Data Contract (§13.3) applies the authorization pass server-side after RBAC scoping; non-visible nodes emit only `{ track_id, level_id, band_position, anonymized: true }`; identity columns are NULL in the response; integration tests assert that a viewer with `OWN_ONLY` visibility never sees any `employee_id` other than their own in the map response. |
| AR-14 | Calibration Flag race condition (two HR actors open flags simultaneously) | Partial unique index `(employee_id) WHERE state = 'OPEN'` on `calibration_flags` prevents concurrent open flags at the DB level; conflict returns a structured `409 CALIBRATION_FLAG_ALREADY_OPEN` to the losing request; flag resolution requires `state = OPEN` precondition. |

---

## 18. Source Tree Direction (Proposed)

```
fcm/
├─ apps/
│  ├─ web/                      # Next.js frontend
│  │  ├─ app/                   # App Router routes
│  │  ├─ components/
│  │  │  ├─ map/                # 3D canvas + R3F scene
│  │  │  ├─ panels/             # Detail panel, filters
│  │  │  └─ ui/                 # shadcn/ui primitives
│  │  ├─ lib/                   # client SDK, query hooks
│  │  └─ workers/               # spiral-geometry.worker.ts
│  └─ api/                      # NestJS API
│     ├─ src/
│     │  ├─ modules/
│     │  │  ├─ identity/
│     │  │  ├─ organization/
│     │  │  ├─ configuration/
│     │  │  ├─ evidence/
│     │  │  ├─ scoring/
│     │  │  ├─ forecasting/
│     │  │  ├─ promotion/
│     │  │  ├─ audit/
│     │  │  ├─ notification/
│     │  │  ├─ realtime/
│     │  │  ├─ mapprojection/
│     │  │  ├─ filestorage/
│     │  │  └─ jobs/
│     │  ├─ bootstrap/          # app & worker entrypoints
│     │  └─ common/             # guards, decorators, errors, logger
│     └─ prisma/                # schema.prisma, migrations
├─ packages/
│  ├─ domain-contracts/         # TS types shared between web and api
│  └─ scoring-core/             # pure functions (shared, testable)
├─ infra/
│  ├─ k8s/
│  ├─ terraform/
│  └─ grafana/
├─ docs/
│  └─ ops/runbooks/
└─ .github/workflows/
```

`packages/scoring-core` is extracted because both the API and (future) analytical batch tooling need the same deterministic math. Keeping it as a pure package with zero I/O dependencies is how we guarantee reproducibility.

---

## 19. Implementation Readiness Checklist (Feeds Epics)

For the epics-and-stories workflow, the following architectural commitments must be visible as epic-level capabilities or story-level requirements:

- [ ] Identity & SSO (OIDC integration, session, RBAC scaffolding)
- [ ] Organization bootstrap + CDF seeding
- [ ] Configuration domain (tracks/levels/layers/requirements/rules)
- [ ] Evidence lifecycle (submission, approval, rejection, expiry)
- [ ] Evidence storage (pre-signed URL slot, S3 integration)
- [ ] Scoring engine (pure core + orchestrator + snapshots)
- [ ] Forecasting engine (ETA + Confidence)
- [ ] Promotion workflow (eligibility check, approval chain, track transfer)
- [ ] Promotion Recommendation + Performance Narrative (append-only table, ≥200-char enforcement, audit capture)
- [ ] Calibration subsystem (Calibration Flag table with partial unique index, HR flag/resolve endpoints, Calibration Queue analytics view)
- [ ] Organizational Rollout Mode (default `CALIBRATION`, Admin transition endpoint with ≥100-char rationale, Bootstrap Eligibility Snapshot capture in same transaction, append-only `rollout_mode_transitions`)
- [ ] Map Data Contract with server-enforced anonymization + Rollout-Mode eligibility-state overlay + response headers
- [ ] Development Notes (private/shared-with-employee, one-way share, audit on share)
- [ ] Audit system (outbox + append-only log + query/export)
- [ ] Async job infrastructure (BullMQ, queues, DLQ, retries)
- [ ] Realtime gateway (Socket.IO + Redis adapter + rooms)
- [ ] 3D Career Map (spiral gen, InstancedMesh, LOD, BVH, detail panel integration)
- [ ] 2D deep views (Dashboard, Analytics, Settings, Full Profile, Audit browser)
- [ ] Notification center (in-app)
- [ ] Observability baseline (logs, metrics, traces, alerts, dashboards)
- [ ] Environment topology (dev/staging/prod + CI/CD + migrations + secrets)
- [ ] Security hardening (RLS, pre-signed URL discipline, secrets manager, SBOM)

---

## 20. Summary

- **System shape:** Modular monolith + worker + Next.js frontend, deployed to managed Kubernetes with managed Postgres/Redis/S3.
- **3D is architected, not improvised:** R3F + InstancedMesh + BVH + 3-tier LOD + worker-thread geometry, with a 60 fps / 500-node budget and client FPS telemetry.
- **Scoring is deterministic and asynchronous:** pure functions in a shared package; idempotent BullMQ jobs; snapshots are append-only.
- **Realtime is first-class:** Socket.IO with Redis adapter; room-scoped; server-filtered for visibility.
- **Audit is guaranteed:** outbox pattern delivers audit and fanout transactionally; log is partitioned and append-only.
- **Tenancy is defense-in-depth:** column-based scoping + Postgres RLS + domain-layer checks + RBAC at the API edge.
- **Ops is production-minded from day one:** structured logs, Prometheus metrics, OTEL traces, Sentry, DLQ alerts, runbooks.
- **All seven PRD-flagged architect open questions are resolved.**

---

*Architecture Document — Fibonacci Career Map (FCM) — Version 1.0 Draft — 2026-04-18*
*Status: Ready for Epics & Stories Workflow (`/bmad-create-epics-and-stories`)*
