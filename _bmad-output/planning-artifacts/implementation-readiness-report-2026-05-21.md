---
stepsCompleted: [step-01-document-discovery, step-02-prd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
filesIncluded:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/stories.md
  - _bmad-output/implementation-artifacts/ (120 sharded story files)
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-21
**Project:** FCM

## Document Inventory

| Document | File | Size | Format |
|---|---|---|---|
| PRD | `_bmad-output/planning-artifacts/prd.md` | 97.8 KB | Whole |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | 64.9 KB | Whole |
| Epics | `_bmad-output/planning-artifacts/epics.md` | 45.5 KB | Whole |
| Stories (canonical) | `_bmad-output/planning-artifacts/stories.md` | 88.3 KB | Whole |
| Stories (sharded specs) | `_bmad-output/implementation-artifacts/*.md` | — | 120 files, epics 1–16 |
| Product Brief (informational) | `_bmad-output/planning-artifacts/product-brief-FCM.md` | 46.8 KB | Whole |
| UX Design | — | — | **MISSING — no `*ux*.md` under planning-artifacts** |

**Resolutions noted:** `stories.md` treated as canonical; sharded files are downstream implementation specs. Absent UX document treated as gap (PRD/architecture absorbed UX inline — confirm intentional).

## PRD Analysis

### Functional Requirements — Counts and Coverage

**Total: 106 FRs across 12 subsections.**

| Section | Topic | FR Range | Count |
|---|---|---|---|
| 11.1 | Authentication & Authorization | FR-1.1 to FR-1.5 | 5 |
| 11.2 | 3D Career Map | FR-2.1 to FR-2.15 | 15 |
| 11.3 | Employee Detail Panel | FR-3.1 to FR-3.17 | 17 |
| 11.4 | Evidence Management | FR-4.1 to FR-4.8 | 8 |
| 11.5 | Scoring Engine | FR-5.1 to FR-5.12 | 12 |
| 11.6 | Configuration | FR-6.1 to FR-6.10 | 10 |
| 11.7 | Promotion Workflow | FR-7.1 to FR-7.14 | 14 |
| 11.8 | Audit Log | FR-8.1 to FR-8.7 | 7 |
| 11.9 | Notifications | FR-9.1 to FR-9.4 | 4 |
| 11.10 | Analytics Dashboard (2D) | FR-10.1 to FR-10.7 | 7 |
| 11.11 | Dashboard (2D) | FR-11.1 to FR-11.3 | 3 |
| 11.12 | Manager Engagement Nudges | FR-12.1 to FR-12.4 | 4 |

### Non-Functional Requirements — Counts and Categories

**Total: 47 NFRs.**

| Category | Section | NFR Range | Count |
|---|---|---|---|
| Performance | 12.1 | NFR-1.1 to NFR-1.6 | 6 |
| Scalability | 12.2 | NFR-2.1 to NFR-2.3 | 3 |
| Reliability | 12.3 | NFR-3.1 to NFR-3.4 | 4 |
| Security | 12.4 | NFR-4.1 to NFR-4.7 | 7 |
| Compliance / Auditability | 12.5 | NFR-5.1 to NFR-5.3 | 3 |
| Observability | 12.6 | NFR-6.1 to NFR-6.5 | 5 |
| Maintainability | 12.7 | NFR-7.1 to NFR-7.4 | 4 |
| Integration | 12.8 | NFR-8.1 to NFR-8.4 | 4 |
| Deployment | 12.9 | NFR-9.1 to NFR-9.6 | 6 |
| Usability / Accessibility | 12.10 | NFR-10.1 to NFR-10.5 | 5 |

### Additional Constraints & Assumptions (35 explicit items)
- 9 Technical Constraints (§13): Next.js / R3F / NestJS / Postgres / Redis / S3 / OIDC / dev–stage–prod / managed cloud
- 9 Product Invariants (§8.8): scoring formula, readiness formula, ETA formula, confidence model, Fibonacci spiral, audit log behavior, mandatory Performance Narrative, Calibration Hold, two-state Rollout Mode
- 6 Assumptions (§17.1) — A1..A6
- 4 Dependencies (§17.2) — D1..D4
- 7 Architect-Level Open Items (§19.3) — AO1..AO7

### Key Personas
Employee (IC) · Manager · Admin / HR — with the explicit rule "exactly one role per Organization" (plus a noted Admin+Employee dual-assignment exception that is itself a flagged ambiguity).

### Critical Domain Concepts (load-bearing)
Score Progress · Readiness % · **Promotion Eligibility (the binary gate)** · ETA + Confidence (paired) · Performance Narrative · Calibration Hold / Flag · Rollout Mode (CALIBRATION / ACTIVE) · Bootstrap Eligibility Snapshot · ScoreSnapshot · Layer · Track Transfer · Evidence Lifecycle · Development Notes (PRIVATE / SHARED_WITH_EMPLOYEE) · Map-Level Anonymization · CDF Seed.

### PRD Completeness Red Flags (20)

1. **Calibration flag reason length conflict** — §6.8 says ≥50 chars; FR-3.15 says ≥40 chars. Resolve before stories that touch the flag UX.
2. FR-9.4 (email/Slack out of scope) phrased as a requirement; belongs in §16 Out of Scope.
3. Cross-doc forward reference §8.6 → "architecture §13.3" is unresolved (no §13.3 in PRD).
4. Readiness % §7.4 formula vs. its "= 0%" edge-case clause are not logically equivalent.
5. Visibility on 3D map: "hidden" (§14.5) vs "anonymized placeholder" (§8.6) — different rendering outcomes.
6. SINGLE-mode approval semantics vs FR-7.6 self-approval prohibition need explicit reconciliation.
7. Notification batching/aggregation rules unspecified (FR-9.1).
8. No per-FR acceptance criteria — stories will be the only place AC live.
9. FR-1.5 session timeout configurable but the configuration surface isn't described.
10. NFR-1.1 / NFR-2.3 silent on degradation beyond 500 employees.
11. Confidence §7.7 — CoV undefined for sparse evidence (e.g., 2 events / 90d).
12. §10.2 indefinite audit retention not restated in FR-8.x.
13. "Active blocker conditions" (§7.5, §8.5) — data model and source unspecified.
14. "Exactly one role per org" vs Admin+Employee dual assignment carve-out (§4.2).
15. NFR-8.4 webhook MVP-vs-V2 boundary ambiguous.
16. NFR-7.4 silent on integration / E2E / contract coverage targets.
17. §14.3 promotion-ready pulse — accessibility toggle UX has no AC.
18. Calibration flag resolution notification path under-specified (§6.8).
19. TrackTransfer not enumerated in §10.1 audit coverage table.
20. CalibrationFlag / RolloutModeChanged events not enumerated in §10.1 audit coverage table.

### PRD Completeness Verdict
**STRONG with caveats.** Volume, structure, and traceability are high (106 FRs, 47 NFRs, explicit invariants and out-of-scope list). The 20 red flags are mostly clarifications and small inconsistencies, not foundational gaps — but items #1, #4, #5, #6, #13, #19, #20 are load-bearing for downstream stories and should be resolved before implementing the Promotion Workflow, Visibility, or Audit epics.

## Epic Coverage Validation

### Epic Inventory (16 epics)

| ID | Title | Anchor |
|---|---|---|
| EPIC-1 | Platform & Operational Foundations | NFR-9.x, NFR-6.x, NFR-2.x, §13 |
| EPIC-2 | Identity, SSO, Tenancy & RBAC | FR-1.x, NFR-4.x |
| EPIC-3 | Audit Spine & Outbox/Event Infrastructure | FR-8.x, NFR-5.x |
| EPIC-4 | Async Job Infrastructure (BullMQ) | FR-5.7, FR-5.11, NFR-3.3, NFR-2.2 |
| EPIC-5 | Realtime Gateway & Push Infrastructure | FR-5.12, FR-9.x, AO7 |
| EPIC-6 | Organization Bootstrap & CDF Seeding | §6.1, §8.x, §14.8 |
| EPIC-7 | Configuration Domain | FR-6.x, FR-7.14, §8.9 |
| EPIC-8 | Evidence Lifecycle, Storage, Review & Expiry | FR-4.x, §6.2, §14.7 |
| EPIC-9 | Scoring & Forecasting Engine | FR-5.x, §7.x |
| EPIC-10 | 3D Map Data Contract & Projection API | FR-2.x, §8.6, §14.5, §8.9 |
| EPIC-11 | 3D Career Map Rendering & Interaction | FR-2.x, §14.3, NFR-1.1 |
| EPIC-12 | 3D Nav Shell, Filters & Detail Panel | FR-2.x, FR-3.x, NFR-10.x |
| EPIC-13 | Promotion Workflow & Track Transfer | FR-7.x, §6.5, §6.8, §6.9, §14.6 |
| EPIC-14 | In-App Notifications & Manager Nudges | FR-9.x, FR-12.x |
| EPIC-15 | 2D Deep Views | FR-8.4–8.7, FR-10.x, FR-11.x |
| EPIC-16 | Operational Hardening & Production Readiness | NFR-1.1, NFR-6.x, NFR-3.x, §17 |

### Coverage Statistics

- Total PRD FRs: **106**
- ✓ Covered: **105 (99.06%)**
- ⚠️ Partial: **1 (0.94%)** — FR-4.2 only
- ❌ Missing: **0 (0%)**
- Epics with no PRD anchor: **0**

### Gaps

**⚠️ FR-4.2 — Evidence submission supports file / URL / text / structured form (PARTIAL)**
EPIC-8's Scope (in) only enumerates the **file-upload** mechanics (pre-signed S3, content-length bounds, org-scoped keys). The PRD §8.4 four-type evidence model (FILE / URL / TEXT / STRUCTURED) is implied through EPIC-7's "Requirements with evidence type" config, but no epic-level story currently calls out the non-file submission paths.
**Risk:** during story decomposition, developers may treat all evidence as files, leaving URL/TEXT/STRUCTURED ungrounded.
**Recommendation:** add one Scope (in) bullet to EPIC-8 explicitly enumerating all four submission paths and the type-aware validation. Also touch EPIC-12 Submit Evidence affordance to be type-aware. No new epic needed.

### Reverse Check — Architecture-Driven Expansions (not creep, worth noting)

- **EPIC-5 WebSocket transport** is architecture-driven (AO7); PRD never mandates push, only auto-refresh. Defensible.
- **EPIC-16 cold-tier archival** is a perf/cost concern beyond the PRD's "indefinite retention" baseline. Defensible.
- **EPIC-12 List View toggle** delivers more accessibility than PRD requires (3D canvas is exempt from screen-reader parity); defensible R9 mitigation.
- **EPIC-13 `RESOLVED_REJECT` substate** elaborates PRD §6.8 Release/Reject states; defensible.

### NFR Spot-Check (high-impact categories)

| NFR Category | Verdict | Where Covered |
|---|---|---|
| Performance (NFR-1.x) — 500-employee 3D | ✓ Covered | EPIC-11 (LOD, BVH, InstancedMesh, Web Worker, perf budget) + EPIC-16 (500-node FPS verification, recalc storm test) |
| Reliability (NFR-3.x) — determinism / idempotency | ✓ Covered | EPIC-9 (zero-I/O pure fns, `now` param, determinism tests) + EPIC-4 (idempotency registry, DLQ, exp. backoff) + EPIC-13 (single-tx promotion commits) |
| Security (NFR-4.x) — org isolation, URLs | ✓ Covered | EPIC-2 (RLS, three-layer RBAC) + EPIC-8 (pre-signed S3 TTLs) + EPIC-1 (secret manager) + EPIC-16 (URL scope + cross-tenant regression) |
| Compliance (NFR-5.x) — immutable audit | ✓ Covered | EPIC-3 (DB-level append-only enforcement, partitioned, outbox-fed) — every domain epic emits via outbox |
| Observability (NFR-6.x) | ✓ Covered (strongest) | EPIC-1 (pino, Prometheus, OTel, Sentry) + EPIC-4 (per-queue metrics, DLQ alert) + EPIC-16 (Grafana, SLO alerts, runbooks) |

**Implicit-only NFRs (worth a single explicit callout in EPIC-1 or EPIC-16):** NFR-7.4 (≥70% unit coverage target) and NFR-8.2 (OpenAPI 3.0 spec).

### Top 5 Implementation Risks Surfaced by Coverage Analysis

1. **FR-4.2 evidence-type drift** — EPIC-8 phrasing biases toward file uploads; URL/TEXT/STRUCTURED easy to miss in stories. → explicit per-type story.
2. **Cross-epic Rollout Mode enforcement leak** — the same gate is enforced in EPIC-7, -10, -12, -13. One miss = a silent leak in CALIBRATION mode. → EPIC-13's "four independent gate paths" integration suite is non-negotiable; EPIC-10's "no `eligibility_state='ELIGIBLE'` payloads when org is CALIBRATION" must run in CI.
3. **Score vs Readiness vs Eligibility binding** — particularly EPIC-11's emissive pulse: must bind to `promotion_eligible`, never `readiness_pct`. Story-level AC must assert the binding source field, not just the visual effect.
4. **EPIC-10 cache-key safety** — `/map/employees` must include `viewer_id + visibility_scope + promotion_mode` in the cache key; mis-keyed cache between two viewers in different visibility scopes = privacy incident. → integration tests in EPIC-10 + cross-viewer assertions in EPIC-16 regression suite.
5. **Critical path EPIC-9 → 10 → 11 → 12 → 13** — Initiate Promotion only end-to-end testable once five epics are integrated. → contract-first development on `score_snapshots` and `/map/employees` (freeze contracts before EPIC-12 stories start); stubbed-data integration in EPIC-12 and -13 against frozen contracts.

## UX Alignment Assessment

### UX Document Status

**Not Found.** No `*ux*.md` artifact exists under `_bmad-output/planning-artifacts/`. UX is heavily implied — this is a primarily user-facing product (3D Career Map, Detail Panel, Filters, Dashboard, Analytics) with explicit UI rules in PRD §5, §14 and accessibility requirements NFR-10.x.

### What the PRD/Architecture Carry Instead

The PRD absorbs much of what a UX spec would typically contain:

- **Component-level UX rules** — PRD §5 (Top Nav, Persistent 3D Canvas, Left Filters Panel, Right-Slide Detail Panel, Notification Bell, Dashboard, Analytics, Full Profile, Audit Browser, Settings, Sign-In) defines structure, slot, and behavior for each surface.
- **Visual encoding contract** — PRD §14.3 specifies the level color palette, readiness-encoding strategy (brightness/opacity with 40% floor), promotion-ready pulse, and `prefers-reduced-motion` fallback.
- **Accessibility AC** — NFR-10.3 (colorblind-safe), NFR-10.4 (keyboard nav for 2D), NFR-10.5 (screen reader for 2D, aria-label summaries for 3D).
- **Interaction model** — PRD §14.5 (rotate / zoom / click / hover / reset) — these are encoded as discrete FRs (FR-2.7 through FR-2.11).
- **Empty / loading states** — partially addressed: PRD describes "recalculation pending" UI (FR-5.12) and CALIBRATION banners (FR-3.16, FR-7.13), but no explicit empty-state catalog.
- **Error states / structured errors** — addressed in architecture for promotion API rejections (FR-7.4, FR-7.12, FR-7.13) but no user-facing copy or error-state UI catalog.

### Architecture Support for Implied UX

- **Performance for UX responsiveness:** EPIC-11 + EPIC-16 cover NFR-1.x (≥30fps, panel ≤500ms). ✓
- **Frontend stack alignment:** EPIC-1 (Next.js 14 App Router + dark mode), EPIC-11 (R3F scene graph). ✓
- **Realtime auto-refresh of UI on async completion:** EPIC-5 Socket.IO push (FR-5.12, FR-9.x). ✓
- **Accessibility:** EPIC-12 explicitly delivers accessible List View toggle + aria-label canvas summary. ✓ (delivers *more* than PRD strictly requires, defensible.)

### Alignment Gaps & Warnings

**⚠️ Warning 1 — No dedicated UX specification.** No design tokens, no component library spec, no Figma/wireframe reference, no copy deck, no design-system pattern library. Acceptable risk if a single design lead owns the visual language, but the absence will surface as:
- Inconsistent micro-copy (button labels, error messages, empty-state copy).
- Inconsistent spacing/typography across the Dashboard, Detail Panel, Analytics, Audit Browser, Settings.
- Drift between EPIC-12 (panel) and EPIC-15 (2D deep views) without a shared component/token contract.

**⚠️ Warning 2 — Empty / loading / error state catalog missing.** The PRD names a few specific states ("Eligible — Pending Calibration" banner, "Recalculation pending" indicator) but does not enumerate all empty/loading/error states for: a fresh org with zero evidence, a brand-new employee at L1 with zero data, an offline socket, a stalled BullMQ job, a calibration flag reason validation failure, a Performance Narrative below 200 chars at the API boundary, etc.

**⚠️ Warning 3 — Notification UX details under-specified.** FR-9.1 enumerates trigger events but not aggregation rules, sort order, snooze behavior, or click-through navigation. EPIC-14 implements the entity and a notification center, but visual rules are inferred.

**⚠️ Warning 4 — Promotion-ready pulse accessibility toggle UX unspecified.** PRD §14.3 mentions "animation-off variant or shape variation" as the `prefers-reduced-motion` fallback, but no AC for where the user-level toggle lives (browser preference only? user-settings panel? per-session?).

### UX Verdict

**ACCEPTABLE for MVP** because the PRD has internalized most component-level UX rules and the architecture carries the performance/accessibility envelope. **However:** the four warnings above should be resolved during sprint planning rather than discovered story-by-story. Recommend a lightweight design-tokens + empty/loading/error-state catalog produced before EPIC-12 stories begin, and a short notification-UX micro-spec before EPIC-14 stories begin.

## Epic & Story Quality Review

### Critical Violations (🔴 6 — must fix before EPIC-6+ implementation)

| # | Violation | Evidence | Fix |
|---|---|---|---|
| V1 | **Missing `employees` table migration** (and `employee_assignments` / manager-relationship). Pervasive across E6–E15. STORY-E8.1 evidence migration declares `employee_id` FK with no target; E13.8 says "updates `employees.level_id`"; E6.5 CSV import implies the table; STORY-E5.3 references manager-team rooms; STORY-E8.3 references "direct manager" RBAC — yet no story creates the table. | Grep on `stories.md` for `Migration creates` returns 12 entities; **no `employees`**. | Add `STORY-E6.2a — employees & employee_assignments tables` between E6.2 and E6.5. Add `employee_id` FK targets to E8.1 and E9.4 migrations. |
| V2 | **Missing `approval_records` migration.** STORY-E8.4 writes to the table; STORY-E14.5 reads from it; nothing creates it. | `stories.md:644` writes, `:1205` reads. | Add migration AC to STORY-E8.4 or insert a precursor schema story. |
| V3 | **Circular dependency E14.4 ↔ E15.1.** | `stories.md:1198` (E14.4 → E15.1) and `:1222` (E15.1 → E14.4). | Drop `E14.4` from STORY-E15.1's depends. E15.1 owns the role-scoped shell with placeholders; E14.4 fills them. |
| V4 | **Forward dependency E7.10 → E13.2** PLUS missing tables: STORY-E7.10's prose claims it "owns table provisioning for `bootstrap_eligibility_snapshots` and `rollout_mode_transitions` for transactional atomicity," but no AC creates them, and STORY-E13.2 doesn't either. | `stories.md:587` declares the forward dep; `:589` notes the ownership ambiguity. | Split STORY-E7.10 into 7.10a (tables) + 7.10b (endpoint), drop the E13.2 dependency. |
| V5 | **Forward dependency E13.5 → E13.6** (intra-epic). E13.5 is also borderline pointless on its own per its own self-note. | `stories.md:1083`. | Reorder E13.6 before E13.5, or merge E13.5 into E13.7 with a "re-recommend after calibration release" AC. |
| V6 | **Implicit unstated dependency E8.4 → E2.5 (SelfApprovalGuard).** Likely many similar implicit deps across stories that call ActorContext, RLS scoping, outbox emission. | `stories.md:643` calls `SelfApprovalGuard.ensureNotSelf` defined in E2.5; `:647` depends on `E8.1, E4.2` only. | Audit and add E2.5 / E2.6 / E3.3 to depends-on lines wherever those primitives are used. |

### Major Issues (🟠 7)

1. **M1 — Sharded story files have boilerplate Dev Notes and empty Tasks.** All 119 backlog shards have identical generic Dev Notes ("Respect modular-monolith boundaries… outbox if externally observable") and placeholder Tasks ("Task covering AC #N"). Only `1-1` is fleshed out (because it's implemented). PM or dev agent must rehydrate stories before each sprint pull.
2. **M2 — STORY-E7.10 shard has "As a TBD, I want TBD."** `7-10-…md` lines 7–8. Canonical `stories.md:579` has the right text — the shard tool regressed. Re-run sharding + spot-check 10 random shards against canonical.
3. **M3 — Range dependencies hide the DAG.** STORY-E10.1: `Depends on: E7.1–E7.3`; STORY-E7.11: `E7.1–E7.10`. Expand to explicit comma-lists so dependency tooling works.
4. **M4 — STORY-E13.5 fails the "would a user notice if missing?" test alone.** Per its own AC #1, it doesn't apply to DUAL_MANAGER or HR_GATE workflows. Merge into E13.7.
5. **M5 — `eligibility_state` enum value set is inconsistent.** STORY-E10.2/E10.4 imply `ELIGIBLE`/`PENDING_CALIBRATION`; STORY-E12.4 enumerates four values including `CALIBRATION_HOLD`/`NOT_ELIGIBLE`; STORY-E15.5 mentions only two. Pin the canonical enum in EPIC-9 or EPIC-10 to `{ELIGIBLE, NOT_ELIGIBLE, PENDING_CALIBRATION, CALIBRATION_HOLD}`.
6. **M6 — Missing `track_transfers` table migration.** STORY-E13.9:1126 inserts into it but no migration AC.
7. **M7 — Missing `development_notes` table migration.** STORY-E12.7 implies the table but no migration AC.

### Minor Concerns (🟡 7)

- **m1** `prefers-reduced-motion` coverage split across E11.7 + E12.10 — no single story owns the contract.
- **m2** Architecture §16 referenced only in E16.4 — inconsistent traceability density.
- **m3** Typo `FR-NFR-8.1` in STORY-E6.5:469.
- **m4** HR role not in the `EMPLOYEE/MANAGER/ADMIN` enum from E2.1 — but E13.6 says "HR only." Resolve: HR = a specific ADMIN flag, a separate role, or a permission? Define before EPIC-13.
- **m5** No explicit story serves the `recalculation_pending` flag on the employee DTO (E9.8 AC #3 leans on E4.6 type-only).
- **m6** STORY-E13.5 is the only story marked "small-correction." If there's a corrections process, document it.
- **m7** Boilerplate outbox advice in every shard Dev Notes — per-story payloads would be more actionable.

### Scorecard (16 epics × 7 criteria)

Legend: ✅ pass · ⚠ partial · ❌ fail

| Epic | User value | Indep. | Sized | No fwd deps | DB timing | AC clarity | FR trace |
|---|---|---|---|---|---|---|---|
| E1 Platform | ⚠ (deliberate infra) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠ |
| E2 Identity/RBAC | ⚠ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ |
| E3 Audit Spine | ⚠ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E4 Job Infra | ⚠ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| E5 Realtime | ⚠ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |
| E6 Bootstrap | ✅ | ✅ | ✅ | ✅ | ❌ (employees missing) | ✅ | ✅ |
| E7 Configuration | ✅ | ❌ (→ E13.2) | ✅ | ❌ | ❌ (rollout tables) | ✅ | ✅ |
| E8 Evidence | ✅ | ✅ | ✅ | ✅ | ❌ (approval_records) | ✅ | ✅ |
| E9 Scoring | ✅ | ✅ | ✅ | ✅ | ⚠ | ⚠ | ✅ |
| E10 Map Data | ⚠ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |
| E11 3D Render | ✅ | ✅ | ⚠ (E11.4 large) | ✅ | n/a | ⚠ ("reference desktop") | ✅ |
| E12 Nav/Panel | ✅ | ✅ | ✅ | ✅ | ❌ (dev_notes) | ⚠ (E12.4 happy-path only) | ✅ |
| E13 Promotion | ✅ | ✅ | ⚠ (E13.5 small) | ❌ | ❌ (track_transfers) | ✅ | ✅ |
| E14 Notifs | ✅ | ❌ (↔ E15.1) | ✅ | ❌ | ✅ | ✅ | ✅ |
| E15 2D Views | ✅ | ❌ (↔ E14.4) | ✅ | ❌ | ✅ | ✅ | ✅ |
| E16 Hardening | ⚠ | ✅ | ✅ | ✅ | n/a | ✅ | ⚠ |

### Top 3 Quality Recommendations

1. **Create the 5–6 missing entities before any sprint pulls EPIC-6+.** Without `employees`, EPIC-6 cannot finish; without `approval_records`, EPIC-8 cannot finish; etc.
2. **Break the E14↔E15 cycle and the E7→E13/E13→E13 forward deps with 3 dependency-line edits.** All localized; no story re-decomposition needed.
3. **Rehydrate sharded stories** with per-story Dev Notes and Tasks before each sprint pull (and re-run shard tool to fix E7.10).

---

## Summary and Recommendations

### Overall Readiness Status

**🟠 NEEDS WORK — but blockers are localized and cheap to fix (single planning pass, < 1 day).**

The PRD, architecture, epics, and stories are unusually well-developed for a project of this complexity (106 FRs, 47 NFRs, 16 epics, 120 stories with consistent file structure). EPIC-1 Story 1 is already implemented and demonstrates a strong execution pattern. **However:** 6 critical issues localized to a small number of stories will block sprints from EPIC-6 onward if not fixed first. Once those are addressed, the project is **READY** for sustained development.

### Critical Issues Requiring Immediate Action

| # | Issue | Blocks | Fix complexity |
|---|---|---|---|
| 🔴 1 | Missing `employees` & `employee_assignments` table migration | All of EPIC-6 onward; CSV import; manager relationships; RBAC scoping | 1 new story |
| 🔴 2 | Missing `approval_records` table migration | EPIC-8 evidence approvals; EPIC-14 latency report | 1 AC or 1 story |
| 🔴 3 | Circular dep STORY-E14.4 ↔ STORY-E15.1 | EPIC-14 nudges + EPIC-15 dashboard | 1 dependency-line edit |
| 🔴 4 | STORY-E7.10 forward-deps on E13.2 AND lacks migration AC for `bootstrap_eligibility_snapshots` + `rollout_mode_transitions` | EPIC-7 rollout-mode transition; CALIBRATION→ACTIVE flow | Split E7.10 into 7.10a (tables) + 7.10b (endpoint) |
| 🔴 5 | STORY-E13.5 forward-deps on STORY-E13.6 within EPIC-13 | EPIC-13 sequencing | Reorder or merge into E13.7 |
| 🔴 6 | Implicit unstated deps on E2.5 / E2.6 / E3.3 across many stories (SelfApprovalGuard, ActorContext, RLS, outbox) | Sprint-time surprises | One-pass audit of depends-on lines |

Plus these table migrations also missing: `track_transfers` (E13.9), `development_notes` (E12.7).

### PRD-Level Items to Reconcile (load-bearing red flags from Step 2)

1. **Calibration flag reason length conflict** — §6.8 says ≥50 chars; FR-3.15 says ≥40 chars. Pick one.
2. **Readiness % formula vs "= 0%" edge-case** — §7.4 formula and prose don't fully agree.
3. **3D map visibility for OWN_ONLY** — "hidden" (§14.5) vs "anonymized placeholder" (§8.6).
4. **SINGLE-mode approval vs FR-7.6 self-approval prohibition** — reconcile.
5. **"Active blocker conditions"** — data model and source unspecified (§7.5, §8.5).
6. **Eligibility-state enum value set** — pin canonical 4-value enum {ELIGIBLE, NOT_ELIGIBLE, PENDING_CALIBRATION, CALIBRATION_HOLD} for cross-story consistency.
7. **HR role status** — not in the `EMPLOYEE/MANAGER/ADMIN` enum but referenced as "HR only" across many stories. Define before EPIC-13.

### Recommended Next Steps (in order)

1. **Run a one-day planning patch sprint** addressing all 6 critical issues + 5–6 missing migrations. Output: amended `stories.md` and re-sharded files. (Highest ROI work in this whole project right now.)
2. **Resolve the 7 load-bearing PRD red flags above** with brief PM/architect notes — these need to be settled before EPIC-7, EPIC-9, EPIC-10, EPIC-12, or EPIC-13 stories are pulled.
3. **Rehydrate sharded stories with per-story Dev Notes and Tasks** before each sprint pull, starting with the next 5–10 stories (EPIC-1 remainder + EPIC-2 first stories). Re-run `shard_stories.py` to fix the STORY-E7.10 "As a TBD" regression and spot-check 10 other shards.
4. **Then resume development** with `dev this story _bmad-output/implementation-artifacts/1-2-nestjs-api-scaffold-with-dual-mode-bootstrap.md`. EPIC-1 has no missing-entity blockers; safe to proceed in parallel with item #1 above.
5. **Treat the 5 implementation risks** (FR-4.2 evidence-type drift, Rollout Mode leak, Score/Readiness/Eligibility binding, EPIC-10 cache-key safety, EPIC-9→13 critical path) as standing CI guardrails — write the integration tests called out in EPIC-13 and EPIC-16 *early*, not at hardening.

### Coverage Statistics — One-Line Summary

- **FR Coverage**: 105 / 106 = **99% ✓ Covered**, 1 ⚠ Partial (FR-4.2), 0 Missing.
- **NFR Coverage**: All 5 high-impact NFR categories ✓ Covered.
- **Epic Quality**: 16 epics, 4 with forward-dep / circular-dep issues, 12 clean.
- **Story Quality**: 120 stories, ~6 with critical issues, ~7 with major issues, 119 with boilerplate Dev Notes pending rehydration.

### Final Note

This assessment identified **6 critical + 7 major + 7 minor structural issues** plus **20 PRD red flags** plus **4 UX warnings**. The vast majority are localized to specific stories or short PRD sections and can be resolved in a single ~1-day planning patch sprint. After that patch, the project is implementation-ready. The planning artifacts represent strong work — better-traced and more architecturally coherent than typical projects of this scope — and the gaps above are the kind of friction that surfaces when planning fidelity is high enough that the seams become visible.

**Assessor:** Claude (Implementation Readiness skill, PM facilitator role)
**Date:** 2026-05-21
**Report file:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-21.md`


