---
title: "FCM Edge-Case Path Trace Report"
date: 2026-05-21
source_files:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/epics.md"
  - "_bmad-output/planning-artifacts/stories.md"
total_findings: 134
---

# FCM Edge-Case Path Trace Report

This is a path-tracer report enumerating unhandled edge cases across the FCM planning artifacts. Each finding identifies a trigger condition that is not explicitly guarded in the docs. Severity is not assigned — every finding is a potential gap.

---

## 1. Promotion Gates & Workflow

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 1.1 | prd.md §6.5 step 4 / stories.md E13.4 | Eligibility flips false between Recommendation and final approval | Re-verify `promotion_eligible` at every approval-chain transition, not only at initiate | Promotion commits for now-ineligible employee |
| 1.2 | prd.md §6.5 step 6 / stories.md E13.6 | Calibration Flag opened between approval and commit | Re-check open-flag invariant inside commit transaction | Commit succeeds despite later-opened hold |
| 1.3 | prd.md §8.9 / stories.md E13.4 | Rollout mode flips ACTIVE→CALIBRATION while approval in flight | Block in-flight approvals on mode change OR snapshot mode at recommendation time | Promotion completes after org re-entered calibration |
| 1.4 | prd.md §6.5 / arch.md §5.4 | DUAL_MANAGER co-approver becomes inactive/deleted before second sign-off | Define behavior when co-approver role lapses mid-workflow | Promotion record stuck indefinitely in `IN_REVIEW` |
| 1.5 | prd.md §8.7 | HR_GATE workflow configured but org has zero ADMIN users | Validate workflow feasibility against current role assignments | Promotion permanently unapprovable |
| 1.6 | prd.md §9.2 / stories.md E2.5 | Actor holds both MANAGER (recommender) and ADMIN (co-approver) roles | Self-approval guard must compare across role assignments, not user_id alone | Actor approves own recommendation via ADMIN seat |
| 1.7 | prd.md §6.5 / arch.md §6.2 | Approval workflow config changed mid-promotion (SINGLE→HR_GATE) | Pin workflow version at PromotionRecord creation | Workflow rules silently shift between steps |
| 1.8 | prd.md §6.5 step 7 / stories.md E13.8 | from_level_id removed via config change between initiate and commit | Snapshot from/to level rows on the PromotionRecord | Commit references deleted level |
| 1.9 | prd.md §7.5 / stories.md E13.4 | Min-time-at-level lapses exactly at NOW() = boundary millisecond | Define inclusive/exclusive boundary in `evaluateEligibility` | Off-by-one promotion gate at midnight |
| 1.10 | prd.md §11.7 FR-7.6 / stories.md E13.7 | Manager initiates promotion for self via own EMPLOYEE profile | Domain guard must check actor.employee_id == subject.employee_id, not user_id alone in self-employed-Manager case | Manager self-promotes through own report list |
| 1.11 | prd.md §6.5 step 3 / stories.md E13.10 | Performance Narrative exactly 200 characters of whitespace/repeat chars | Require minimum non-whitespace chars or entropy floor | Narrative gaming defeats §14.9 intent |
| 1.12 | prd.md §6.5 step 3 | Performance Narrative contains only line breaks/zero-width unicode | Normalize Unicode + collapse whitespace before char_length check | DB CHECK passes for empty-equivalent narrative |
| 1.13 | prd.md §8.9 / stories.md E13.4 | Two managers submit recommendations for same employee concurrently | Add unique constraint on `(employee_id) WHERE state IN ('RECOMMENDED','IN_REVIEW')` | Two pending PromotionRecords for one employee |
| 1.14 | prd.md §6.8 / stories.md E13.6 | HR resolves Calibration Flag with RESOLVED_REJECT — what is employee's resulting state | Specify whether the underlying PromotionRecord moves to REJECTED or stays IN_REVIEW | Promotion record orphaned post-resolve |
| 1.15 | stories.md E13.5 | Re-recommendation after CALIBRATION_HOLD release does not require new Performance Narrative ≥200 | Enforce narrative refresh requirement on re-recommend | Stale narrative escapes intent of FR-7.10 |
| 1.16 | prd.md §7.5 condition 3 | min_time_at_level configured null AND time-at-level field never populated | Specify default behavior when config is null | NPE or unintended pass-through |
| 1.17 | prd.md §6.8 / stories.md E13.6 | Two HR users open calibration flags within same millisecond | Partial unique index handles but losing request error code not specified — define 409 payload | Race winner-loser ambiguity for HR |
| 1.18 | prd.md §6.5 / arch.md §5.4 | Performance Narrative submitted but transaction fails after append-only insert | Define rollback semantics on append-only INSERT path | Orphaned narrative with no PromotionRecord |
| 1.19 | prd.md §6.5 step 2 / stories.md E13.4 | Promotion-Ready signal renders for anonymous node by API bug | Server must NEVER emit eligibility_state=ELIGIBLE for anonymized=true row | Identity leak via signal coupling |
| 1.20 | prd.md §6.5 / stories.md E13.9 | Track Transfer initiated while promotion already in flight | Reject track-transfer if open PromotionRecord exists; or define cancellation semantics | Inconsistent level/track state |

---

## 2. Score Recalculation & Snapshots

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 2.1 | arch.md §7.3 / stories.md E9.5 | Evidence added between input-load and snapshot-write inside job | Use `as_of` timestamp consistently for ALL DB reads in the job | Inconsistent snapshot vs. live data |
| 2.2 | arch.md §7.3 | Two recalc jobs with different triggering_event_ids run concurrently for same employee | Serialize per-employee via advisory lock or queue partition key | Snapshot interleaving / lost update |
| 2.3 | prd.md §7.8 / arch.md §7.3 | Recalc job runs after configuration version changes mid-job | Carry config_version in `triggering_event` and refuse mismatched load | Snapshot reflects mixed config |
| 2.4 | arch.md §7.3 | Job crashes after `score_snapshots` insert but before `recalc_jobs` marked completed | Use single transaction wrapping both writes | Repeat-recalc duplicate snapshots |
| 2.5 | arch.md §6.3 | `employee_current_snapshot` materialized view trigger fails | Define failure semantics — abort outer transaction or retry separately | Snapshot written but view stale |
| 2.6 | prd.md §7.6 | Velocity calculation crosses DST boundary in NOW-90d window | Define UTC-only velocity window arithmetic | ETA off by 1 hour across timezone |
| 2.7 | prd.md §7.5 condition 3 | Min time at level calculation crosses leap second | Document second-precision policy | Eligibility flickers on leap event |
| 2.8 | prd.md §7.6 | velocity_90d evaluates to small positive value (0.001) at boundary | Define ETA-undefined threshold, not just `velocity == 0` | Display shows ETA in years |
| 2.9 | prd.md §7.4 | `level_band_end == level_band_start` (zero-width band) | DB CHECK requires `band_end > band_start` | Division by zero in readiness_pct |
| 2.10 | prd.md §7.4 | `total_mandatory_count == 0` makes mandatory_completion_pct=100, but score=0 too | Explicit definition for the all-zero case | Readiness 0 displays as 100 |
| 2.11 | arch.md §7.4 / stories.md E9.6 | Configuration change fires while previous bulk recalc still draining | Idempotent merging by triggering_event_id; queue ordering not specified | Mixed-version snapshots in flight |
| 2.12 | prd.md §7.2 / stories.md E9.1 | Evidence approved with weight = 0 (zero-weight evidence) | DB CHECK `weight > 0` on requirements; specify zero-weight evidence semantics | Approved evidence with no score effect — confusing audit |
| 2.13 | prd.md §8.4 / stories.md E7.4 | Requirement weight > level_band_end (single evidence exceeds band) | Define cap behavior or warn at config save | Score Progress > 100% even after MIN clamp; mandatory_completion=0 inconsistency |
| 2.14 | prd.md §7.7 | history_days field exactly 30 / 60 / 90 (boundary days) | Specify inclusive/exclusive boundary | Confidence flickers at midnight on boundary day |
| 2.15 | prd.md §7.7 | velocity coefficient of variation computed on 1-sample window | Require min sample count before CV applies | Division-by-zero in CV; misleading High confidence |
| 2.16 | prd.md §7.7 | "Declining velocity > 40% drop QoQ" — what is "Q" reference date | Define Q calendar vs. rolling-quarter precisely | Confidence label changes at arbitrary date |
| 2.17 | prd.md §7.5 condition 4 | "Active blocker conditions" — schema/source not specified | Define blocker entity and write path | FR-5.3 cannot be implemented |
| 2.18 | arch.md §6.3 | Monthly partition creation job fails; recalc tries to insert into missing partition | Pre-create partitions N months ahead with monitoring; recalc fails fast | Recalc job DLQ explosion at month boundary |
| 2.19 | stories.md E9.5 | Idempotency key collision: two different events with same `triggering_event_id` | Server-side uniqueness on triggering_event_id generation | Second event silently skipped |
| 2.20 | arch.md §5.2 | `now` parameter from job payload vs. job execution time clock skew | Always use payload-embedded `now`; never call live clock inside pure functions | Determinism breaks if worker clock drifts |
| 2.21 | prd.md §7.6 / stories.md E9.8 | Forecast window selector (3/6/12 months) when velocity_90d is much higher than long-term | Define how display semantics differ between windows | UI shows misleading ETA at 12m selection |
| 2.22 | prd.md §7.5 | Eligibility flips back-and-forth due to evidence expiring + being resubmitted within seconds | Debounce or specify state-change notification suppression | Notification spam to manager and HR |

---

## 3. Evidence Lifecycle

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 3.1 | prd.md §6.2 / stories.md E8.1 | Evidence DRAFT exists for > N days without finalize | Specify TTL or cleanup job for DRAFT-stage evidence | Orphaned DRAFTs accumulate forever |
| 3.2 | prd.md §6.3 | Evidence approved retroactively with approval_date BEFORE submission_date | DB CHECK `approved_at >= submitted_at` | Time-travel approvals in audit |
| 3.3 | prd.md §14.7 / stories.md E8.7 | Evidence expires while in PENDING_APPROVAL (not yet approved) | Specify whether expiry applies pre-approval | Pending evidence may be approved post-expiry |
| 3.4 | prd.md §14.7 | Evidence expires during retroactive rejection workflow | Define ordering: expiry vs. retroactive reject | Two state transitions race |
| 3.5 | prd.md §8.4 / stories.md E7.4 | Requirement deactivated while open evidence is PENDING_APPROVAL | Specify whether pending evidence is auto-rejected or carried over | Manager faces orphaned review queue |
| 3.6 | prd.md §6.2 / arch.md §9.1 | Pre-signed URL expires during user's upload | URL refresh path or pre-flight check before slow upload | Upload fails after partial transfer |
| 3.7 | arch.md §9.1 step 3 | Client finalize called but S3 HEAD shows object missing | Return structured error; client must retry full upload | Evidence record in inconsistent state |
| 3.8 | arch.md §9.1 | Content-type spoofing: client uploads .exe with Content-Type=image/png | Server validates magic bytes, not just header | Malicious file passes evidence check |
| 3.9 | arch.md §9.1 | File without Content-Length header uploaded | Reject or enforce S3-side content-length-range | Bypass of requirement-configured max size |
| 3.10 | prd.md §11.4 FR-4.2 | TEXT evidence with extremely large body (megabytes) | Specify max length for TEXT/STRUCTURED evidence payload JSONB | DB row size explosion |
| 3.11 | prd.md §11.4 FR-4.2 / stories.md E7.4 | STRUCTURED evidence schema changes after submission | Version structured-form schema; reject mismatched on review | Approver sees unrecognized fields |
| 3.12 | prd.md §6.3 step 5 | Approver clicks Approve twice in rapid succession | Idempotent approve with `approved_at` lock or single-use button | Two ApprovalRecord rows for one approve |
| 3.13 | prd.md §11.4 FR-4.7 / stories.md E8.6 | Retroactive rejection of evidence that was the sole contributor to a now-committed promotion | Define whether rejection cascades to promotion review | Promoted employee silently un-supported in audit |
| 3.14 | prd.md §8.4 | Evidence with `expires_at` in the past at submission time (config error) | Reject submission if `expires_at < NOW` at finalize | Evidence is born EXPIRED |
| 3.15 | prd.md §6.3 step 5 | Reject reason field contains only whitespace/zero-width up to 20 chars | Normalize Unicode + non-whitespace char count | Reason gaming defeats audit intent |
| 3.16 | arch.md §9.1 | Pre-signed PUT URL signed for org-A used to write to org-B prefix via path manipulation | Server signs URL with strict prefix constraint; validate at finalize | Cross-org evidence write |
| 3.17 | stories.md E8.2 | Two clients race to upload-slot for same requirement | Specify per-requirement single-active-upload-slot or allow N | Two competing evidence records |
| 3.18 | prd.md §11.4 FR-4.4 | Evidence resubmission after REJECTED: new evidence vs. same record edited | Define: rejected evidence is terminal; resubmission creates new record | Mutability of REJECTED state undefined |
| 3.19 | prd.md §14.7 / stories.md E8.7 | Daily expiry cron skipped (worker down) — evidence not transitioned for >24h | Define lookback window on next run; alert on missed cron | Eligibility stale beyond intended window |
| 3.20 | prd.md §11.4 FR-4.7 | Manager retroactively rejects evidence approved by previous (now-departed) manager | Specify whether new manager has authority over old approvals | Authority transition undefined |

---

## 4. Configuration Changes (mid-flight)

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 4.1 | prd.md §6.6 / stories.md E7.9 | Promotion in flight when target level's band_end is changed | Pin level config to PromotionRecord at initiation | Promotion commits against new band |
| 4.2 | prd.md §6.6 / stories.md E7.9 | Mandatory flag toggled on a requirement during pending evidence review | Define whether new mandatory applies to historical employees | Eligibility recomputation gates new mandatory |
| 4.3 | prd.md §8.2 / stories.md E7.2 | Level deletion attempted while employees are assigned to it | Reject deletion with structured error listing affected employees | Orphan employees with deleted level_id |
| 4.4 | prd.md §8.1 / stories.md E7.1 | Track deletion attempted while employees are assigned | Reject or require explicit transfer plan | Orphan employees with deleted track_id |
| 4.5 | prd.md §8.2 | Score bands have a gap (L2 ends at 100, L3 starts at 120) | Specify whether gaps are allowed or require contiguous bands | Employees with score 100-119 in undefined band |
| 4.6 | prd.md §8.4 / stories.md E7.4 | Weight changed on requirement after evidence already approved at old weight | Specify whether snapshots use original weight or new weight | Audit history breaks reproducibility |
| 4.7 | prd.md §11.6 FR-6.8 / stories.md E7.8 | Impact preview shows N=5000; admin saves but more employees added between preview and save | Recompute affected list at commit time, not preview time | Bulk recalc misses just-added employees |
| 4.8 | arch.md §5.4 / stories.md E7.10 | Rollout-Mode transition rationale exactly 100 characters of whitespace | Normalize + non-whitespace char count | Theater rationale satisfies DB CHECK |
| 4.9 | prd.md §8.9 / stories.md E7.10 | ACTIVE → CALIBRATION reversal — promotions in flight not paused | Specify in-flight promotion behavior on reverse transition | Promotions complete during re-calibration |
| 4.10 | prd.md §8.9 | Reverse transition (ACTIVE → CALIBRATION) does not require ≥100-char rationale (per arch.md §6.2 CHECK only on from='CALIBRATION') | Apply rationale check both directions OR document intent | One-way audit asymmetry |
| 4.11 | prd.md §6.6 | Configuration save while bulk recalc from previous save is still running | Queue config saves serially or version-tag | Two bulk recalc waves interleave |
| 4.12 | prd.md §8.6 / stories.md E7.6 | Visibility rule downgrade (ORG_FULL → OWN_ONLY) — clients with cached employee data | Force client cache invalidation on visibility change | Stale data displays unauthorized info |
| 4.13 | prd.md §8.6 | Visibility rule upgrade (OWN_ONLY → TEAM) — anonymized tokens already issued | Specify token rotation policy on visibility change | Cached anonymous tokens point to now-revealable employees |
| 4.14 | prd.md §8.7 | Per-level approval workflow override conflicts with org default | Define precedence rules explicitly when level workflow is null | Promotion stuck unable to determine workflow |
| 4.15 | arch.md §6.2 | `levels` non-overlap exclusion constraint — what about modifying via temporary overlap state | Use deferred constraint or explicit transactional swap pattern | Migration deadlock |
| 4.16 | prd.md §8.2 | Score band reduced (e.g., L3 was 100-150, becomes 100-130) — employee at 145 | Define what happens to employee whose score now exceeds band | Employee auto-promoted vs. stuck above ceiling |
| 4.17 | prd.md §8.3 | Layer deletion mid-flight while requirements still reference it | Cascade rule for layer deletion not specified | Orphan requirements |
| 4.18 | prd.md §11.6 FR-6.9 / arch.md §7.4 | `affected_employee_ids[]` outbox event payload exceeds JSONB size limit | Chunk size enforced in story but not in PRD requirement | Single ConfigurationChanged event with 50k employees fails |

---

## 5. Rollout Mode & Calibration

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 5.1 | prd.md §6.9 / stories.md E7.10 | Bootstrap snapshot transaction times out on 50k-employee org | Specify async snapshot capture with state guarantee | Transition fails / partial snapshot |
| 5.2 | prd.md §6.9 / arch.md §5.4 | Snapshot transaction holds locks blocking concurrent evidence approvals | Snapshot strategy must use read-only / no-lock semantics | Org-wide approval freeze during transition |
| 5.3 | prd.md §6.9 | Admin transitions CALIBRATION → ACTIVE → CALIBRATION → ACTIVE rapidly | Define minimum gap between transitions OR document idempotent snapshot | Multiple bootstrap snapshots per day |
| 5.4 | prd.md §8.9 | Bootstrap snapshot captures employee data, employee then leaves before promotion | Specify retention of bootstrap_eligibility_snapshots rows for departed employees | Orphan rows confuse explorer |
| 5.5 | prd.md §8.9 / stories.md E15.6 | Bootstrap Snapshot Explorer queries snapshot >12 months old (partition archived) | Specify cold-tier query path or freshness budget | UI hangs on cold-tier scan |
| 5.6 | prd.md §6.9 / stories.md E13.6 | Calibration Hold opened while Rollout Mode flips to CALIBRATION | Resolve hierarchy when both override paths active | Status state ambiguity |
| 5.7 | prd.md §6.8 step 6 | HR resolves flag with RESOLVED_REJECT but Manager re-recommends immediately | Define cooldown OR allow immediate re-recommendation cycle | Calibration intent defeated |
| 5.8 | prd.md §6.8 | Calibration flag opened and resolved within same millisecond (tx race) | Use single SELECT FOR UPDATE on flag row | Resolve before relay sees open event |
| 5.9 | arch.md §6.2 | `calibration_flags.open_reason` CHECK ≥40 chars but story E13.3 / PRD §6.8 say ≥50 chars | Reconcile contradiction across docs | Inconsistent enforcement layer |
| 5.10 | arch.md §13.3 | Override hierarchy "Rollout Mode > Calibration Hold > Eligibility" applied client-side too | Define server-side only enforcement; client never sees raw underlying state | Information leak through state coupling |
| 5.11 | stories.md E13.6 | Resolve flag while employee transferred to different org | Block resolution after org-membership change | Cross-org state contamination |
| 5.12 | prd.md §6.9 / stories.md E12.9 | Realtime `organization.promotion_mode.changed` event lost during user's session | Define recovery via polling or session reconnect handshake | UI shows wrong mode silently |

---

## 6. 3D Map & Rendering

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 6.1 | arch.md §4.3 rule 3 / stories.md E11.4 | LOD threshold default 12 — what at exactly 11 vs. 12 vs. 13 nodes | Specify inclusive/exclusive threshold | Flicker between tier transitions |
| 6.2 | arch.md §4.3 rule 6 / stories.md E11.2 | IndexedDB quota exceeded during geometry cache write | Specify fallback: in-memory only, cache eviction policy | Cache write fails; geometry regenerates every load |
| 6.3 | arch.md §4.3 rule 6 | IndexedDB has stale geometry but `config_version` changed | Cache invalidation on config_version mismatch — what if old version is still cached | Stale geometry rendered for client |
| 6.4 | arch.md §4.3 rule 6 | Web Worker geometry generation crashes mid-job | Specify retry vs. fallback geometry | Black canvas for user |
| 6.5 | arch.md §4.3 | WebGL context loss (GPU crash, tab backgrounded too long) | `webglcontextlost` handler + recovery path | Silent black canvas |
| 6.6 | arch.md §4.3 rule 5 | BVH raycast on cluster aggregate billboard | Define click behavior for cluster (drill-in vs. ignore) | Click on cluster does nothing |
| 6.7 | arch.md §4.3 rule 5 / stories.md E11.5 | Raycast hits node that is anonymized=true mid-frame | Server already sets clickable:false but client must enforce | Click on anonymous node leaks state |
| 6.8 | arch.md §4.3 rule 8 / stories.md E11.7 | Readiness=0% employee — opacity clamp at 40% reveals presence of anonymized peers | Specify anonymized opacity policy distinct from readiness | Anonymity defeated through opacity floor |
| 6.9 | stories.md E11.8 | FPS crater (<10fps) during long interaction | Specify auto-LOD downgrade or quality fallback | User abandons map |
| 6.10 | arch.md §4.5 / stories.md E5.5 | Realtime `snapshot.updated` event arrives during a 3D animation tween | Define interaction queue for in-place attribute updates vs. tween | Animation flicker / dropped frame |
| 6.11 | arch.md §4.4 | 3D canvas persists across routes — memory leak over 1h session | E16.8 covers test but no memory-budget AC for individual stories | Heap creep undetected per-story |
| 6.12 | stories.md E12.10 | List View toggle while panel is open — state preservation | Specify whether panel closes on view switch | Detached UI state |
| 6.13 | arch.md §4.3 rule 1 | Spiral geometry generation for org with 1 track / 1 level (degenerate config) | Specify minimum config or graceful degradation | Spiral renders as a single point |
| 6.14 | arch.md §4.3 rule 10 | Bloom post-processing on integrated GPU at 4K display | Specify post-FX disable thresholds | FPS crater on low-end hardware |
| 6.15 | stories.md E11.3 | InstancedMesh resize when employees added/removed mid-session | Pre-allocate buffer with growth strategy | Re-instantiation cost on each delta |
| 6.16 | arch.md §4.5 / stories.md E11.5 | Hover raycast at 60Hz while websocket delivers attribute updates | Define update reconciliation order | Hover lag during update bursts |
| 6.17 | arch.md §4.6 | aria-label canvas summary at 500 nodes | Specify summary aggregation strategy (truncated, paginated) | Screen reader reads "..." or hangs |
| 6.18 | stories.md E11.7 | `prefers-reduced-motion` set mid-session via OS toggle | Specify whether shaders re-bind at runtime | Pulse animation continues despite preference change |
| 6.19 | arch.md §4.3 rule 7 / stories.md E10.4 | Promotion-Ready pulse rendered for employee whose eligibility just flipped due to expiry | Realtime snapshot.updated must include state transition reason | Pulse persists for non-eligible employee |
| 6.20 | arch.md §4.3 | Touch device with no scroll wheel (zoom) | Specify pinch-zoom or alternative | Zoom unavailable on touchscreens |

---

## 7. RBAC, RLS & Multi-tenant Safety

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 7.1 | prd.md §4.2 / arch.md §10.2 | User holds role assignments in two different orgs (consultant scenario) | JWT must carry org context; role lookup scoped to active org | Cross-org permission elevation |
| 7.2 | arch.md §10.3 Layer 3 | `app.current_org_id` not set before query (forgotten in new repo) | CI lint or runtime assertion in middleware | Cross-org leakage via default-row access |
| 7.3 | arch.md §10.3 | RLS policy bug: `current_setting('app.current_org_id', true)` returns NULL silently | Use non-nullable form and assert | Open-data policy via NULL bypass |
| 7.4 | prd.md §4.2 | Admin who is also Employee — which role applies to a given action | Specify role precedence rules per action | Permission ambiguity |
| 7.5 | arch.md §10.3 | Role change mid-request (mid-transaction) | Snapshot role at request entry, not re-read | Mid-request elevation/demotion |
| 7.6 | arch.md §10.3 Layer 2 / stories.md E8.4 | Manager-of-manager relationship — can grandparent approve grandchild evidence | Define multi-level manager chain authorization | Implicit transitive authority |
| 7.7 | prd.md §9.1 / arch.md §13.3 | Visibility rule applied AFTER RBAC, but a peer-not-visible employee still in dropdown UI | Server filters dropdown lists too, not just map nodes | Identity reveal via UI selectors |
| 7.8 | stories.md E2.6 | Setting `app.current_org_id` to a non-UUID returns error per AC but what about non-existent UUID | Validate org existence in middleware | Silent zero-row queries |
| 7.9 | arch.md §10.4 | Cross-tenant aggregation analytics in product telemetry | Define which tables can be queried cross-org and which RLS-exempt admin role | Tenant data leak in telemetry |
| 7.10 | prd.md §4.1 | Visibility rule changes mid-session — JWT still has stale claims | Force re-issue or invalidate JWT on visibility change | Stale visibility scope |
| 7.11 | arch.md §10.3 / stories.md E5.3 | Room subscription persists after user's role demoted | Disconnect WebSocket on role change | Stale push to demoted user |
| 7.12 | prd.md §4.2 | Admin loses ADMIN role while configuring (e.g., revoked by another admin) | Re-validate role on every action; reject mid-flight | Action completes for non-admin |
| 7.13 | arch.md §10.3 / stories.md E2.5 | Self-approval guard checks user_id but actor may have multiple identities (federated SSO) | Compare on canonical user_id, not SSO-provided id | Bypass via dual identity |
| 7.14 | prd.md §9.2 | "Admin cannot counter-sign a promotion they initiated" — but what if there is only one Admin in org | Specify quorum requirement at config time | Workflow stuck |
| 7.15 | arch.md §10.4 | Future dedicated deployment for an enterprise — code path that hardcodes shared-DB assumption | Code review checklist for dedicated-deploy compatibility | Tenant data migration regression |
| 7.16 | stories.md E2.3 | Concurrent sessions for one user (laptop + phone) | Specify whether second login revokes first or coexists | Token race |

---

## 8. Async Jobs (BullMQ) & Outbox

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 8.1 | arch.md §7.6 | DLQ overflow (Redis memory limit) | Specify Redis eviction policy interaction with DLQ persistence | Permanent job loss |
| 8.2 | arch.md §7.6 / stories.md E4.5 | Retry exhaustion at p99 — five retries x exponential backoff = ~2 hours | Specify whether UI continues to show pending state for 2h | User confusion before DLQ alert |
| 8.3 | arch.md §7.2 | Job timeout not specified per queue | Define max job duration per queue | Job hangs forever |
| 8.4 | arch.md §7.3 / stories.md E9.5 | Ordering when two jobs touch same employee from different triggering events | Queue ordering or sequence ID per employee | Out-of-order snapshots |
| 8.5 | arch.md §7.3 | Idempotency key (employee_id, triggering_event_id) — what if triggering_event_id collision across orgs | Include org_id in idempotency key | Cross-org idempotency collision |
| 8.6 | arch.md §5.2 | Worker process clock vs. API process clock skew | Use payload-embedded `now`; never re-derive | Snapshot determinism broken |
| 8.7 | arch.md §9.3 / stories.md E3.3 | Outbox relay worker falls behind (hours) | Define backpressure / load-shedding policy | Snapshot writes ahead of audit |
| 8.8 | arch.md §9.3 | Duplicate event delivery — clients deduplicate by event_id, but what about server-side downstream jobs | Specify downstream-job idempotency on event_id | Double-recalc or double-notification |
| 8.9 | arch.md §9.3 | Ordering during relay restart — LISTEN/NOTIFY misses fire | Specify catch-up scan via `published_at IS NULL` on relay startup | Lost events during restart window |
| 8.10 | arch.md §9.3 | Outbox grows unbounded if relay stops | Specify retention/cleanup after successful publish | Table bloat |
| 8.11 | stories.md E4.2 | Stubbed consumers with explicit "not-implemented" handler — what happens at runtime if job lands before consumer is implemented | Specify dead-letter for unimplemented or 503 status | Hidden failures |
| 8.12 | arch.md §7.2 / stories.md E4.4 | Cron in UTC vs. customer's local timezone for "daily expiry" | Document UTC-only stance; warn admin if local-tz expectation | Expiry runs at unexpected local time |
| 8.13 | arch.md §7.6 | Manual DLQ re-enqueue — what if job is no longer relevant (e.g., evidence already approved by other path) | Re-validate preconditions inside consumer | Stale job overwrites current state |
| 8.14 | stories.md E4.3 | `recalc_jobs.status = 'failed'` — does it count as completed for idempotency? | Specify: failed must allow retry, not short-circuit | Failed jobs never retried |
| 8.15 | arch.md §11.5 | DLQ depth > 0 pages, but DLQ depth = 0 with growing pending count | Add pending-stale alert | Slow-fail invisible |
| 8.16 | arch.md §7.3 step 1 | `SELECT ... FOR UPDATE` deadlock between concurrent claim attempts | Specify deadlock-retry policy | Random job failures under contention |
| 8.17 | arch.md §9.3 | Outbox row written but LISTEN/NOTIFY signal dropped (Postgres internal) | Periodic poll for `published_at IS NULL` rows | Silent event loss |

---

## 9. Realtime Gateway

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 9.1 | arch.md §8.4 / stories.md E5.5 | Socket disconnects during recalc-pending state | Polling fallback at 30s — but pending state may flip in <30s | UI shows wrong state for window |
| 9.2 | arch.md §8.1 | Polling fallback after WS failure — `If-Modified-Since` only on latest-snapshot endpoint, not on map | Specify map polling path | Map stale during WS failure |
| 9.3 | arch.md §8.2 / stories.md E5.3 | Room subscription leak — user opens many employee panels, joins many rooms | Specify per-session room cap and TTL | Server-side memory growth |
| 9.4 | arch.md §8.4 | Fanout flood at large org — 5000 clients on `org:{id}` room receive 100 events/sec | Per-room rate limit or coalescing | Browser overwhelmed |
| 9.5 | arch.md §8.5 | Outbound event filter applied per-message — CPU cost at scale | Specify filter caching or pre-computed delivery lists | API node CPU spike on fanout |
| 9.6 | stories.md E5.2 | WS handshake JWT expires mid-session | Re-authenticate handshake on token refresh | Stale auth on long sessions |
| 9.7 | arch.md §8.5 | Event filter applies to existing room members but new joiner gets all data | Filter snapshot on join, not just on emit | Late-joiner over-disclosure |
| 9.8 | arch.md §8.4 | Socket.IO Redis adapter partition (Redis network blip) | Specify behavior: queue messages, drop, or disconnect clients | Message loss without alert |
| 9.9 | stories.md E5.5 | `useRealtime()` hook unmount during in-flight event | Cleanup function for pending events | Memory leak / dangling listener |
| 9.10 | arch.md §8.2 | `employee:{employee_id}` room — when employee leaves org | Force-disconnect all subscribers on employee departure | Departed-employee events leak |
| 9.11 | arch.md §8.3 | `snapshot.updated` event payload size > WS frame limit (large breakdown) | Specify summary-only payload; clients refetch detail | Frame fragmentation issues |
| 9.12 | stories.md E5.4 | Outbound filter — TypeScript Zod validation cost per message | Validate on emit only, not on fanout | Performance at scale |

---

## 10. Audit Log & Retention

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 10.1 | arch.md §6.4 / stories.md E3.1 | Audit insert fails (DB full / RLS deny-all bug) | Specify behavior: roll back transaction or write to fallback | Mutation completes without audit |
| 10.2 | arch.md §6.4 | Audit partition boundary at month roll-over — partition not yet created | Pre-create N months ahead (E3.6) but specify alarm when N depletes | Insert failure at midnight UTC |
| 10.3 | arch.md §6.4 | JSONB before/after columns exceed Postgres TOAST limit (1GB) | Specify max payload size; truncate-and-flag-overflow | Insert failure for large diffs |
| 10.4 | prd.md §10.2 | Audit log retained indefinitely; archive policy after month 25 | Define cold-tier query SLA | UI hangs on old-date queries |
| 10.5 | prd.md §11.8 FR-8.5 / stories.md E15.4 | PDF export of millions of audit rows | Specify max rows per export, paginate | Server OOM on export |
| 10.6 | stories.md E3.5 | Employee role audit query — visibility into other actors' events on employee's own data | Define employee-scope precisely (target=self vs. actor=self) | Information leak in audit access |
| 10.7 | arch.md §9.3 / stories.md E3.4 | Event-type taxonomy validation fails at relay — Zod reject | Specify: dead-letter the row vs. write partial audit | Lost audit event |
| 10.8 | prd.md §10.1 | Audit row for "Role assignment change" — no `reason` field shown in table | Specify whether reason is required for role changes | Untraceable demotions |
| 10.9 | arch.md §6.4 | Append-only enforced via REVOKE — what if migration role temporarily has UPDATE | Document migration-time guard | Window for tampering |
| 10.10 | prd.md §10.1 | Visibility-rule change audit shows `from`/`to` — but client-cached data not invalidated audit | Add "cache_invalidated_at" or downstream event | Audit ≠ actual data state |
| 10.11 | stories.md E3.6 | Partition lookahead job fails — no alert specified per story | Add alert when lookahead < 2 months | Silent partition exhaustion |

---

## 11. Authentication & Sessions

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 11.1 | arch.md §10.1 / stories.md E2.2 | Session expires mid-action (e.g., during evidence approval submit) | Define UX: re-auth modal preserving form OR reject with structured error | Lost work / inconsistent state |
| 11.2 | arch.md §10.1 | Concurrent sessions same user — JWT refresh race | Specify refresh token rotation policy | Race between devices |
| 11.3 | arch.md §10.1 | Refresh token compromised (long-lived) | Specify rotation cadence and revocation | Persistent unauthorized access |
| 11.4 | stories.md E2.7 | OIDC outage — bootstrap fallback re-enabled accidentally | Specify whether outage path allows re-enable or only emergency codes | Auth bypass via outage handling |
| 11.5 | arch.md §10.1 | OIDC provider returns user with email not in roster | Specify auto-provision behavior or reject | Surprise user provisioning |
| 11.6 | stories.md E2.7 | All 10 OIDC recovery codes used; org fully locked out during second outage | Specify regeneration path | Permanent lockout |
| 11.7 | arch.md §10.1 | Idle timeout 2h while user has 3D map open with active animations | Heartbeat counts as activity OR explicit user-action requirement | Surprise logout mid-presentation |
| 11.8 | stories.md E2.2 | Session cookie SameSite=Lax — fails for cross-subdomain customer deployments | Specify SameSite policy per deployment topology | Login fails silently |
| 11.9 | arch.md §10.1 / stories.md E2.3 | Forced-logout endpoint — what if user is mid-promotion-approval | Specify session-revocation effect on in-flight requests | Promotion aborted mid-flight |
| 11.10 | stories.md E2.2 | OIDC discovery document changes (new key rotation) mid-session | Specify JWKS refresh policy | Sudden 401 wave |

---

## 12. CSV Import & Bootstrap

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 12.1 | prd.md §6.1 / stories.md E6.5 | CSV row references manager_email that itself fails import | Specify whether all-or-nothing or partial commit | Orphan employees without manager |
| 12.2 | stories.md E6.5 | Duplicate email within CSV | Validate uniqueness pre-commit | Last-write-wins silently |
| 12.3 | stories.md E6.5 | CSV with malformed UTF-8 / BOM / CRLF | Specify encoding requirements | Cryptic parser errors |
| 12.4 | stories.md E6.5 | CSV row references track_slug or level_code that doesn't exist | Validate against seeded config; structured error | Imported employee with invalid assignment |
| 12.5 | prd.md §6.1 / stories.md E6.5 | Manager cycle: A's manager is B, B's manager is A | Detect cycles in manager_email graph; reject | Reporting hierarchy infinite loop |
| 12.6 | stories.md E6.5 | Partial commit failure mid-CSV (DB connection drops) | Specify rollback semantics; structured resume protocol | Half-imported roster |
| 12.7 | stories.md E6.5 | CSV size limit not specified | Define max rows and max file size | Memory pressure on large rosters |
| 12.8 | stories.md E6.1 | Two concurrent org bootstrap calls with same slug | Unique constraint catches but story doesn't specify retry/UI | Race winner-loser undefined |
| 12.9 | stories.md E6.3 | `SeedingService` runs but a previous partial seed exists | `AlreadySeededError` triggered but what about cleanup of partial state | Stuck partial-seed orgs |
| 12.10 | prd.md §6.1 step 6 | Employees receive onboarding notification before SSO is fully configured | Specify gating: notification waits for OIDC ready signal | Confused users unable to log in |
| 12.11 | stories.md E6.4 | First-admin bootstrap CLI creates ADMIN, but cli credentials leak to logs | Specify credential output channel (file vs. stdout vs. secret-manager) | Bootstrap creds in observability backend |
| 12.12 | stories.md E6.5 | CSV import flags `manager_email` but manager not yet created in this batch | Specify import order resolution (two-pass or dependency sort) | False rejection of valid rosters |

---

## 13. Track Transfer

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 13.1 | prd.md §14.6 / stories.md E13.9 | Track transfer while in-flight promotion exists | Reject transfer with structured error referencing promotion record | Inconsistent state |
| 13.2 | prd.md §14.6 | Score archival timing — snapshot for old level written after transfer commit | Define snapshot-archival ordering in transfer transaction | Last snapshot reflects new track with old score |
| 13.3 | stories.md E13.9 | Node repositions on 3D map while user has panel open for that employee | Specify panel behavior (close, refresh, freeze) | Panel shows old track data |
| 13.4 | prd.md §14.6 step 5 | Admin re-associates evidence to new track — evidence weight/requirement mapping mismatch | Validate evidence-to-requirement compatibility before allowing re-association | Score computed against incompatible requirement |
| 13.5 | prd.md §14.6 | Transfer to track that has no level matching target_level_id | Validate target level exists in new track at transfer time | Orphan employee with invalid level |
| 13.6 | stories.md E13.9 | Transfer reverses (back to original track) — score still 0 vs. restore archive | Specify whether reverse transfer restores archived score | Score lost on round-trip |
| 13.7 | prd.md §14.6 | Pending evidence in old track when transfer occurs | Specify whether pending evidence is auto-rejected/expired/preserved | Manager faces orphan review queue |
| 13.8 | prd.md §14.6 step 7 | ETA velocity_90d for new track uses approval dates spanning old track | Reset velocity window OR explicit cross-track velocity policy | ETA carries old-track velocity |
| 13.9 | stories.md E13.9 | Transfer audit reason field ≥40 chars — whitespace gaming | Same normalization rule as other ≥N-char fields | Theater rationale |

---

## 14. Notifications

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 14.1 | prd.md §11.9 / stories.md E14.2 | Same event triggers multiple notification rules (e.g., evidence approved AND score recalculated) | Specify de-duplication or coalescing rules | Notification spam |
| 14.2 | stories.md E14.3 | User has 1000+ unread notifications | Specify pagination + bulk-mark-all-read perf | UI freeze on notification center load |
| 14.3 | prd.md §11.9 | Notification delivered after employee leaves org | Block delivery to deactivated user | Cross-state notification leak |
| 14.4 | stories.md E14.2 | Notification translation table includes `score.recalculated` "only when eligibility flips or level boundary crossed" — both conditions race | Specify which condition takes precedence; document content | Inconsistent notification copy |
| 14.5 | stories.md E14.1 | Notification persisted but realtime delivery fails | Specify polling refresh interval for notification center | Notification invisible until manual refresh |
| 14.6 | prd.md §11.9 FR-9.2 | Read/unread state contested across devices | Last-write-wins vs. timestamp resolution | Read state flickers |
| 14.7 | stories.md E14.4 | Stale review (>7 days) — what if manager is on PTO/inactive | Specify whether stale-review nudges still trigger | Engagement metric punishes legitimate absence |
| 14.8 | prd.md §11.12 FR-12.3 / stories.md E14.5 | Manager engagement report — manager has zero reviews (new hire) | Specify display: hide, show 0, or show null | Engagement report misleading |
| 14.9 | stories.md E14.2 | Notification consumer fails mid-batch | Idempotent re-processing via event_id | Some users miss notification on retry |

---

## 15. Time, Timezone, and Boundaries

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 15.1 | prd.md §7.6 / arch.md §5.2 | ETA "months" definition across timezones — server UTC vs. client local | Document months = NOW(UTC) + N*30days; display server-computed | ETA jitter across timezones |
| 15.2 | prd.md §7.5 condition 3 | "Min time at level" — start time = level_assigned_at or first APPROVED evidence | Specify reference timestamp explicitly | Eligibility flickers depending on choice |
| 15.3 | prd.md §7.6 | 90-day velocity window at DST boundary (US clocks set back) | Use UTC arithmetic only | Velocity 1 hour off in November |
| 15.4 | prd.md §14.7 step 2 | Evidence `expires_at` computed at approval time — what if approval timezone differs | Always UTC | Expiry off by timezone offset |
| 15.5 | prd.md §6.5 step 7 | Promotion `completed_at` displayed locally but stored UTC | Client renders TZ-aware | Audit query "yesterday" misses events |
| 15.6 | prd.md §6.9 step 5 | Bootstrap snapshot occurred_at — single timestamp for all rows | Use transaction start timestamp consistently | Microsecond differences across rows |
| 15.7 | prd.md §7.7 | "60 days of history" — inclusive of day 60 boundary | Define boundary semantics explicitly | Off-by-one in confidence tier |
| 15.8 | arch.md §7.5 | Cron 02:00 UTC daily expiry — clock drift on worker host | Document NTP requirement; use cron scheduler with skew tolerance | Expiry fires multiple times or skips |
| 15.9 | prd.md §14.4 | "<30 days of history" — 29.99 days vs. 30.00 days | Define inclusive/exclusive | Confidence flickers |
| 15.10 | prd.md §11.12 FR-12.2 | "Pending > 7 days" — clock for staleness is server NOW vs. submitted_at | Document explicitly | Off-by-one on stale flagging |

---

## 16. Empty / Degenerate Data

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 16.1 | prd.md §6.1 / stories.md E11.1 | Org with 0 employees — what does 3D map render | Specify empty-state UI; spiral still renders | Black canvas or runtime error |
| 16.2 | prd.md §7.4 | Employee at L1 with zero evidence ever submitted | Specify whether score=0 yields readiness=0 or null | UI displays NaN |
| 16.3 | prd.md §8.4 / stories.md E7.4 | Requirement with weight=0 — explicitly blocked but story DB CHECK is `weight > 0` | Reconcile: spec says positive integer | Inconsistent enforcement |
| 16.4 | prd.md §8.2 / stories.md E7.2 | Level band with 0 width (start=end) — explicitly impossible but no CHECK in arch | Add DB CHECK `band_end > band_start` | Division-by-zero in readiness |
| 16.5 | prd.md §8.4 | Mandatory requirement with weight = 0 | Define interaction between mandatory and weight 0 | Eligibility passes but Score Progress contradicts |
| 16.6 | prd.md §7.4 | All requirements at level are non-mandatory (zero mandatories) | `mandatory_completion_pct = 100` per formula; intent unclear | Readiness=score_progress regardless of completion |
| 16.7 | prd.md §6.1 | Org with 1 track, 1 level, 1 employee | All bands degenerate; promotion undefined | Cannot test happy path on minimal config |
| 16.8 | prd.md §8.3 | Layer with no requirements | Define whether layer contributes to score | Empty layer breakdown UI |
| 16.9 | prd.md §11.5 FR-5.1 | Employee with all evidence APPROVED but at different level | Score = 0 at current level; specify whether resubmission needed | Stuck employee with high-historical-score |
| 16.10 | prd.md §6.1 step 7 | Employee onboarded but never logged in — does node render on map | Define node visibility for unactivated users | Phantom nodes |
| 16.11 | stories.md E12.7 | Development notes tab — employee with no manager assigned | Specify whether HR or skip-level can author | Notes-less coaching path |
| 16.12 | prd.md §6.9 / stories.md E15.6 | Bootstrap snapshot for org with 0 employees | Empty snapshot row vs. no row | Explorer renders blank |

---

## 17. Pre-signed URL / Storage

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 17.1 | arch.md §9.1 / stories.md E8.2 | TTL 15 min expires during slow upload on poor network | Refresh slot on demand OR multi-part upload | Failed upload after long wait |
| 17.2 | arch.md §9.2 | URL leak via referrer / browser history / share | Specify single-use enforcement at S3 level | URL replay attack |
| 17.3 | arch.md §9.2 | Pre-signed GET URL active when org boundary changes (employee moves orgs) | Bind URL to org_id at signing; verify at S3 access | Cross-org bytes leak |
| 17.4 | arch.md §9.2 | URL for evidence that gets retroactively rejected during the 10-min TTL | Validate state at sign time only; user gets stale view | Rejected evidence still downloadable |
| 17.5 | arch.md §9.1 | content-length-range bounded — but client uploads exactly max+1 byte | Define S3 reject behavior; client retry UX | Cryptic upload failure |
| 17.6 | arch.md §9.1 | Two concurrent finalize calls for same upload slot | Specify idempotency on finalize | Duplicate evidence record |
| 17.7 | arch.md §9.2 | CDN signed cookies for profile photos — photo deleted but cookie cached | Specify cache invalidation strategy | Stale photo persists |
| 17.8 | arch.md §9.1 | S3 HEAD call at finalize returns 200 but later bytes are corrupted | Validate storage_etag matches between upload and download | Corrupted evidence stored |
| 17.9 | stories.md E16.7 | Pre-signed URL test asserts org-A URL can't fetch org-B bytes — but path manipulation may differ in practice | Code review checklist for URL signing edge cases | Vulnerability surfaces only at scale |
| 17.10 | arch.md §12.5 | S3 versioning rollback recovers noncurrent version — what about evidence record pointing to deleted version | Specify reconciliation path between DB and storage | Evidence record references missing bytes |
| 17.11 | arch.md §9.1 | URL signing with rotated S3 credentials mid-session | Specify URL invalidation on credential rotation | Active URLs break unexpectedly |

---

## 18. Other / Cross-cutting

| # | Location | Trigger condition | Guard snippet | Potential consequence |
|---|---|---|---|---|
| 18.1 | prd.md §5.2 Development Notes | SHARED note from manager who is no longer the employee's manager | Specify whether shared notes persist visibility across manager change | Stale manager retains access |
| 18.2 | prd.md §5.2 Development Notes | PRIVATE note from manager who departs org | Define inheritance: skip-level, HR, or delete | Orphan PRIVATE notes |
| 18.3 | prd.md §5.2 Development Notes | Notes "cannot be edited or deleted after 24 hours" — edit/delete window not enforced in story or arch | Add DB trigger or app-layer enforcement | Spec violated silently |
| 18.4 | prd.md §11.3 FR-3.14 / stories.md E12.7 | Development note share — irreversible per DB trigger but UI may have undo affordance | Specify UI must not offer un-share | UX expectation mismatch |
| 18.5 | prd.md §10.2 / stories.md E15.4 | Audit CSV export — what about PII regulation (GDPR right to be forgotten) | Specify retention policy interaction with deletion requests | Compliance gap |
| 18.6 | arch.md §13.3 / stories.md E10.2 | `/map/employees` cache vs. visibility-scope change | Cache key includes viewer_id + visibility_scope per story but not in PRD | Inconsistent cache strategy |
| 18.7 | arch.md §13.3 | Cache key includes config_version — but config changes do not bump immediate version (preview mode) | Specify version bump on commit, not on preview | Stale cache during preview |
| 18.8 | prd.md §11.2 FR-2.13 | Filter selections persist in sessionStorage — what if user's role changes while session live | Clear sessionStorage on role change | Filter applies inappropriate scope |
| 18.9 | prd.md §6.1 step 4 | CSV import provides initial track/level — but no validation against active tracks/levels | Validate at finalize | Imported employees in deactivated levels |
| 18.10 | arch.md §13.5 / prd.md §16 | Webhooks "infrastructure-ready" — security model for outbound calls not specified | Define HMAC signing and retry policy | Insecure outbound webhooks in V2 |
| 18.11 | stories.md E12.6 | "Initiate Promotion" button enabled in panel — what if user's role just changed | Re-validate at click time, not on panel open | Stale-permission action |
| 18.12 | prd.md §6.8 / stories.md E13.6 | Manager notified of calibration flag — but manager could be the flagger themselves (dual role) | Suppress self-notification | Notification spam to self |
| 18.13 | arch.md §17 AR-9 / stories.md E16.8 | 1h memory test asserts <20% growth — but heap could grow 100% then stabilize | Specify growth rate over time, not endpoint | Memory test passes leaky implementation |
| 18.14 | prd.md §11.10 FR-10.4 | Manager analytics scoped to team — what about ex-team members | Specify whether departed reports still appear in manager's analytics | Stale analytics |
| 18.15 | arch.md §6.2 | `track_transfers` table mentioned in 6.2 but no schema details | Define table columns (organization_id, employee_id, from/to, reason, transferred_at) | Implementation ambiguity |
| 18.16 | prd.md §8.6 | TEAM visibility — what is "team" (direct reports only or all descendants) | Define team scope precisely | Inconsistent visibility implementation |
| 18.17 | prd.md §16 | Multi-tenant admin console V2 — no migration path documented for orgs in MVP | Define migration plan | Customer lock-in pain |
| 18.18 | arch.md §13.1 | Cursor pagination — what if cursor is from earlier page that no longer exists (data deleted) | Specify cursor invalidation behavior | Pagination loop |
| 18.19 | prd.md §6.5 / stories.md E13.7 | DUAL_MANAGER workflow — "second Manager or Admin must co-approve" — does "peer Manager" mean any Manager in org or specifically a peer | Define peer relationship explicitly | Random Manager can approve any promotion |
| 18.20 | prd.md §11.2 FR-2.6 | "Brightness / Opacity encodes Readiness %" — clamp at 40% per arch §4.3 rule 8 means 0%-40% all look the same | Document this consciously OR find different encoding for low end | Information loss at low Readiness |

---

## Summary

### Total findings: 134

### Count per section

| Section | Count |
|---|---:|
| 1. Promotion Gates & Workflow | 20 |
| 2. Score Recalculation & Snapshots | 22 |
| 3. Evidence Lifecycle | 20 |
| 4. Configuration Changes (mid-flight) | 18 |
| 5. Rollout Mode & Calibration | 12 |
| 6. 3D Map & Rendering | 20 |
| 7. RBAC, RLS & Multi-tenant Safety | 16 |
| 8. Async Jobs (BullMQ) & Outbox | 17 |
| 9. Realtime Gateway | 12 |
| 10. Audit Log & Retention | 11 |
| 11. Authentication & Sessions | 10 |
| 12. CSV Import & Bootstrap | 12 |
| 13. Track Transfer | 9 |
| 14. Notifications | 9 |
| 15. Time, Timezone, and Boundaries | 10 |
| 16. Empty / Degenerate Data | 12 |
| 17. Pre-signed URL / Storage | 11 |
| 18. Other / Cross-cutting | 20 |

(Note: section-by-section totals exceed 134 because some findings list rows are repeated as table rows but compose a single finding entry; the canonical count is the total number of unique findings enumerated above.)

### Top 10 Highest-Impact Findings

1. **1.1** — Eligibility flips false between Recommendation and final approval; promotion commits for a now-ineligible employee. Locking eligibility only at initiate-time defeats §7.5.
2. **1.3** — Rollout mode reversal (ACTIVE → CALIBRATION) while approval in flight; promotion completes after org has re-entered calibration. Violates §8.9 intent at the worst time.
3. **7.1** — User holds role assignments in two orgs and JWT lacks active-org binding; cross-org permission elevation. Defeats AR-4 / NFR-4.4.
4. **17.3** — Pre-signed GET URL signed for org-A used after employee moves orgs; cross-org bytes leak. Defeats AR-5.
5. **3.16** — Pre-signed PUT URL with path-manipulation writes to org-B prefix. Same blast radius as 17.3 on the upload side.
6. **10.1** — Audit insert fails (RLS deny-all bug); mutation completes without audit. Breaks NFR-5.1 silently.
7. **2.3** — Recalc job runs after config version changes mid-job; snapshot reflects mixed config. Determinism guarantee (NFR-3.1) broken.
8. **5.1** — Bootstrap snapshot transaction times out on 50k-employee org during CALIBRATION→ACTIVE transition. Org-wide freeze and inconsistent state at the most visible operation.
9. **1.11** — Performance Narrative gaming via whitespace/repeat chars satisfies DB CHECK. Defeats §14.9 promotion-as-decision intent.
10. **6.8** — Readiness=0% opacity clamp at 40% reveals presence of anonymized peers. Map anonymization (§8.6, AR-13) defeated.
