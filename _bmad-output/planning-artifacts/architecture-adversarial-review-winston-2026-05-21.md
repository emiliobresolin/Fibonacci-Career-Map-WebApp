# Adversarial Architecture Review — FCM
**Reviewer:** Winston (System Architect)
**Date:** 2026-05-21
**Subject:** `_bmad-output/planning-artifacts/architecture.md` (v1.0 Draft, 890 lines)

---

## TL;DR — What's solid, what's broken

- **The promotion-gate data model is solid.** The combination of `promotion_recommendations` with a DB-level `CHECK (char_length(performance_narrative) >= 200)`, the partial unique index `(employee_id) WHERE state = 'OPEN'` on `calibration_flags`, append-only enforcement at the DB role, and the single-transaction Recommendation block in §5.4 is the right shape. Don't dilute it.
- **The 3D performance budget is a marketing number.** "60 fps / 500 nodes on Intel UHD" (line 209) is asserted with no measurement, no benchmark methodology, no tested raycast cost under instanced BVH, and no agreed-upon "reference desktop" hardware spec. The architecture commits to a budget it has not proven and provides no scaling story past 500.
- **Promotion Eligibility is re-verified at *Recommendation* time, never at *commit* time.** §5.4 (line 295) re-verifies Eligibility when the Recommendation opens the workflow; the architecture is silent on re-evaluating Eligibility, Rollout Mode, and Calibration Hold *at the final approval/commit transition*. An approval chain of days plus an evidence expiry or new Calibration Hold means a promotion can commit on stale eligibility. Fix before E15 ships.
- **The 3D promotion-ready pulse and the readiness opacity ride on the same `InstancedBufferAttribute` array.** Per lines 196 and 204–205, pulse-phase and emissiveIntensity (driven by `readiness_pct`) are both per-instance attributes. There is no architectural test asserting the pulse uniform's source field is `promotion_eligible` and not `readiness_pct`. One off-by-one buffer offset and you ship the privacy/correctness incident the PRD §7.5 was written to prevent.
- **Observability is mostly claimed, partly built.** §11.3 says "OpenTelemetry end-to-end" but never specifies BullMQ span propagation, Prisma instrumentation, or context-carrier semantics. §11.5 lists six alerts but no SLO for outbox-relay lag, no alert for the "3D client FPS crater" runbook in §11.6, no alert for OIDC outage, no alert for RLS deny-all, no alert for pre-signed-URL failure — even though all four have runbooks. Runbooks without alerts are decorative.

Don't ship E13 (Promotion Workflow) or E15 (Promotion Commit) without fixing the commit-time re-evaluation gap and adding the pulse-binding contract test. Don't claim observability done until the alert table matches the runbook table.

---

## 1. 3D Map Scalability

### What's solid

InstancedMesh + BVH raycast + three-tier LOD is the correct architecture for this problem class. Web-worker geometry generation off the main thread (line 203) and IndexedDB cache keyed on `(organization_id, config_version)` is the right separation. Anonymized nodes preserving shape (line 706) is the right *contract*. The static spiral being separate from the dynamic instanced layer (line 195) is the right scene-graph decomposition.

### Real flaws

**F1.1 — "Reference desktop" is undefined and the 500-node budget is asserted, not measured.** Severity: 🟠 major.
Evidence — line 209: *"Frame budget: 16.6 ms target (60 fps), 33 ms acceptable (30 fps) at 500 nodes on standard desktop (Intel UHD or equivalent, non-gaming GPU)."*
The problem: "Intel UHD or equivalent" spans roughly an 8x range of integrated-GPU performance (UHD 620 vs Iris Xe vs UHD 770). No CPU spec. No screen resolution. No browser. No DPR (devicePixelRatio = 2 on common laptops doubles fragment cost). A budget written this loosely cannot be defended or refuted. It will silently become "whatever the test laptop happens to be" — and that laptop will keep getting newer until production users on five-year-old corporate fleet hardware file the first ticket.
Fix: pin a reference machine in §4.3.11. Example wording: "Reference: Intel Core i5-1240P + Iris Xe, Windows 11, Chrome stable, 1920×1080 logical at DPR 1.5." Run a real measurement in story E11. If you cannot hit budget on that machine, you do not have a 500-node product — you have a 500-node aspiration.

**F1.2 — No credible scaling path past 500.** Severity: 🟠 major.
Evidence — §17 AR-1 (line 782) lists the mitigation as *"InstancedMesh + 3-tier LOD + BVH + frustum culling + Web Worker geometry gen; FPS telemetry from MVP for early detection."* That's a list of techniques, not a scaling plan. Nowhere does the doc compute or estimate frame cost at 1k / 5k / 10k. The PRD only specifies 500 as a target, but the architecture says (line 196) "up to thousands of nodes" — implying it scales further. It doesn't say how.
Why it matters: enterprise customers exist at 5k–20k. If the answer is "far-tier clustering handles it," then at 5k the *mid tier* is already overwhelmed before the camera moves. Clustering threshold is "configurable threshold (default 12)" — for an org with 5k employees and 8 tracks × 7 levels = 56 buckets, you're averaging ~90 employees per bucket; clustering kicks in at 12, so 88% of nodes are hidden. That's not a 5k product, that's a 56-cluster product wearing a 5k label.
Fix: write a one-paragraph honest scale story. State the cliff. "MVP target 500; up to 1,500 with no architectural change; 1,500–5,000 requires switching default to far-tier-by-default with explicit drill-down; beyond 5,000 requires server-side cluster aggregation in the Map Data Contract." Be honest. Move on.

**F1.3 — Per-instance attribute updates on every snapshot.updated event are not budgeted.** Severity: 🟠 major.
Evidence — line 225: *"On event, TanStack Query cache is invalidated for affected employee IDs; 3D instance attributes update in-place (no re-render of the scene)."*
The doc treats this as free. It isn't. `InstancedBufferAttribute.needsUpdate = true` triggers a full GPU buffer upload on the next frame. If 50 employees re-snapshot in a 5-second window during a bulk recalc, you're forcing 50 buffer re-uploads, each of which stalls the rendering thread briefly. At 500 nodes × 16 bytes per attribute × 4 attributes, the buffer is ~32KB — fine in isolation, but combined with a configuration change ("ConfigurationChanged" → bulk recalc per §7.4) it's a sustained update storm during the exact moment the user is staring at the map waiting for it to settle.
Fix: batch in-frame. Collect snapshot.updated events into a frame-coalesced queue (`requestAnimationFrame`); apply all pending changes in a single `needsUpdate=true` per frame. The architecture needs to say this. One sentence. Otherwise developers will wire it naively.

**F1.4 — Raycast cost at 500+ nodes is not characterized.** Severity: 🟡 minor.
Evidence — line 202: *"Hover uses a throttled 60Hz raycast; click uses a single cast on pointer-up."*
60Hz hover raycast against a BVH on an InstancedMesh of 500 spheres is fine. At 5k it's fine. The flaw is the unstated assumption that BVH-against-InstancedMesh works correctly — `three-mesh-bvh` requires you to build the BVH per-instance or use the instanced raycast variant. The doc says BVH but not which BVH mode. This bites you when raycast either returns wrong instance IDs or rebuilds the BVH on every node-position change (it won't, but only if you set `staticBounds: true` and accept that node-reposition-on-promotion requires a BVH refit — which the architecture also doesn't mention).
Fix: in §4.3.5, add: "BVH built once over the static instance-position pattern; per-employee position is encoded as an instance-matrix offset, not a vertex-position update; promotion-commit node reposition triggers `bvh.refit()`, not full rebuild."

**F1.5 — IndexedDB cache invalidation strategy is missing.** Severity: 🟠 major.
Evidence — line 203: *"Cached in `IndexedDB` keyed by `(organization_id, config_version)`."*
What happens when:
- The user has tab A and tab B open and `config_version` changes? Both tabs receive `config.changed` WS event; both attempt to write the same key in IndexedDB. IndexedDB serializes writes within an origin but the *contents* may differ if both tabs computed geometry from slightly different inputs. Last-writer-wins, silently.
- IndexedDB quota exceeded (~50MB persistent on Chrome before user prompt; varies). The doc never mentions quota handling. With BufferGeometry attributes for a 10-track × 7-level × 100-band-position spiral, you're 7000 vertices × 32 bytes ≈ 224KB. Fine. But if someone makes the geometry per-employee (they shouldn't, but the architecture must say so), you blow quota at 500 employees.
- User in a private/incognito context where IndexedDB is ephemeral. Cache misses every session = web-worker rebuild every session. Fine functionally; not great as a perf claim.
Fix: §4.3.6 needs four lines.
1. "On `config.changed` WS event, evict all entries with stale `config_version` for the org before generating new geometry."
2. "Single-writer pattern: on cache miss, acquire a `web-lock` via `navigator.locks.request('fcm-geom-' + orgId, ...)` so concurrent tabs don't race."
3. "Quota-exceeded handler: catch `QuotaExceededError`, fall back to in-memory cache only, log to client beacon."
4. "Geometry data is bounded by org config, not employee count. Never store per-employee data in this cache."

**F1.6 — No mobile / low-end fallback strategy.** Severity: 🟡 minor.
Evidence — §4.6 mentions a "List view toggle" as accessibility fallback (line 230). That's framed as a11y, not perf. Nothing in §4.3 says "if FPS < X, automatically degrade to far-tier-only" or "if `navigator.deviceMemory < 4`, render 2D list by default." The List view exists but is a manual user action.
Why it matters: a manager opens the app on a Surface Go in a 1:1, the 3D crater happens, they don't know to click "List view," they conclude the product is broken.
Fix: auto-degrade. If the first 30 frames after scene mount average < 20 fps, switch to far-tier-only LOD and surface a non-modal banner: "Performance mode active — switch to full view." One state, one detection rule, one banner. Not a "future enhancement." MVP.

**F1.7 — Server-side projection cache key MAY cross-poison between visibility scopes.** Severity: 🔴 critical *if* implemented naively; the architecture is unclear.
Evidence — Architecture §13.3 (line 704) and epics.md line 311: *"Cache-key strategy keyed on `(organization_id, config_version)` for the projection; per-request auth-scoped shaping for the employees call (viewer_id + visibility_scope + promotion_mode included in the cache key or bypassed entirely)."*
The "or bypassed entirely" is doing all the heavy lifting in that sentence. The architecture leaves the choice to implementers. If the dev team caches `/map/employees` responses without all three of (`viewer_id`, `visibility_scope`, `promotion_mode`) in the key — say, they cache by `(organization_id, config_version)` for performance — then a Manager and an Employee in the same org get cross-served responses. The Employee gets identity data they should never see.
The architecture should not be ambiguous on this. It should declare the cache contract.
Fix: in §13.3, replace the "or bypassed entirely" clause with: *"`/map/employees` responses are not server-cached; they are computed per-request. Only `/map/projection` (org-public spiral shape) is cacheable by `(organization_id, config_version)`."* This is the safe call. Computing the employees response per-request at 500 nodes is cheap.

**F1.8 — Promotion-Ready pulse binding has no architectural contract test.** Severity: 🔴 critical.
Evidence — line 204: *"Promotion-Ready pulse: ... This visual is bound to Promotion Eligibility `ELIGIBLE`, never to Readiness %."* And line 205: *"Readiness encoding: Per-instance `opacity` + `emissiveIntensity` blended from the server-sent `readiness_pct`."*
Both signals are encoded as `InstancedBufferAttribute` per-instance attributes on the same instance buffer. There is no architectural assertion that this binding is verified at the rendering layer. A developer can wire the pulse phase to `readiness_pct >= 1.0` (looks correct in calibration mode where eligibility is hidden but readiness is shown) and ship a build that pulses every employee at 100% readiness — including the one who is at 100% readiness but has an unmet mandatory and is therefore NOT_ELIGIBLE.
This is exactly the failure mode PRD §7.1 was designed to prevent.
Fix: §4.3.7 must include: *"Pulse attribute is sourced exclusively from the server-sent `promotion_eligible: true` AND `eligibility_state === 'ELIGIBLE'`. A frontend integration test in E11 asserts that a node with `readiness_pct: 100` and `promotion_eligible: false` renders without pulse. A second test asserts that `eligibility_state: 'PENDING_CALIBRATION'` suppresses pulse regardless of `promotion_eligible`."* Make this a story acceptance criterion, not a code-review hope.

### What I'd cut from scope or change

- Drop the bloom pass (line 207) until you've measured frame budget on the reference machine. Bloom is the easiest perf casualty and the cheapest visual to add back later.
- Move the "automatic degrade to performance mode" detection in. Not optional.
- Pin reference hardware. The 500-node claim is not credible without it.

---

## 2. Promotion Gates

### What's solid

The data model in §6.2 (lines 337–342) is the right shape:
- `promotion_recommendations` with DB-level `CHECK (char_length(performance_narrative) >= 200)` and append-only at the DB role.
- `calibration_flags` with partial unique index `(employee_id) WHERE state = 'OPEN'` — concurrent flag race solved at the DB.
- `rollout_mode_transitions` with conditional CHECK on rationale length (≥100 chars only when transitioning from CALIBRATION). The conditional is correct; ACTIVE→CALIBRATION shouldn't require the same justification weight.
- `bootstrap_eligibility_snapshots` partitioned by quarter, captured inside the same transaction as the mode change (§5.4 line 297).

The four-gate Recommendation transaction in §5.4 (line 295) is exactly the right shape: Eligibility + Rollout Mode + Calibration Hold + Narrative length, all in a single DB transaction, with outbox-emitted side effects. The state machine `RECOMMENDED → IN_REVIEW → APPROVED | REJECTED | CALIBRATION_HOLD` is well-formed (stories.md line 1039).

### Real flaws

**F2.1 — Eligibility is re-verified at Recommendation time but the architecture is silent on commit-time re-verification.** Severity: 🔴 critical.
Evidence — §5.4 line 295: *"Promotion Recommendation (single txn): verify Eligibility = ELIGIBLE, Rollout Mode = ACTIVE, no active Calibration Hold, and Performance Narrative ≥200 chars → insert PromotionRecommendation..."* And §5.4 line 294: *"Promotion commit (single txn): insert PromotionRecord → update Employee level → reset level-scoped score inputs → insert outbox rows..."*
The commit transaction does not list re-verification. PRD §6.5 line 323 says *"Backend re-verifies Promotion Eligibility and rollout mode before accepting"* — but PRD §6.5 is talking about Recommendation acceptance, not the final commit.
Scenario the architecture allows: Manager submits Recommendation Monday. Approval chain is HR_GATE (manager + HR counter-sign). HR reviews Wednesday. Between Monday and Wednesday: an APPROVED evidence item with `expiry_months` hits expiry; the daily expiry-scan job (§7.5) transitions it to EXPIRED; the recalc fires; the employee's `promotion_eligible` drops to `false`. HR clicks Approve Wednesday with no re-evaluation in the commit transaction. The system commits a promotion for an employee who is no longer eligible.
Same scenario for: HR opens a CalibrationFlag Tuesday → no re-check Wednesday at commit. Or: Admin transitions to CALIBRATION mode Tuesday → no re-check at commit.
Fix: §5.4 "Promotion commit" must read: *"... verify Eligibility = ELIGIBLE, Rollout Mode = ACTIVE, no active Calibration Hold (re-checked at commit, not assumed-current from Recommendation) → insert PromotionRecord → ..."* And: add a `ScoreSnapshot` reference to the commit transaction so the commit is bound to a specific snapshot ID, and require that snapshot's `occurred_at` >= Recommendation's snapshot's `occurred_at` (we promoted on this snapshot or newer). Story E15 must have an acceptance test that stale-eligibility commits return 409.

**F2.2 — Rollout Mode enforcement surface is named but not pinned to a single source of truth.** Severity: 🟠 major.
Evidence — §5.4 enforces it inside transactions. §10.3 layer 2 says services check it. §13.3 says the Map Data Contract overrides eligibility_state with `PENDING_CALIBRATION` when mode = CALIBRATION. §13.2 lists three separate promotion endpoints that each enforce it.
That's four enforcement sites: (a) Recommendation creation, (b) Approve/Reject endpoints, (c) Map Data Contract overlay, (d) UI affordance suppression via response header `X-FCM-Rollout-Mode`.
The architecture does not say which is the canonical check. It does not define a `RolloutModeGuard` primitive analogous to `SelfApprovalGuard` (which is defined in story E2.5). Without a single named guard primitive, you will get four implementations, three of which agree and one of which has a bug. The architecture should mandate the guard exists.
Fix: §10.3 must add a third bullet under Layer 2: *"`RolloutModeGuard.ensureActive(organization_id)` primitive throws `RolloutModeNotActiveError` when org is in CALIBRATION; invoked by Recommendation, Approve, Reject endpoints. Map Data Contract uses the same primitive via the service layer, not its own check."* Mirror the `SelfApprovalGuard` pattern from story E2.5 (stories.md line 196).

**F2.3 — Approval workflow config change mid-flight is unspecified.** Severity: 🟠 major.
Evidence — §5.4 line 294 commits a `ConfigurationChanged` event that fans out bulk recalcs. PromotionRule is part of configuration (§5.1 line 244 — `configuration` module owns `PromotionRule`). PRD §8.7 says workflows are per-level configurable.
What happens if an Admin changes the workflow for L4→L5 from SINGLE to DUAL_MANAGER while three L4→L5 promotions are in flight at the RECOMMENDED state? Are they grandfathered to the workflow at Recommendation time, or do they re-evaluate against the new workflow?
The architecture is silent. PRD §6.9 line 424 addresses Rollout Mode reversal preservation ("Any promotions already in flight are preserved in their current approval-workflow state but no new recommendations can be submitted") but does not address ApprovalWorkflow config change.
Fix: pin the answer in §5.4 or §8.x. My recommendation: snapshot the workflow choice into `promotion_records.approval_workflow_at_initiation` at Recommendation creation. In-flight promotions complete on the snapshotted workflow; new ones use the new config. This is one column and one line of code; the alternative ("recompute against current config") creates intractable audit questions.

**F2.4 — `active_blocker_check` is a boolean on the rule but the data model does not include an employee-blocker table.** Severity: 🟠 major.
Evidence — line 326: *"`promotion_rules` | FK to level; min_score, min_time_at_level_months, manager_required, hr_required, blocker_check"*. That's a boolean — "does this level check blockers?" — but the architecture does not define what *is* a blocker. PRD §8.5 line 635: *"Active blocker check: no active PIP or formal performance concern (boolean, default true — details logged in audit but PIP management is external)"*. PRD punts: "external." Architecture must answer: how does the engine answer the question "does employee X have an active blocker?" at evaluateEligibility time (story E9 line 708)?
Two failure modes:
1. The engine ignores blockers entirely → the gate is decorative; PIPed employees pass promotion eligibility.
2. The engine reads CalibrationFlag → conflates HR calibration with PIP/performance blockers, which are semantically different and have different actors and different resolution flows.
Fix: add `employee_blockers` table to §6.2.
```
employee_blockers | FK to employee_id + opened_by_user_id;
  kind enum ('PIP' | 'PERFORMANCE_CONCERN' | 'OTHER');
  state enum ('OPEN' | 'RESOLVED');
  reason TEXT NOT NULL CHECK (≥40 chars);
  opened_at, resolved_at;
  partial unique index (employee_id) WHERE state = 'OPEN'
```
And `evaluateEligibility` reads from this table for the `blockers[]` parameter that story E9 already passes. The story exists; the data model doesn't. Close the loop.

**F2.5 — ScoreSnapshot writes are described as immutable but the atomicity contract for Snapshot + Notification + Realtime fanout is not explicit.** Severity: 🟡 minor.
Evidence — §7.3 line 397: *"Job handler: SELECT ... FOR UPDATE on recalc_jobs ... INSERT new score_snapshots row ... Emit ScoreRecalculated domain event → notification + realtime fanout via outbox."*
That's two writes: the snapshot insert and the outbox row insert. The architecture does say (§9.3 line 489) the outbox row is in the same transaction as the mutation. So Snapshot + outbox is atomic. Good.
The minor gap: the snapshot insert and the `employee_current_snapshot` materialized view refresh (§6.3 line 348) — described as "refreshed within the same transaction that writes a new snapshot (trigger)." If the trigger fails (deadlock, MV lock contention), the snapshot insert also rolls back. That's correct behavior but architecture should say so explicitly so the implementer doesn't add `EXCEPTION WHEN OTHERS THEN NULL` to the trigger to "make it more reliable."
Fix: one sentence in §6.3: *"MV refresh trigger uses no exception handler; trigger failure aborts the snapshot insert, preserving consistency."*

**F2.6 — Self-approval guard is declared (line 534) but its contract is thin.** Severity: 🟡 minor.
Evidence — §10.3 line 534: *"Self-approval prohibited at this layer (PRD 9.2)."*
Story E2.5 (stories.md line 196) defines `SelfApprovalGuard.ensureNotSelf(actor, subjectUserId)`. Good. But the architecture itself doesn't pin which calls invoke it. Story E13/E14 (PromotionApprove) line 1102 says "self-approval rejected via E2.5 guard." Story E5 (Evidence Approve) line 643 invokes it. What about:
- Promotion REJECT? (Story line 1102 covers both; architecture doesn't explicitly say.)
- Calibration Flag set on self? (No story line found — should HR be able to flag themselves? Probably no harm but undefined.)
- Recommendation submit on self? (Manager can't have themselves as a report in well-formed data, but defense in depth.)
Fix: §10.3 add: *"`SelfApprovalGuard.ensureNotSelf(actor, subject_user_id)` is invoked by every Promotion endpoint (recommend, approve, reject), every Evidence endpoint (approve, reject), every Calibration Flag endpoint (open, resolve), and every Development Note share. Subjects derive from the entity's owning employee's user_id."*

**F2.7 — Bootstrap Eligibility Snapshot capture during mode transition has no documented failure mode.** Severity: 🟠 major.
Evidence — §5.4 line 297: *"Rollout Mode transition (single txn): ... on CALIBRATION→ACTIVE, snapshot every employee's current Score / Readiness % / Promotion Eligibility / active CalibrationFlag into the immutable `bootstrap_eligibility_snapshot` table with a single `transition_id` → insert outbox rows ... Commit. Snapshot capture runs inside the same transaction as the mode change so that the 'state at transition' claim is bit-exact."*
For an org with 5000 employees, that's 5000 rows in a single INSERT transaction. Postgres handles this fine in raw throughput but: (a) lock duration on `organizations` row + all referenced employee rows is non-trivial; (b) if the transaction times out (statement_timeout, lock_timeout), the entire transition fails and the mode is still CALIBRATION. The Admin clicks "Transition to Active," sees a timeout, clicks again. Idempotency?
The architecture does not say the transition is idempotent or how it retries. There's no `transition_id` deduplication described at the Admin endpoint level.
Fix: two changes.
1. Make the snapshot capture asynchronous-with-barrier: mode change commits synchronously; a `bootstrap.snapshot-capture` job (idempotent on `transition_id`) populates the snapshot. The mode change records `snapshot_capture_status: 'PENDING' | 'COMPLETE'`. The Calibration Queue and Eligibility-history UIs gate on `snapshot_capture_status = COMPLETE`.
2. If you insist on synchronous capture (the "bit-exact" claim has weight), then add: idempotency key on the Admin endpoint (`Idempotency-Key` header) so retries collapse; `statement_timeout` raised for this endpoint; documented runbook for "transition stuck, mode is CALIBRATION but Admin thinks they clicked Activate."

**F2.8 — The eligibility-state enum lives in the Map Data Contract but is not pinned as a canonical enum.** Severity: 🟡 minor.
Evidence — line 704: *"eligibility_state ('ELIGIBLE' | 'NOT_ELIGIBLE' | 'CALIBRATION_HOLD' | 'PENDING_CALIBRATION')"*. Stories.md line 960 lists the same four. §13.3 line 705 explains the override hierarchy (Rollout Mode > Calibration Hold > Eligibility) and that only one state is returned.
The flaw: this enum is the most important enum in the product (it controls every promotion-related UI affordance) and it appears only in the Map Data Contract section. It's not pinned in the data model (`score_snapshots.promotion_eligible BOOL` is a binary, not the four-state enum). It's not pinned in `packages/domain-contracts`. Where's the canonical source?
Fix: §6.2 add `score_snapshots.eligibility_state` as an enum column alongside the existing boolean. The boolean stays for backward read paths; the enum is the new canonical surface. Update §6.2's row for `score_snapshots` accordingly. Add the enum definition to `packages/domain-contracts` (line 832). One source, one definition, four consumers.

### What I'd cut from scope or change

- **Add commit-time re-verification** (F2.1) before E15 ships. This is the single highest-risk gap.
- **Add `employee_blockers` table** (F2.4). Currently the blocker gate is a doctrinal placeholder, not a real check.
- **Pin `eligibility_state` as a canonical enum in the domain-contracts package** (F2.8).
- **Move Bootstrap Snapshot capture to async-with-barrier** (F2.7). The "bit-exact" promise is rhetorical; what users want is "captured reliably within seconds of the transition." Async-with-barrier is more reliable than a 5k-row synchronous insert.

---

## 3. Observability

### What's solid

§11.1 logging is the right baseline: pino, JSON, correlation IDs propagated from edge through job payloads. §11.2 Prometheus + `prom-client` on auth-gated `/metrics` is correct. §11.4 Sentry browser + Node SDKs. §11.5 has a small but reasonable alert table including DLQ depth, 5xx rate, recalc duration p95.

### Real flaws

**F3.1 — Distributed tracing propagation through BullMQ is asserted, not specified.** Severity: 🟠 major.
Evidence — line 566: *"Correlation ID injected at edge (Next.js middleware) and propagated via x-correlation-id header and OpenTelemetry trace context through to job payloads."* And §11.3 line 578: *"OpenTelemetry SDK end-to-end: browser beacon → Next.js → fcm-api → fcm-worker → Postgres/Redis spans."*
"Redis spans" are not "BullMQ job spans." Tracing a Redis BRPOP that ingests a job is not the same as tracing the job handler's logical work. Without explicit `@opentelemetry/instrumentation-bullmq` (which exists) or manual carrier injection into job payload at enqueue + extraction at consumer, your trace breaks at the queue boundary — you get two disconnected traces, one for the API request that enqueued, one for the worker that consumed.
Same problem for Prisma: there is `@prisma/instrumentation` but the architecture doesn't say it's used. Without it, DB calls appear in traces as raw `pg` driver spans with no query attribution.
Fix: §11.3 expand to: *"OpenTelemetry instrumentation packages: `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-nestjs-core`, `@prisma/instrumentation`, `@opentelemetry/instrumentation-ioredis`, plus a BullMQ trace-context-propagation helper that injects W3C `traceparent` into job data at enqueue and extracts it at consumer entry to start a child span. Browser uses `@opentelemetry/instrumentation-fetch` with `propagateTraceHeaderCorsUrls` configured to the API origin. Three.js client rendering is out of scope for tracing (Sentry only for client errors)."* Be explicit. Trace-context propagation across queues is the #1 thing teams skip and then regret.

**F3.2 — Alert table is short of what the runbook list implies.** Severity: 🟠 major.
Evidence — §11.5 alert table (lines 588–596) lists six alerts. §11.6 line 600 lists six runbooks: *"Recalc backlog, Outbox relay stuck, OIDC provider outage, 3D client FPS crater, Pre-signed URL issuance failure, DB RLS policy deny-all incident."*
Crossreference:
- "Recalc backlog" — covered by BullMQ backlog > 5000 alert. OK.
- "Outbox relay stuck" — covered by DLQ depth > 0. Partial. There's no SLO alert on outbox-relay lag (audit row written but not yet relayed for > N seconds). DLQ catches *failures*, not *lag*.
- "OIDC provider outage" — no alert in the table. A login-success-rate or OIDC-discovery-doc-reachability alert is missing.
- "3D client FPS crater" — no alert in the table. The architecture even mentions FPS distribution as a "product metric" (line 573) but doesn't alert on it. If 90th-percentile FPS for the org drops below 20 fps over 10 minutes, page someone.
- "Pre-signed URL issuance failure" — no alert. This is an external-S3 dependency that can fail silently from the user's perspective.
- "DB RLS policy deny-all incident" — no alert. If RLS is misconfigured such that the app role can't read anything, the API 5xx alert catches it eventually but with significant delay. A startup-time RLS health check would catch it in seconds.
Fix: add five rows to §11.5.
```
Outbox relay lag p95         | > 30s sustained 2 min      | Page
OIDC login success rate      | < 95% over 5 min           | Page
Client 3D FPS p10 (per-org)  | < 20 fps over 10 min       | Warn
Pre-signed URL issuance fail | > 1% over 5 min            | Page
RLS health probe failing     | any failure (per startup)  | Page
```
Each one corresponds to a runbook that already exists.

**F3.3 — Client FPS instrumentation is end-of-session only.** Severity: 🟠 major.
Evidence — line 213: *"Client reports FPS histogram and dropped-frame count to the API /metrics/client endpoint at session end (non-blocking beacon)."*
End-of-session beacon means: the user opens the map, FPS craters to 8 for 4 minutes, they close the tab, beacon fires with one aggregate histogram. You see an aggregate "this session was slow" stat. You don't see *when* in the session it craters, you don't see whether it correlated with a config change or a snapshot.updated burst, and you don't catch users whose browser crashed (no beacon).
Fix: emit periodic beacons. Every 30s or every 1000 frames, whichever first, send a small `{ window_start, window_end, fps_p50, fps_p95, frames_dropped, nodes_visible }` payload. The `observability.client-metrics` queue (line 392) already exists. The aggregate volume is trivial. Also add a `sendBeacon` on `visibilitychange = hidden` to catch tab-close even if `beforeunload` doesn't fire on mobile.

**F3.4 — Audit insertion failure is not separately alertable.** Severity: 🟠 major.
Evidence — §9.3 line 489: outbox row is in the transaction with the mutation. §9.3 line 493: outbox relay writes to `audit_events`. §7.2 line 391: `audit.outbox-relay` queue has retries with infinite attempts and DLQ.
What's missing: if the outbox relay's `audit_events` insert fails repeatedly (say, partition doesn't exist because partition-maintenance job failed), the audit event is *not yet written*. The DLQ catches it eventually. But the architecture doesn't say there's an alert specifically for "audit insertion failure for > N seconds" — only "DLQ depth > 0" which catches the symptom much later.
Why it matters: PRD G6 requires every event to be "immutably logged and explainable." A latency of minutes between mutation and audit is a compliance defect in some industries, not just an ops issue.
Fix: add explicit alert `audit.outbox-relay queue oldest_pending_age > 60s`. Distinct from DLQ depth. Page-level severity.

**F3.5 — Cold-tier archival latency has no SLO.** Severity: 🟡 minor.
Evidence — §6.3 line 346: *"archival to cold storage is automated from month 13."* §7.2 lists `snapshot.partition-maintenance` weekly. No alert on partition-creation failures or archival job overruns.
For an org running for two years, partition maintenance failing silently for a month means the snapshot table grows in the hot tier when it should have been archived. Disk space alerts catch it eventually; that's reactive.
Fix: add alert `partition-maintenance: any failed run in last 7 days`. Warn severity.

**F3.6 — Health probes are claimed but the readiness probe contract is loose.** Severity: 🟡 minor.
Evidence — §11.7 line 605: *"`/readyz` (readiness): DB, Redis, S3 all reachable; OIDC discovery document accessible."*
"Reachable" is undefined. Does the probe issue a real query against the DB, or just an open-socket check? Does it HEAD the S3 bucket, or just resolve DNS? An open-socket check passes even when the DB is read-only or the role is denied.
Fix: tighten to: *"`/readyz` executes (a) `SELECT 1` against Postgres with the app role; (b) `PING` against Redis; (c) `HEAD` against the S3 bucket with the app's IAM role; (d) `GET` against the OIDC discovery URL. Probe fails if any returns non-2xx within 1s. Probe is rate-limited to 10/min per pod via in-process cache to avoid blast on the upstreams."*

**F3.7 — Trace sampling is "10% head-based" but high-value flows have no exception.** Severity: 🟡 minor.
Evidence — §11.3 line 580: *"Sampling: 100% for errors, 10% head-based for success (cost control)."*
Promotion commits, mode transitions, and approval-chain events are once-per-employee-per-quarter events. Sampling them at 10% means most are unrecorded in traces. When a customer files "my promotion didn't go through correctly," there's a 90% chance the trace is gone.
Fix: §11.3 add: *"Full-fidelity (100%) sampling for the following spans regardless of head-based sampling decision: `promotion.*`, `rollout_mode.transition`, `calibration_flag.*`, `evidence.approve`, `evidence.reject`. Implemented via tail-based sampling rule at the OTLP collector."*

**F3.8 — No discussion of observability cost / back-pressure.** Severity: 🟡 minor.
Evidence — none. The doc never says "if Honeycomb is unreachable, do we drop traces, buffer, or backpressure the request?" Nor does it cap the `/metrics/client` queue depth — `observability.client-metrics` (line 392) is "best-effort" but if a worker crashes the queue could grow unbounded and starve real work.
Fix: one paragraph in §11.x: *"Observability is best-effort and non-blocking. If the OTLP collector is unreachable, spans are dropped after a 5s buffer. If Sentry is unreachable, errors are logged at error level and dropped. The `observability.client-metrics` queue is capped at 50k pending jobs; overflow is dropped. Observability backends never block business operations."*

**F3.9 — Sentry PII redaction is claimed but the policy is not documented.** Severity: 🟡 minor.
Evidence — line 584: *"Sentry (browser + Node SDKs). Release-tagged. PII scrubbing enabled."*
"PII scrubbing enabled" is the Sentry default-on `Sentry.Integrations.RewriteFrames` plus a `beforeSend` hook. Without a policy spec, you will leak: employee names in error messages, evidence titles in breadcrumbs, performance narrative text in 5xx payloads.
Fix: one short subsection in §11.4 declaring the policy: *"Sentry `beforeSend` strips `request.body`, `extra.evidence_payload`, `extra.performance_narrative`, `extra.development_note_body`, and any field matching `/email|password|token|secret/i`. Breadcrumb URL paths replace `/employees/:id` with `/employees/:redacted`. Verified by a unit test that throws an error containing an employee name and asserts the dispatched event redacts it."*

### What I'd cut from scope or change

- **Add the five missing alerts** (F3.2). They cost nothing to write and they are why runbooks exist.
- **Switch client FPS beacon to periodic** (F3.3). One queue, two extra lines of code, dramatically better signal.
- **Tail-sample promotion-related traces at 100%** (F3.7). The economics are trivial; the forensic value is high.

---

## Risk Matrix

| # | Risk | Probability | Impact | Fix complexity | Recommendation |
|---|------|-------------|--------|----------------|----------------|
| F1.7 | Map projection cache cross-poisons across visibility scopes | Low (if devs read the doc) / High (if not) | Critical (privacy incident) | Trivial (1 sentence in §13.3 forbidding caching of `/map/employees`) | **Fix before E10 implementation begins.** |
| F1.8 | 3D pulse binding accidentally driven by readiness instead of eligibility | Medium | Critical (privacy + correctness, public-facing) | Low (contract test in E11) | **Make this a story acceptance criterion in E11.** |
| F2.1 | Promotion commits on stale eligibility | High | Critical (an ineligible employee is promoted; the product's central premise breaks) | Low (add re-check to commit txn + bind to snapshot ID) | **Fix before E15 ships. Single highest-priority fix.** |
| F2.4 | `employee_blockers` data model gap → PIP'd employees pass eligibility | Medium | High (compliance/HR incident) | Low (new table + column-binding in `evaluateEligibility`) | **Add to E9 (Scoring) scope.** |
| F2.7 | Bootstrap Snapshot transaction times out on large orgs, transition stuck | Medium (at 5k+ employees) | High (Admin loses confidence in the activation flow) | Medium (move to async-with-barrier) | Re-architect now while it's cheap; harder once code ships. |
| F1.1, F1.2 | 3D performance budget asserted, not measured; no story past 500 | High | Medium (perception/sales risk; no immediate user incident) | Medium (real benchmarking; honest scaling paragraph) | Add benchmarking story to E11; pin reference hardware. |
| F1.5 | IndexedDB quota / cross-tab race | Low | Medium (degraded UX) | Low (single-writer pattern, quota handler) | Add to E11 acceptance criteria. |
| F2.2 | Rollout Mode enforcement drifts across four sites | Medium | High (calibration mode silently bypassed) | Low (`RolloutModeGuard` primitive) | Mirror the SelfApprovalGuard pattern in E2.5; add to that epic. |
| F2.3 | Approval workflow config change mid-flight produces undefined behavior | Low (rare event) | High (audit defensibility damaged) | Low (snapshot workflow at Recommendation creation) | Add column + sentence to §5.4. |
| F3.1 | BullMQ / Prisma OTEL instrumentation skipped → traces break at queue boundary | High (default trajectory if not specified) | Medium (debugging burden, not user-facing) | Low (4 npm packages + one helper) | Pin in §11.3 now. |
| F3.2, F3.4 | Alerts missing for documented runbooks | High (will ship as-is if not corrected) | Medium (delayed detection of multiple failure modes) | Low (add 5 alert rows) | One PR. Do it before launch. |
| F3.3 | End-of-session-only FPS beacon misses mid-session degradation | High | Medium (you find out about perf issues weeks after they happen) | Low (periodic emit) | Update E11 telemetry story. |
| F1.6 | No automatic degrade to performance mode on low-end hardware | Medium | Medium (some users see broken-looking 3D) | Low (FPS check + LOD switch + banner) | Add to E11 scope. |

---

## My Recommendation

The architecture is, on balance, the right design. Modular monolith + outbox + RLS + InstancedMesh + BullMQ is the correct shape for this product at this stage. I would not redesign anything structural. What I would do this week:

1. **Fix F2.1 immediately.** Add commit-time re-verification to §5.4 Promotion commit transaction. Bind the commit to a ScoreSnapshot ID that must satisfy `eligibility_state = 'ELIGIBLE'` at commit time, not just at Recommendation time. This is one paragraph in the architecture and one acceptance test in E15. It is the single most important fix in this review.

2. **Fix F1.7 immediately.** Change §13.3 to declare `/map/employees` is never server-cached. Remove the "or bypassed entirely" weasel clause. The performance cost is negligible; the privacy cost of getting this wrong is the entire product.

3. **Fix F1.8 in story E11.** Add an explicit acceptance criterion: integration test where a node has `readiness_pct = 100` and `promotion_eligible = false` renders without pulse. And a second test where `eligibility_state = 'PENDING_CALIBRATION'` suppresses pulse. Without these tests, the architecture's "bound to ELIGIBLE, never to Readiness" promise is hope.

4. **Add the `employee_blockers` table to E9 scope** (F2.4). The current `blocker_check` boolean is a footnote pretending to be a feature.

5. **Pin distributed tracing across BullMQ in §11.3** (F3.1) and **add the five missing alerts** to §11.5 (F3.2, F3.4). One day of work; permanently reduces operational pain.

6. **Pin reference desktop hardware in §4.3.11** (F1.1) and write the one-paragraph honest scaling story past 500 (F1.2). Stop hiding behind "LOD will handle it." It won't, and you know it.

Everything else on this list is improvement, not rescue. Items 1 and 2 are rescue. Do them this week.

The PRD is ambitious. The architecture is mostly equal to the PRD. The gaps are real but small. Don't let the small gaps become the launch incident.

— Winston
