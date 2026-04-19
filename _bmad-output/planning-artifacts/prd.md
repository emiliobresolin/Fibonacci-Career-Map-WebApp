---
title: "Product Requirements Document: Fibonacci Career Map (FCM)"
status: "draft"
version: "1.1"
created: "2026-04-18"
updated: "2026-04-18"
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
revision_note: "v1.1 targeted revision: strengthens Manager and HR personas as operational actors, elevates Manager Recommendation and Performance Narrative as mandatory promotion inputs, introduces Calibration and Organizational Rollout-Mode workflows, clarifies map-level visibility anonymization defaults, and strengthens the explanation of why Fibonacci is structural. Preserves all prior decisions including the Score Progress / Readiness % / Promotion Eligibility distinction and the deterministic asynchronous recalculation model."
inputs:
  - "docs/MVP/mvp_documentation/MVP of FCM APP.pdf"
  - "docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_45_09 AM.png"
  - "docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_46_35 AM.png"
  - "_bmad-output/brainstorming/brainstorming-session-2026-04-18-1500.md"
  - "_bmad-output/planning-artifacts/product-brief-FCM.md"
---

# Product Requirements Document: Fibonacci Career Map (FCM)

**Version:** 1.0 — MVP Scope
**Status:** Draft — Ready for Architect Workflow
**Date:** 2026-04-18

---

## 1. Executive Summary

Fibonacci Career Map (FCM) is a career progression intelligence platform for technology organizations. It replaces opaque, memory-based career management with an evidence-driven, configurable, auditable system navigated through an interactive 3D career map.

FCM's primary experience is the 3D Fibonacci spiral — the home screen, navigation layer, and exploration surface from which all workflows begin. Managers explore their teams, employees locate themselves, and HR sees organizational distribution, all through this single spatial environment. Clicking on any employee node opens a contextual detail panel without leaving the 3D canvas.

The scoring engine produces three distinct progression outputs for every employee: **Score Progress** (numeric points accumulated within the current level band), **Readiness %** (a displayed informational metric combining score progress and mandatory completion proportionally), and **Promotion Eligibility** (a strict binary gate — all mandatory requirements complete, minimum score met, minimum time at level satisfied, no active blockers). The forecasting engine calculates **ETA** paired always with an explicit **Confidence** indicator. Readiness % is for human understanding; Promotion Eligibility is the system's authoritative gate for any promotion action.

FCM ships configured with CDF-seeded defaults covering Software Engineering, Architecture, and Management tracks. Every dimension — tracks, levels, layers, requirements, weights, promotion rules, approval workflows, and visibility rules — is organization-configurable. The product is built production-ready from the first commit: OIDC/SSO authentication, immutable audit logs, deterministic and asynchronous score recalculation, structured observability, and dev/staging/prod environment separation.

This PRD defines the product-level requirements for the MVP. It is the source document that feeds architecture, epics, and story generation. All seven blockers flagged in the Product Brief are explicitly resolved in Section 14.

---

## 2. Product Context and Goals

### 2.1 Product Identity

FCM is **not** a Fibonacci novelty app. It is **not** a 3D visualization dashboard. It is a career progression intelligence platform. The Fibonacci sequence is used in exactly three structural capacities, which are non-negotiable and not configurable:

1. **Visual structure** — the 3D spiral geometry maps levels and tracks spatially. Exponential band growth corresponds to the exponential increase in scope, autonomy, and impact between career levels; spatial encoding therefore communicates seniority at a glance without any labels.
2. **Progression weighting** — Fibonacci-scale default weights (1, 2, 3, 5, 8, 13, 21...) reflect the empirical observation that rare, high-impact contributions are worth disproportionately more than routine activity. This is a defensible default scale; the weights themselves remain organization-configurable.
3. **Forecasting rhythm** — a 90-day velocity window balances signal freshness with statistical stability. Senior-level evidence events are infrequent but heavy; shorter windows produce noise, longer windows mask stalls. The 90-day window is the rhythm at which the forecast is honest.

**Fibonacci structures the system. Organizations govern the system. Managers decide the outcomes.** The sequence does not, and is never permitted to, replace organizational judgment or the configured promotion policy. Business rules, career models, requirements, weights, approval flows, and visibility are all **organization-defined and admin-configurable**.

### 2.2 Product Goals

| # | Goal |
|---|---|
| G1 | Provide employees a precise, evidence-based view of current career standing, remaining requirements, and realistic promotion timeline |
| G2 | Give managers a team-level progression view that supports structured development conversations and enables defensible, evidence-backed promotion **recommendations** — not automated promotion decisions |
| G3 | Give HR / People an operational governance surface: calibration, rollout oversight, contested-decision reconstruction, and configurable policy — not purely administrative configuration |
| G4 | Make the career structure of the entire organization navigable and legible through a single interactive 3D surface |
| G5 | Enforce the distinction between Score Progress, Readiness %, and Promotion Eligibility in every progression view, and further preserve the distinction between Promotion **Eligibility** (a system-computed precondition) and Promotion **Decision** (a human act of manager recommendation + approval workflow) |
| G6 | Ensure every score, configuration, approval, recommendation, calibration, and promotion event is immutably logged and explainable |
| G7 | Ship production-ready from MVP: real authentication, real environments, real observability, real audit trails |
| G8 | Protect organizational trust at first activation: the system reveals organizational reality (who qualifies, who is stalled) but does not force mass-promotion when a career framework is formalized for the first time |

### 2.3 Non-Goals (MVP)

- FCM is not a replacement HRIS or compensation system
- FCM is not a learning management system (but integrates with one later)
- FCM is not a performance management tool (goal-setting, OKRs are out of scope)
- FCM is not a mobile application in MVP
- FCM does not auto-generate career recommendations in MVP

---

## 3. Target Users and Personas

### 3.1 Employee — Individual Contributor

**Profile:** Software engineers, architects, data engineers, QA engineers, security engineers. Mid-size to enterprise technology organizations. Typically 2–15 years of professional experience.

**Primary needs:**
- Know current validated score and level band position
- See layer-by-layer breakdown (Capability, Delivery, Influence)
- Understand which requirements are complete, in progress, or missing (with mandatory/optional distinction)
- See Readiness percentage and understand why it differs from Score
- See ETA and Confidence level for the next promotion
- Submit evidence against open requirements
- Have a defensible record of progression history

**Success signal:** Employee enters review conversations with a shared, objective view. No surprises.

### 3.2 Manager — Engineering Manager / Team Lead

**Profile:** Engineering managers, team leads, technical directors. Responsible for 3–15 direct reports.

**Primary needs:**
- See team distribution across the 3D career map
- Identify promotion-ready, blocked, and at-risk team members
- Review and validate evidence with documented reasons
- **Capture private development notes** on each report (coaching topics, observations, 1:1 agenda items) that travel with the employee's context but do not enter the scoring engine
- **Optionally share specific notes** with the employee as structured development actions, turning private coaching into a visible joint development plan
- Prepare for 1:1s using progression data + the running development-notes thread
- **Submit promotion recommendations with a written performance narrative** — an explicit judgment that the employee is performing at the target level, not merely that they have accumulated the required evidence
- Detect stalled or low-confidence-ETA reports early (retention risk)

**Success signal:** Manager prepares for any 1:1 in under 2 minutes using the 3D map, the detail panel, and the development-notes thread. When initiating a promotion, the recommendation narrative sits alongside the evidence in the audit record — making the decision defensible without the manager having to reconstruct context from memory.

### 3.3 Admin / HR — People & Governance

**Profile:** HR business partners, people operations, organization administrators. **Operationally active** — not purely administrative. This persona is the governance layer that keeps the system fair at organizational scale.

**Primary needs:**
- Configure career tracks, levels, layers, requirements, weights, and promotion rules
- Define and modify approval workflows (including per-level policy) and visibility rules
- **Operate the calibration layer:** review the organization-wide pipeline of eligible and near-eligible employees, flag individual promotions for calibration before final approval, and run structured calibration sessions backed by the system's data
- **Own the rollout posture:** decide when the organization transitions from Calibration mode (eligibility informational, no promotions fire) to Active mode (promotions operate normally). This decision is explicit, audited, and reversible
- **Oversee contested decisions:** reconstruct any promotion or evidence approval from the immutable audit log, including the manager's recommendation narrative and any calibration flags
- Monitor manager approval patterns for fairness and consistency signals (review latency, approval/rejection ratios, narrative completeness)
- View organization-wide career health, distribution, bench strength, and manager engagement metrics
- Maintain the system with low ongoing overhead

**Success signal:** HR activates FCM without triggering a mass-promotion event on day one. HR runs defensible calibration sessions using system data. HR can reconstruct any challenged decision end-to-end within minutes. The system is HR's governance instrument, not merely a reporting tool.

---

## 4. User Roles and Permissions

### 4.1 Role Matrix

| Capability | Employee | Manager | Admin / HR |
|---|:-:|:-:|:-:|
| View own 3D position and detail panel | ✅ | ✅ | ✅ |
| View peer summary information (per visibility rules) | Config | ✅ (team only) | ✅ (all) |
| Submit own evidence | ✅ | ✅ | ✅ |
| View direct reports on 3D map | ❌ | ✅ | ✅ |
| View organization-wide 3D map | See §14.5 | See §14.5 | ✅ |
| Approve / reject evidence for direct reports | ❌ | ✅ | ✅ |
| Approve / reject evidence for anyone | ❌ | ❌ | ✅ |
| Initiate promotion request | ❌ | ✅ (for reports) | ✅ |
| Counter-sign promotions (if workflow configured) | ❌ | ❌ | ✅ |
| Configure career tracks, levels, layers | ❌ | ❌ | ✅ |
| Configure requirements, weights, promotion rules | ❌ | ❌ | ✅ |
| Configure visibility and approval workflow rules | ❌ | ❌ | ✅ |
| View audit logs | Own only | Team only | All |
| Export data | ❌ | Team only | All |

### 4.2 Role Assignment

Roles are assigned per Organization. A user can hold exactly one of {Employee, Manager, Admin} within an Organization. A Manager is always also an Employee (has their own progression). Admin / HR is a distinct role and does not participate as an Employee in the progression model within their own Admin capacity (though an Admin may also hold an Employee profile if they are simultaneously an IC, in which case they receive a separate Employee role assignment).

---

## 5. 3D-First Interaction Model

This section defines the core product experience. The 3D Fibonacci spiral is the **primary home screen, navigation layer, and exploration layer** of FCM. Every principal workflow begins here.

### 5.1 The 3D Canvas

**Structure:**
- The spiral is rendered in interactive 3D, dark mode by default, matching the reference image aesthetic
- Each **career track** occupies a distinct segment of the spiral
- Each **level** occupies a band within its track segment
- Each **employee** is represented as a node positioned at their current track/level with the node's precise spatial position reflecting their progression within the band
- Nodes are color-coded by level (L1 blue, L2 teal, L3 purple, L4 tan, L5 silver — confirmed from reference artifacts)
- **Readiness is also visually encoded** (see §14.3 PRD Decision)

**Interaction capabilities (required in MVP):**
- Rotate the entire structure by drag (mouse or touch)
- Zoom in and out (scroll wheel or zoom controls)
- Click on any visible node to open the Employee Detail Panel
- Hover on a node to reveal a lightweight tooltip (name, level, track)
- Toggle filter visibility of nodes by track and level via left-side Filters panel
- Reset camera view to default orientation

**Filters panel (confirmed from reference image 2):**
- Career Track checkboxes with live employee counts per track
- Level checkboxes (L1–L5) for cross-track filtering
- Filters apply immediately; hidden nodes fade out but remain in the scene graph

### 5.2 The Employee Detail Panel

When a user clicks on a node in the 3D map, the **Employee Detail Panel** slides in from the right side of the screen. The 3D canvas remains visible and rotatable in the background. The user does not leave the 3D context.

**Panel content (confirmed from reference image 2):**
- Employee photo, name, track, and current level (e.g., "Angel S. — L3 Senior")
- Layer-by-layer score breakdown with progress bars: Capability, Delivery, Influence, each with percentage
- **Next Requirements** list (next 3–5 open requirements most relevant to promotion)
- **Score Progress** within current level band, shown as both numeric points and % of band
- **Readiness %** prominently displayed as a distinct informational progress metric
- **Promotion Eligibility** shown as a discrete state label (`ELIGIBLE` / `NOT ELIGIBLE — reasons…`), visually separate from Readiness %
- **Forecast window selector** (e.g., 3 months / 6 months / 12 months)
- **ETA Estimate** (e.g., "8 months") always paired with a **Confidence indicator** (High / Medium / Low) displayed visually

**Panel actions (role-dependent):**
- Employee viewing own panel: "Submit Evidence" action against an open requirement
- Manager viewing report's panel: "Approve / Reject" action on pending evidence; **"Development Notes"** tab for private coaching notes and share-with-employee actions; "Initiate Promotion" action enabled only when Promotion Eligibility is `ELIGIBLE` **AND** the organization is in Active rollout mode (see §6.9)
- Admin / HR viewing any panel: all actions available plus "View Full Profile" link, ability to **flag a pending promotion for calibration review**, and ability to see calibration flags already placed on the employee
- Employee viewing own panel: sees only shared development actions (not private manager notes); sees Eligibility and Readiness % with an explicit note that eligibility is a precondition, not an approval

**Development Notes behavior:**
- Notes authored by a Manager or Admin are **private by default** — visible only to the author, the target employee's management chain, and HR
- The author can mark any note as **shared with employee**, converting it into a structured development action visible on the employee's own panel
- Notes are not an input to the scoring engine; they are conversation scaffolding and context
- All notes (private and shared) are captured in the audit log with actor and timestamp; notes cannot be edited or deleted after 24 hours (append-only addenda allowed)

**Closing the panel** returns the user to the full 3D canvas with the node deselected.

### 5.3 Hierarchy of Navigation

The 3D map is the home. Users can leave the 3D canvas only through intentional top-navigation actions:

| Top Nav | Purpose | When to Use |
|---|---|---|
| **Career Map** | 3D primary canvas | Default landing; all exploration |
| **Dashboard** | Summary KPIs and team-level metrics (2D) | Manager daily summary |
| **Analytics** | Detailed charts, distribution, bottleneck reports (2D) | Deep analytical investigation |
| **Settings** | Admin configuration of tracks, rules, workflows (2D) | Organization configuration |

All non-Career-Map views are secondary modes. The Career Map is always a single click away from anywhere in the application. Users always return to the 3D map as the home state.

### 5.4 Employee Full Profile View

The Employee Detail Panel surfaces the most actionable progression information in a compact sliding panel. For deeper investigation (complete evidence history, approval history, audit trail, full score change timeline), a **Full Employee Profile** page exists and is accessible via:

- A "View Full Profile" link within the Detail Panel (Manager and Admin only)
- Direct URL navigation (shareable)

The Full Profile is a dedicated 2D page, intentionally outside the 3D context, designed for forensic investigation and audit activity. This is the only scenario in which a user leaves the 3D canvas while investigating an employee.

### 5.5 3D Performance Requirements

- The 3D canvas must remain interactive and responsive at 60fps on standard desktop hardware for organizations with up to 500 employee nodes in MVP
- Level-of-Detail (LOD) rendering, cluster aggregation at zoom-out, and visible-segment culling are expected engineering approaches
- Clustering behavior: at far zoom, nodes aggregate into cluster markers showing count; drilling in decomposes clusters into individual nodes
- See §15 Non-Functional Requirements for full performance specification

---

## 6. Core Workflows

### 6.1 Workflow: Organization Onboarding

**Trigger:** New organization activates FCM.

1. Admin completes OIDC/SSO configuration (org identity provider connected)
2. System seeds the organization with CDF defaults: Software Engineering L1–L5, Architecture L4–L5, Management L3–L5, Capability/Delivery/Influence layer model, default requirements per layer, default Fibonacci weights
3. Admin reviews seeded configuration in Settings; customizes as needed (track names, additional tracks, level names, requirement details, weights, promotion rules, approval workflow, visibility rules)
4. Admin imports employee roster (CSV import or manual entry in MVP)
5. Admin assigns each employee to a track and current level
6. Employees receive onboarding notification; log in via SSO
7. Employees appear as nodes in the 3D Career Map

**Completion criteria:** Organization has at least one active career track, at least one assigned employee, and configured authentication. 3D map renders the org state.

### 6.2 Workflow: Employee Evidence Submission

**Trigger:** Employee has an open requirement to fulfill.

1. Employee navigates to their own detail panel (via 3D map click or Dashboard)
2. Employee sees Next Requirements list with open items
3. Employee clicks "Submit Evidence" against a specific requirement
4. System presents an evidence submission form:
   - Evidence type (matched to requirement's configured evidence type: file, URL, text)
   - Required: title, description
   - Optional: supporting notes
   - File upload (stored in S3-compatible object storage)
5. Employee submits; evidence is saved in pending status
6. System notifies the employee's manager (in-app notification; email in V2)
7. Evidence state: `PENDING_APPROVAL`; visible in employee's own panel as "pending review"

### 6.3 Workflow: Manager Evidence Review

**Trigger:** Manager has pending evidence to review.

1. Manager opens Career Map (or receives in-app notification)
2. Manager clicks on the employee's node; Detail Panel slides in
3. Manager sees pending evidence highlighted in the panel
4. Manager clicks evidence item; full evidence view appears within the panel
5. Manager selects **Approve** or **Reject**:
   - **Approve:** mandatory reason field (min 10 chars); optional notes; confirmation required
   - **Reject:** mandatory reason field (min 20 chars); optional suggestion for revision
6. Decision is recorded as an ApprovalRecord (actor, timestamp, decision, reason)
7. On **Approve:**
   - Evidence state → `APPROVED`
   - System enqueues an asynchronous score recalculation job for the employee
   - Upon recalculation completion: Score, Readiness, ETA, Confidence updated
   - Employee receives in-app notification of approval and score change
8. On **Reject:**
   - Evidence state → `REJECTED`
   - Employee receives in-app notification with rejection reason
   - Employee may resubmit revised evidence

**Audit logging:** Every decision is logged immutably with actor, timestamp, reason, evidence reference, and before/after score state.

### 6.4 Workflow: Manager Team Exploration via 3D Map

**Trigger:** Manager wants to review team progression state.

1. Manager logs in; lands on Career Map (3D home)
2. Manager applies filter: their team's tracks and levels (default filter can be "My Team" scope for managers — see §14.5)
3. Manager visually scans the spiral, identifying:
   - Clusters of nodes (where most team members are)
   - Outliers (isolated nodes at unusual levels)
   - Visual readiness encoding signals (promotion-ready vs. stalled)
4. Manager clicks on specific team member nodes to open detail panels
5. Manager reviews score, readiness, ETA, confidence, pending evidence, and blockers for each
6. Manager takes action inline (approve evidence, initiate promotion, or simply review for 1:1 prep)

**Design principle:** The manager never navigates to a dedicated "Team List" page for this workflow. The 3D map IS the team list, enhanced with spatial context.

### 6.5 Workflow: Promotion Initiation, Recommendation, and Approval

**Design intent:** Promotion Eligibility (§7.5) **opens** the promotion conversation. A Manager Recommendation **initiates** it. The configured approval workflow **commits** it. The system never auto-promotes, and "initiating a promotion" is never a mechanical consequence of checklist completion — it is an act of managerial judgment the system captures, challenges, and audits.

**Trigger:** An employee's Promotion Eligibility flips to `ELIGIBLE`. The system makes this visible; it does not act on it.

1. System re-evaluates Promotion Eligibility on every score recalculation (§7.8).
2. When Promotion Eligibility is `ELIGIBLE` **and** the organization is in Active rollout mode (§6.9), the Detail Panel displays a "Promotion-Ready — Recommendation Required" signal to authorized viewers (Manager, Admin/HR). This signal is never driven by Readiness % alone.
3. **Manager Recommendation (mandatory step).** The Manager clicks "Recommend for Promotion." The system presents:
   - A promotion summary: proposed new level, final score, completed requirements, contributing evidence log
   - A **mandatory Performance Narrative** field (minimum 200 characters) in which the Manager answers: *"Why is this employee already performing at the target level, beyond the evidence on file?"* The narrative must speak to actual performance, not simply restate accumulated evidence
   - An optional list of **supporting development notes** (drawn from the employee's notes thread) the Manager wishes to attach as context
   - A confirmation: *"I recommend this employee for promotion. I understand that Eligibility is a precondition and that this recommendation is my judgment as their manager."*
4. The Manager submits the recommendation. A PromotionRecord is created in `RECOMMENDED` state. Backend **re-verifies Promotion Eligibility and rollout mode** before accepting.
5. **Approval workflow execution** per the organization's configured policy for the level:
   - **Single sign-off:** Manager's recommendation completes the promotion when self-approval is not prohibited (Manager is the recommender, not a co-approver). In SINGLE mode the recommendation IS the approval.
   - **Dual sign-off:** A second Manager or Admin must co-approve. The co-approver sees the recommendation narrative and the evidence; they record their own reason on approve/reject.
   - **HR gate:** Admin/HR must review and approve. HR may also flag the record for calibration review (§6.8) before final decision.
6. **Calibration hold (optional at any approval step).** An Admin/HR may flag a pending promotion for calibration — see §6.8. While flagged, no further approval action is permitted until HR explicitly resolves the flag.
7. On final approval:
   - Employee level is updated
   - Score archived for the previous level; resets to 0 for the new level (see §14.6 for track-change behavior)
   - Node repositions on the 3D map
   - Promotion event is logged immutably, **including** the Manager's recommendation narrative, any calibration flag history, and each approver's reason
   - Employee receives an in-app notification
8. On rejection at any approval step:
   - Rejection reason recorded (mandatory)
   - Employee remains at current level; the Performance Narrative and rejection reason are preserved for the next promotion cycle's context
   - Employee receives an in-app notification with the rejection reason (system-level narrative; private calibration notes are not disclosed to the employee)

**Invariant:** Every committed promotion carries a Manager-authored Performance Narrative in the audit record. A promotion with Eligibility `ELIGIBLE` and no recommendation cannot be committed by any code path.

### 6.6 Workflow: Admin Career Track Configuration

**Trigger:** Admin needs to create or modify a career track.

1. Admin navigates to Settings → Career Tracks
2. Admin selects an existing track to edit or creates a new track
3. Admin configures:
   - Track name and description
   - Active levels and score bands
   - Layers (names, count)
   - Requirements per layer (type, weight, mandatory flag, evidence type, expiry period)
   - Promotion rules per level
4. Admin reviews preview of impact (e.g., "This will affect 47 employees")
5. Admin saves configuration
6. System:
   - Records a `ConfigurationChange` audit event with actor, timestamp, field changes, before/after values
   - Enqueues asynchronous recalculation jobs for all affected employees
   - Displays a recalculation-pending status indicator in UI
7. Recalculation completes in background; all affected scores, readiness, and ETAs are updated
8. Any employee whose score changed receives an in-app notification explaining the recalculation cause

### 6.7 Workflow: Audit Investigation

**Trigger:** Admin/HR needs to investigate a contested decision or compliance query.

1. Admin navigates to the Audit Log section (accessible from Settings or Employee Full Profile)
2. Admin filters by: actor, event type, employee, date range, or specific resource
3. Admin retrieves the relevant audit events; each event shows: timestamp, actor, action type, target resource, reason, before/after values
4. Admin exports the audit trail if needed (CSV or PDF export in MVP)

**Immutability:** Audit events cannot be edited or deleted by anyone, including Admin. The audit log is append-only.

### 6.8 Workflow: Calibration and Promotion Oversight

**Trigger:** Admin/HR needs to review the organization-wide promotion pipeline or wants to hold a specific promotion for calibration before final approval.

**Design intent:** Calibration is the organizational-fairness layer on top of manager-level judgment. It exists to prevent two failure modes: (a) individual managers grading on inconsistent curves across the organization, and (b) promotions that look defensible on paper (evidence + narrative) but do not stand up to cross-team comparison.

**Calibration Queue (HR view):**
1. Admin navigates to the **Calibration Queue** (new surface in Analytics for HR/Admin only)
2. The queue shows:
   - **Eligible — no recommendation yet:** employees the system has flagged Promotion-Eligible but for whom no manager recommendation has been submitted yet
   - **Recommended — awaiting approval:** promotions with a recommendation and in the approval workflow
   - **Flagged for calibration:** promotions currently on a calibration hold
   - **Recently promoted:** last 30 days, for retrospective calibration review
3. Each row exposes: employee, track, level transition, score, readiness %, recommending manager, recommendation narrative excerpt, days in state
4. HR can filter by track, team, manager, and level transition

**Calibration Flag action:**
1. From the Calibration Queue or a specific Employee Detail Panel, an Admin/HR can **flag a pending promotion for calibration review** with a mandatory reason (min 50 characters)
2. The flag places the PromotionRecord into a **`CALIBRATION_HOLD`** substate within whatever approval-workflow state it occupied
3. While flagged, no approval action can proceed — the UI and API enforce the hold
4. The manager who submitted the recommendation is notified
5. HR can add follow-up calibration notes (private to HR, recorded in audit)
6. HR explicitly resolves the flag with either **Release** (workflow resumes) or **Reject** (promotion denied, reason recorded, employee notified)
7. All flag, note, resolution, and release events are logged immutably

**Calibration session support (informational, no separate surface in MVP):**
- The Calibration Queue itself is the session backbone: HR opens the queue, reviews records with stakeholders, flags or approves as the conversation proceeds
- Dedicated calibration-session management (scheduling, participants, minutes capture) is explicitly **V2**

### 6.9 Workflow: Organizational Rollout Mode

**Trigger:** A new organization is being activated, or an existing organization wants to re-enter a controlled rollout period (e.g., after a significant configuration change).

**Design intent:** When an organization formalizes a career framework for the first time and imports historical evidence, many employees may appear Promotion-Eligible on day one. If the system immediately signals "Promotion-Ready" across the organization and enables promotion actions, the organization can be pushed into an irresponsible mass-promotion scenario that the real constraints (budget, headcount, leveling consistency) cannot absorb. The product must make this safe by default.

**Rollout modes:**

| Mode | System Behavior | Who Controls Transition |
|---|---|---|
| **CALIBRATION** (default on new-org activation) | Eligibility is computed and displayed to HR/Admin. Promotion-Ready signals are **suppressed** for Managers and Employees on the 3D map and Detail Panel. The Calibration Queue is fully populated. Recommendation and approval actions are **disabled** system-wide. All other progression signals (Score Progress, Readiness %, ETA + Confidence) operate normally. | HR / Admin |
| **ACTIVE** | Full promotion workflow operates as specified in §6.5. | HR / Admin |

**Transition from CALIBRATION to ACTIVE:**
1. Admin navigates to Settings → Organization → Rollout Mode
2. System presents the current calibration-queue summary: counts, outstanding flags, average time-at-level for currently-eligible employees
3. Admin confirms the transition with a mandatory rationale (min 100 characters, logged immutably)
4. System emits a `RolloutModeChanged` event; all currently-eligible employees immediately see the Promotion-Ready signal (subject to visibility rules); Managers can now submit recommendations
5. Audit records the transition actor, timestamp, rationale, and the full list of employees who were Eligible at the moment of transition (the "bootstrap eligibility snapshot")

**Reversal (ACTIVE → CALIBRATION):**
- Permitted but discouraged. Same mandatory-rationale + audit pattern. Any promotions already in flight are preserved in their current approval-workflow state but no new recommendations can be submitted until the organization returns to ACTIVE.

**Who the Calibration Queue and rollout-mode controls are visible to:** Admin/HR only.

---

## 7. Scoring, Readiness, ETA, and Confidence

### 7.1 Core Business Rule: Score, Readiness, and Promotion Eligibility Are Three Distinct Concepts

This is the most important business rule in FCM and is surfaced visibly in every employee-facing view. To prevent implementation ambiguity, the PRD defines **three distinct outputs**, not two:

| Concept | Type | Purpose | Formula Source |
|---|---|---|---|
| **Score Progress** | Numeric (points) | How close the employee's accumulated Score is to the next-level band target | §7.2, §7.4 |
| **Readiness %** | Displayed percentage (0–100%) | An informational, composite metric shown in the UI that reflects both score progress AND the proportion of mandatory requirements completed | §7.4 (proportional formula) |
| **Promotion Eligibility** | Binary (Eligible / Not Eligible) | The actual gate that controls whether a promotion request can be initiated | §7.5 (binary gate) |

**Design intent:**
- **Score Progress** answers: "How many points has the employee earned?"
- **Readiness %** answers: "At a glance, how close is the employee to being ready?" — a useful UI signal that reflects both dimensions proportionally so an employee sees gradient progress even when one mandatory is outstanding.
- **Promotion Eligibility** answers: "Can this person actually be promoted right now?" — a strict all-or-nothing check. ALL mandatory requirements must be complete, regardless of how high Readiness % is.

**Worked example — an employee with Score at 90% of band and 4 out of 5 mandatory requirements complete:**
- Score Progress: 90% within band
- Readiness %: 72% (= 90% × 80%) — displayed as the UI metric
- Promotion Eligibility: **NOT ELIGIBLE** — one mandatory is still unmet; the binary gate blocks promotion

**Worked example — an employee with Score at 100% of band and all mandatories complete:**
- Score Progress: 100%
- Readiness %: 100%
- Promotion Eligibility: **ELIGIBLE** — may proceed to promotion initiation

**The rule the product must enforce:** Readiness % is an informational display; Promotion Eligibility is the enforcement gate. Code paths that initiate or approve promotions MUST check Promotion Eligibility (not Readiness %). The UI MAY display Readiness % as a progress indicator but MUST NOT use it as a pre-condition for promotion actions.

**Eligibility is necessary, not sufficient.** Promotion Eligibility means the employee has cleared the configured objective conditions (score, mandatories, time at level, blockers). It does **not** mean the employee must be promoted, nor that the system has decided the employee should be promoted. Eligibility opens the **promotion conversation**; a promotion only commits when the Manager Recommendation, Performance Narrative, and configured approval workflow (§6.5) have completed successfully. The system never advances a level automatically on the basis of eligibility alone.

### 7.2 Score Calculation

**Formula:**
```
employee_score = SUM(evidence.weight for evidence in employee.evidence
                     where evidence.state == APPROVED
                     and evidence.level == employee.current_level)
```

**Rules:**
- Only `APPROVED` evidence contributes to score
- Only evidence tied to the employee's current level contributes (score resets on level change — see §14.6)
- Evidence weights are Fibonacci-scale by default (1, 2, 3, 5, 8, 13, 21) but are organization-configurable to any positive integer
- Retroactive approval (approval date later than evidence submission date) is permitted but flagged in audit log

**Example default weights (from MVP PDF):**
- Completed course: 3 points
- Internal certification: 5 points
- Led medium project: 8 points
- Drove architectural decision: 13 points

### 7.3 Level Bands (CDF-Seeded Defaults)

| Track | Level | Default Score Band |
|---|---|---|
| Software Engineering | L1 | 0–50 |
| Software Engineering | L2 | 50–100 |
| Software Engineering | L3 | 100–150 |
| Software Engineering | L4 | 150–200 |
| Software Engineering | L5 | 200–250 |
| Architecture | L4 | 150–200 |
| Architecture | L5 | 200–250 |
| Management | L3 | 100–150 |
| Management | L4 | 150–200 |
| Management | L5 | 200–250 |

Band boundaries are configurable per organization.

### 7.4 Readiness % Calculation (Displayed Informational Metric)

**Formula:**
```
score_progress_pct = MIN(100, (employee_score - level_band_start) / (level_band_end - level_band_start) * 100)

mandatory_completion_pct = (completed_mandatory_count / total_mandatory_count) * 100
# If total_mandatory_count == 0, mandatory_completion_pct = 100

readiness_pct = score_progress_pct * (mandatory_completion_pct / 100)
```

**Rules:**
- Readiness % is a **displayed informational metric** derived proportionally from score progress and mandatory completion ratio
- Readiness % is NOT a promotion gate — it is a UI signal that gives employees and managers a graduated sense of overall progress
- Readiness % reaches 100% only when score progress is 100% AND all mandatory requirements are complete (i.e., only when the employee is also Promotion-Eligible)
- Readiness % is capped at 100%
- Readiness % = 0% only when Score Progress = 0% (no points at current level) OR no mandatory requirements have been completed and there is at least one

**Note:** A Readiness % of 99% does NOT mean "ready to promote." Promotion Eligibility (§7.5) is the authoritative check.

### 7.5 Promotion Eligibility (Binary Gate)

**Promotion Eligibility is a strict, binary check that determines whether a promotion can be initiated or approved.** It is independent of Readiness % and is the sole authoritative signal the system uses to allow or block promotion actions.

**An employee is Promotion-Eligible when ALL of the following conditions are true:**
1. Score meets or exceeds the configured minimum score threshold for the current level (default: level band end value; configurable per §8.5)
2. ALL mandatory requirements at the current level are in the `APPROVED` state (no mandatory may be missing, expired, or rejected)
3. The configured minimum time at the current level has been satisfied (if configured; nullable per §8.5)
4. No active blocker conditions are flagged against the employee (per §8.5)

**If any single condition fails, Promotion Eligibility is `NOT ELIGIBLE` — regardless of how high Readiness % is.**

**Promotion Eligibility is:**
- Computed at every score recalculation (§7.8)
- Recorded in the ScoreSnapshot alongside Score and Readiness %
- The field the system checks before enabling the "Initiate Promotion" UI action (§11.7)
- The field the system checks before accepting a promotion request at the API boundary

**Distinction from Readiness %:**
- Readiness % is for **human understanding** (shown in UI as a progress indicator)
- Promotion Eligibility is for **system enforcement** (gates all promotion workflow actions)

**Eligibility opens the promotion conversation. Manager Recommendation + approval workflow commits it.** Promotion Eligibility unlocks the manager's ability to initiate a promotion (§6.5, §11.7) — nothing more. It does not create a promotion record, notify HR, or modify the employee's level. The employee's level changes only after: (1) the Manager authors a Performance Narrative and submits a Recommendation, (2) any configured HR countersign or dual-approval step completes, and (3) the Promotion is not placed on Calibration Hold (§6.8). Eligibility that sits un-acted-on for extended periods is a legitimate organizational state — it may reflect calibration timing, headcount posture, or managerial judgment — and is surfaced to HR through the Analytics dashboard (§11.10) rather than auto-escalated.

### 7.6 ETA Calculation

**Formula:**
```
remaining_points = MAX(0, level_band_end - employee_score)
velocity_90d = SUM(evidence.weight for evidence in employee.evidence
                   where evidence.state == APPROVED
                   and evidence.approval_date >= NOW - 90 days) / 3  # average points per 30-day month

if velocity_90d == 0:
    eta_months = None  # undefined; display "insufficient data"
else:
    eta_months = remaining_points / velocity_90d
```

**Display rules:**
- ETA is expressed in months, rounded to nearest whole month
- ETA is always paired with a Confidence indicator (§7.7)
- If ETA is undefined (velocity = 0), display "Insufficient data" with Low confidence; never display "infinite" or "unknown"
- Edge cases for new employees are specified in §14.4

### 7.7 Confidence Calculation

Confidence is categorical: **High**, **Medium**, **Low**.

**Rules:**

| Condition | Confidence |
|---|---|
| Employee has ≥60 days of history AND velocity has been consistent (coefficient of variation ≤ 0.3 over last 90 days) AND ≤1 mandatory requirement remaining | **High** |
| Employee has ≥30 days of history AND velocity is present (>0) AND some mandatory gaps remain | **Medium** |
| Employee has <30 days of history OR velocity_90d == 0 OR many mandatory gaps remain OR velocity is declining sharply (>40% drop quarter-over-quarter) | **Low** |

**Display:** Confidence is displayed as a visual indicator (e.g., colored badge) alongside the ETA. Low confidence ETA should be visually distinguishable as a caution signal.

### 7.8 Recalculation Behavior

- **Triggers:** evidence approval, evidence rejection (if previously approved), evidence expiry, configuration change affecting requirements/weights/bands/layers, manual admin-triggered recalculation
- **Execution:** asynchronous, via background job queue
- **Determinism:** given the same evidence set, configuration, and timestamps, recalculation always produces the same Score, Readiness %, Promotion Eligibility, ETA, and Confidence values
- **Idempotency:** running recalculation twice on the same employee with unchanged inputs produces identical output; no duplicate score changes
- **UI behavior:** the UI displays "Recalculation pending" state when a job is in-flight; values refresh automatically upon completion
- **Failure handling:** failed recalculation jobs are retried with exponential backoff; persistent failures alert the operations team via observability channels

### 7.9 ScoreSnapshot

At every recalculation, a `ScoreSnapshot` record is created:
- employee_id, level_id, timestamp
- score, readiness_pct, promotion_eligible (boolean), eta_months, confidence_level
- triggering_event_id (evidence approval, config change, etc.)

Snapshots enable historical tracing and audit reconstruction. They are immutable.

---

## 8. Configurable Admin Model

Every dimension below is organization-scoped and admin-configurable. The CDF seed provides working defaults on first activation. Configuration changes trigger async recalculation (§6.6).

### 8.1 Career Tracks

- **Attributes:** name, description, display order, active status
- **Rules:** at least one track must exist per organization; tracks are org-scoped and do not cross organizations

### 8.2 Levels

- **Attributes:** name, level code (L1, L2, etc. or custom), score band (start/end), display order, active status, track association
- **Rules:** levels are track-scoped; score bands must not overlap within a track; band boundaries must be non-negative integers

### 8.3 Layers

- **Attributes:** name (default: Capability, Delivery, Influence), display order, level association
- **Rules:** each level has at least one layer; layers are level-scoped (can differ per level within a track); layer names are fully configurable

### 8.4 Requirements

- **Attributes:** name, description, evidence type required (file / URL / text / structured), weight (positive integer; Fibonacci default), mandatory flag, expiry period (nullable; in months), layer association, active status
- **Evidence types:**
  - `FILE` — employee uploads document (stored in S3-compatible object storage)
  - `URL` — employee provides a verifiable URL (e.g., certification page, published article)
  - `TEXT` — employee provides structured text description
  - `STRUCTURED` — employee fills a predefined form (e.g., project name, dates, role)

### 8.5 Promotion Rules

Per level:
- **Minimum score:** required score to be eligible (default: level band end value)
- **Mandatory completion:** all mandatory requirements must be complete (boolean, default true)
- **Minimum time at level:** required months at current level (nullable, in months)
- **Manager approval required:** boolean (default true)
- **HR counter-sign required:** boolean (default false)
- **Active blocker check:** no active PIP or formal performance concern (boolean, default true — details logged in audit but PIP management is external)

### 8.6 Visibility Rules

Organization-level settings controlling what employees can see about peers:
- `OWN_ONLY` — employee sees only their own data (MVP default — see §14.2)
- `TEAM` — employee sees their team members' summary info (name, level, Readiness %)
- `ORG_SUMMARY` — employee sees org-wide level distribution aggregates (no individual data)
- `ORG_FULL` — employee sees all employee summary info (name, level, Readiness %) (rare, for transparent cultures)

**Rule:** Managers always see their reports regardless of visibility setting. Admin/HR always see all. Visibility rules govern only what Employees see about peers.

**Map-Level Anonymization (enterprise-safe default):** The 3D map is the most spatially revealing surface in the product. Employees with `OWN_ONLY` visibility (MVP default) see their own node as identified and all other nodes rendered as **anonymous placeholder nodes** — correct in position (track, level, score band) to preserve the organizational shape, but stripped of name, avatar, Readiness %, ETA, and any identity. Hovering or clicking an anonymous node yields no detail panel; only the aggregate shape is visible. This prevents the map from becoming a peer-pressure surface or a leaderboard while preserving FCM's "you can see where you are in the whole" effect. At `TEAM` visibility, anonymization is lifted for direct team members only; at `ORG_SUMMARY`, individual nodes remain anonymized and only aggregate counts are shown; at `ORG_FULL`, anonymization is fully lifted. Anonymization is enforced server-side at the Map Data Contract level (see architecture §13.3), not client-side.

**Default posture:** New organizations are seeded with `OWN_ONLY`. Escalation to broader visibility is an explicit Admin action, audited per §10.1.

### 8.7 Approval Workflow

Per organization:
- `SINGLE` — manager sign-off completes promotion (default)
- `DUAL_MANAGER` — manager + a second manager (skip-level or peer)
- `HR_GATE` — manager + HR/Admin counter-sign

Organizations may configure different workflows per level (e.g., Single for L1→L2, HR_Gate for L4→L5).

### 8.8 What Is NOT Configurable

The following are product-invariant:
- The scoring formula (Score = sum of weighted approved evidence at current level)
- The readiness formula (score-band progress gated by mandatory completion)
- The ETA formula (remaining points / 90-day velocity)
- The confidence model structure (High / Medium / Low categorical)
- The Fibonacci spiral visual structure (immutable product identity)
- Audit log behavior (always on, always immutable, no org override)
- The requirement that every committed promotion carries a Manager-authored Performance Narrative (§6.5)
- The existence of the Calibration Hold affordance for HR (§6.8)
- The existence of the two-state Rollout Mode model (§8.9)

### 8.9 Organizational Rollout Mode

Organizations adopting FCM almost always begin with a large population of employees who — measured against the newly activated configuration — would compute as Promotion-Eligible on day one. Without an explicit transition construct, this creates a bootstrap promotion surge, destabilizes managerial judgment, and invites the system to be perceived as an automatic-promotion engine. Rollout Mode is the organization-level posture that controls how Promotion Eligibility is surfaced and actionable across the org.

**Two modes (organization-scoped, admin-configurable):**

| Mode | Promotion Actions Enabled | Map & Panel Display | Score / Readiness / ETA | Default For |
|---|---|---|---|---|
| `CALIBRATION` | **Disabled** — "Initiate Promotion" is suppressed org-wide even for Eligible employees | Readiness % and ETA are computed and shown, Eligibility is computed and stored, but the Eligibility badge is labeled "Eligible — Pending Calibration" and no promotion UI is exposed | Fully active | New organizations (seeded default) |
| `ACTIVE` | Enabled per-employee, gated by Eligibility + Calibration Flag state | Eligibility fully visible; promotion UI exposed for eligible, non-flagged employees | Fully active | Established organizations post-calibration |

**Behavioral rules:**
- New organizations are seeded with `CALIBRATION` on first activation. This is not a bug state — it is the safe default that gives HR and management time to review the bootstrap eligibility landscape before the org's first promotion cycle on FCM.
- Transition from `CALIBRATION` to `ACTIVE` requires:
  1. An Admin action
  2. A mandatory rationale string (≥100 characters) explaining the calibration outcome (e.g., "Manager calibration meetings completed 2026-05-02; top tier aligned on upcoming cycle.")
  3. Automatic capture of a **Bootstrap Eligibility Snapshot** — an immutable record of every employee's Eligibility, Score, Readiness %, and Calibration Flag state at the moment of transition. This snapshot is retained forever and is the authoritative "starting line" the organization can later audit against.
- The reverse transition (`ACTIVE` → `CALIBRATION`) is permitted (e.g., mid-year re-calibration, mid-reorg) and is audited with rationale, but does not re-snapshot; it simply suppresses promotion UI again.
- Rollout Mode does NOT affect score recalculation, evidence workflow, audit logging, or ETA/Confidence display. Data continues to flow; only promotion-initiation surface area is gated.
- Rollout Mode is visible to all Managers and HR in the Settings surface and on relevant Manager/HR views as a banner ("Org in Calibration mode — promotion workflow suspended"); Employees do not see the banner but do see the reworded Eligibility label where applicable.

**Why this is configurable:** organizations land on FCM at different maturity levels. Small orgs may prefer to skip `CALIBRATION` by transitioning immediately post-seeding. Large enterprises may stay in `CALIBRATION` for weeks. The mode is an org policy knob, not a product policy knob.

**Why the default is `CALIBRATION`:** the cost of a wrong auto-promotion surge (organizational trust, payroll, narrative coherence) vastly exceeds the cost of a short promotion pause at go-live. The product's default posture is "earn promotion velocity, not inherit it."

---

## 9. Visibility and Approval Rules — Enforcement

### 9.1 Visibility Enforcement

- All API endpoints enforce visibility rules at the query layer
- The 3D map renders only nodes visible to the current user per visibility rules (other employees' nodes are filtered server-side, not client-side)
- Employee Detail Panel content respects visibility: employees see only summary info (name, level, Readiness %) about peers when `TEAM` or higher is configured; full detail (score, ETA, evidence) is never exposed to peers

### 9.2 Approval Enforcement

- Evidence approval actions are restricted to the reviewer hierarchy: direct Manager, or Admin/HR
- Promotion approvals follow the configured workflow; the system enforces the approval chain before the promotion record is committed
- Self-approval is prohibited: a Manager cannot approve their own evidence; an Admin cannot counter-sign a promotion they initiated (requires a different Admin)

### 9.3 Defense-in-Depth

Authorization checks are enforced at three layers:
1. **API layer:** endpoint-level role checks reject unauthorized requests
2. **Domain layer:** business logic verifies the actor has permission for the specific resource
3. **Data layer:** queries scope by organization_id and applicable role filters

---

## 10. Auditability Requirements

### 10.1 Audit Event Coverage

The following events MUST be logged immutably with actor, timestamp, and reason (where applicable):

| Event Type | Required Data |
|---|---|
| Evidence submission | actor (employee), evidence_id, requirement_id, timestamp |
| Evidence approval | actor (manager/admin), evidence_id, reason, before_score, after_score, timestamp |
| Evidence rejection | actor (manager/admin), evidence_id, reason, timestamp |
| Score recalculation | employee_id, trigger_event_id, before_snapshot, after_snapshot, timestamp |
| Configuration change (any field) | actor (admin), entity_type, entity_id, field, before_value, after_value, timestamp |
| Promotion initiation | actor (manager), employee_id, from_level, to_level, timestamp |
| Promotion approval/rejection | actor, employee_id, decision, reason, timestamp |
| Promotion completion | employee_id, from_level, to_level, final_score, final_evidence_ids, timestamp |
| Role assignment change | actor (admin), target_user_id, from_role, to_role, timestamp |
| Visibility rule change | actor (admin), from_setting, to_setting, timestamp |
| Approval workflow change | actor (admin), from_config, to_config, timestamp |

### 10.2 Audit Log Properties

- **Immutable:** no edit or delete operations exist on audit records
- **Append-only:** new records can be added; existing records are sealed
- **Comprehensive:** every data-mutating event writes at least one audit record
- **Queryable:** filter by actor, event type, target entity, date range
- **Exportable:** Admin/HR can export audit records as CSV or PDF
- **Retention:** audit records are retained indefinitely in MVP (configurable retention is V2)

### 10.3 Explainability

Every score displayed in the product must be explainable: the user can trace from the current score to the set of approved evidence items that contributed to it, each with its weight and approval metadata. This is exposed via:
- Employee Full Profile page → Score Breakdown section
- API endpoint returning the score derivation for a given ScoreSnapshot

---

## 11. Functional Requirements

Each requirement is tagged with an ID for traceability into epics and stories.

### 11.1 Authentication and Authorization

| ID | Requirement |
|---|---|
| FR-1.1 | System supports OIDC / SSO authentication with at least one configurable identity provider per organization |
| FR-1.2 | System supports username/password login for admin bootstrap when OIDC is unavailable (MVP fallback) |
| FR-1.3 | System enforces role-based access control at API, domain, and data layers |
| FR-1.4 | System supports Employee, Manager, Admin / HR role assignments scoped per organization |
| FR-1.5 | Users have a single active session per device; session tokens expire after a configurable timeout (default 24 hours) |

### 11.2 3D Career Map

| ID | Requirement |
|---|---|
| FR-2.1 | The Career Map is the default landing page after login for all roles |
| FR-2.2 | System renders a Fibonacci-spiral 3D visualization of the organization's career structure |
| FR-2.3 | Each career track occupies a distinct spiral segment |
| FR-2.4 | Each level occupies a band within its track segment with color coding |
| FR-2.5 | Each employee is rendered as a node at their current track and level |
| FR-2.6 | Nodes are visually encoded by level (color) and by readiness (brightness or opacity — see §14.3) |
| FR-2.7 | Users can rotate the 3D canvas via click-and-drag |
| FR-2.8 | Users can zoom in and out via mouse scroll or UI controls |
| FR-2.9 | Users can click on visible nodes to open the Employee Detail Panel |
| FR-2.10 | Hovering over a node shows a lightweight tooltip (name, level, track) |
| FR-2.11 | A reset-camera control returns to default orientation |
| FR-2.12 | The Filters panel on the left side controls visible tracks and levels |
| FR-2.13 | Filters persist for the duration of the session |
| FR-2.14 | At far zoom, clusters aggregate multiple nodes with a count indicator |
| FR-2.15 | Manager default filter is scoped to their direct reports (see §14.5) |

### 11.3 Employee Detail Panel

| ID | Requirement |
|---|---|
| FR-3.1 | Clicking a node opens the Employee Detail Panel sliding from the right |
| FR-3.2 | The 3D canvas remains visible and rotatable while the panel is open |
| FR-3.3 | The panel displays employee name, track, current level, and photo (if available) |
| FR-3.4 | The panel displays layer-by-layer scores with progress bars and percentages |
| FR-3.5 | The panel displays Next Requirements (open/in-progress items) |
| FR-3.6 | The panel displays Score Progress, Readiness %, and Promotion Eligibility as three visually distinct outputs |
| FR-3.7 | The panel displays ETA and Confidence together as a paired output |
| FR-3.8 | The panel includes a forecast window selector (3 / 6 / 12 months) |
| FR-3.9 | Employees can submit evidence from their own panel |
| FR-3.10 | Managers can approve or reject pending evidence inline |
| FR-3.11 | Managers can initiate promotion requests inline only when Promotion Eligibility is `ELIGIBLE` |
| FR-3.12 | Panel content respects visibility rules for the viewing user |
| FR-3.13 | Closing the panel returns to the full 3D canvas |
| FR-3.14 | The panel exposes a Development Notes tab for Managers viewing a direct report: notes may be marked `PRIVATE` (visible to Manager, HR, and any configured skip-level only) or `SHARED_WITH_EMPLOYEE` (visible additionally to the Employee). State transitions are auditable and irreversible (a shared note cannot be un-shared). |
| FR-3.15 | The panel exposes a "Flag for Calibration" action for HR on any employee in `ELIGIBLE` state. Flagging opens a mandatory reason field (≥40 characters) and transitions the Eligibility UI-state to `CALIBRATION_HOLD` until resolved by HR. |
| FR-3.16 | When the organization's Rollout Mode is `CALIBRATION` (§8.9), the "Initiate Promotion" action is suppressed regardless of Eligibility; the panel displays "Eligible — Pending Calibration" and a banner explaining the org-level mode. |
| FR-3.17 | When an Employee views a peer node they are allowed to see (per §8.6 visibility), Score, ETA, Confidence, and Development Notes are never exposed — only anonymized or summary fields as configured. |

### 11.4 Evidence Management

| ID | Requirement |
|---|---|
| FR-4.1 | Employees can submit evidence against any open requirement assigned to them |
| FR-4.2 | Evidence submission supports file upload, URL, text, or structured form based on requirement configuration |
| FR-4.3 | File evidence is stored in S3-compatible object storage with access-controlled URLs |
| FR-4.4 | Each evidence item has a lifecycle: DRAFT → PENDING_APPROVAL → APPROVED / REJECTED |
| FR-4.5 | Managers can approve or reject evidence for direct reports with mandatory reason fields |
| FR-4.6 | Admin/HR can approve or reject evidence for any employee |
| FR-4.7 | Approved evidence can be retroactively rejected by a Manager or Admin; this triggers score recalculation and is flagged in the audit log |
| FR-4.8 | Evidence with a configured expiry is automatically transitioned to EXPIRED state after the expiry period (see §14.7) |

### 11.5 Scoring Engine

| ID | Requirement |
|---|---|
| FR-5.1 | Score is calculated as the sum of weights of APPROVED evidence at the employee's current level |
| FR-5.2 | Readiness % is calculated as score progress within band multiplied by mandatory completion ratio; it is a displayed informational metric, not a promotion gate |
| FR-5.3 | Promotion Eligibility is a binary (Eligible / Not Eligible) value computed as the conjunction of all configured promotion rule conditions (§7.5); it is the authoritative gate for promotion actions |
| FR-5.4 | System surfaces Score, Readiness %, and Promotion Eligibility as three distinct outputs in every employee-facing view where progression is displayed |
| FR-5.5 | ETA is calculated as remaining points divided by 90-day validated velocity |
| FR-5.6 | Confidence is assigned based on history window, velocity consistency, and mandatory gap count |
| FR-5.7 | Recalculation runs asynchronously via a background job queue |
| FR-5.8 | Recalculation is deterministic: same inputs produce same Score, Readiness %, Promotion Eligibility, ETA, and Confidence outputs |
| FR-5.9 | Recalculation is idempotent: repeated runs on unchanged inputs produce identical results |
| FR-5.10 | Every recalculation creates a new ScoreSnapshot record including Promotion Eligibility state |
| FR-5.11 | Failed recalculation jobs retry with exponential backoff; persistent failures trigger alerts |
| FR-5.12 | UI indicates recalculation-pending status when a job is in-flight for the viewed employee |

### 11.6 Configuration

| ID | Requirement |
|---|---|
| FR-6.1 | Admin/HR can create, edit, and deactivate career tracks |
| FR-6.2 | Admin/HR can configure levels with custom names and score bands per track |
| FR-6.3 | Admin/HR can configure layers (count and names) per level |
| FR-6.4 | Admin/HR can create, edit, and deactivate requirements with weight, mandatory flag, evidence type, and expiry |
| FR-6.5 | Admin/HR can configure promotion rules per level |
| FR-6.6 | Admin/HR can configure visibility rules per organization |
| FR-6.7 | Admin/HR can configure approval workflow per organization or per level |
| FR-6.8 | Configuration changes trigger a preview of affected employees before save |
| FR-6.9 | Configuration changes trigger asynchronous recalculation of affected employees upon save |
| FR-6.10 | Configuration changes are logged immutably in the audit log |

### 11.7 Promotion Workflow

| ID | Requirement |
|---|---|
| FR-7.1 | System evaluates Promotion Eligibility (§7.5 binary gate) at every recalculation |
| FR-7.2 | Employee Detail Panel displays a "Promotion-Ready" signal if and only if Promotion Eligibility is `ELIGIBLE` — never based on Readiness % alone |
| FR-7.3 | Manager can initiate a promotion request from the Detail Panel only when Promotion Eligibility is `ELIGIBLE` |
| FR-7.4 | API endpoints that initiate, approve, or commit a promotion MUST verify Promotion Eligibility server-side before accepting the request; requests for ineligible employees are rejected with a structured error explaining the failing condition |
| FR-7.5 | Promotion requests follow the configured approval workflow (single / dual / HR gate) |
| FR-7.6 | Self-approval is prohibited: actors cannot approve their own initiated promotion |
| FR-7.7 | Approved promotions update the employee's level, archive the previous-level score, and reposition the node on the 3D map |
| FR-7.8 | All promotion events are logged immutably |
| FR-7.9 | Employees receive in-app notifications of promotion approval or rejection |
| FR-7.10 | Every initiated promotion carries a Manager-authored Performance Narrative (free-text, minimum 200 characters). Submission without a Performance Narrative is rejected at the API boundary with a structured validation error. |
| FR-7.11 | The Performance Narrative is captured into the immutable audit log and the promotion record; it is never editable after submission. Corrections require a new promotion cycle with a new narrative. |
| FR-7.12 | HR may place any pending or newly eligible promotion on Calibration Hold; while on hold, promotion approval API endpoints reject the request with a structured error identifying the calibration flag ID. |
| FR-7.13 | When Rollout Mode is `CALIBRATION`, all promotion initiation/approval/commit endpoints reject requests with a structured error indicating the organization is in calibration posture; this rejection is itself audited. |
| FR-7.14 | Transitioning Rollout Mode from `CALIBRATION` to `ACTIVE` is an Admin-only action requiring a rationale of ≥100 characters and triggers capture of an immutable Bootstrap Eligibility Snapshot containing every employee's Score, Readiness %, Promotion Eligibility, and Calibration Flag state at the transition moment. |

### 11.8 Audit Log

| ID | Requirement |
|---|---|
| FR-8.1 | System logs every evidence submission, approval, rejection, score change, config change, promotion event, and role change |
| FR-8.2 | Audit log records include actor, timestamp, action, target, before/after values (where applicable), and reason (where applicable) |
| FR-8.3 | Audit log is append-only; no edit or delete operations |
| FR-8.4 | Admin/HR can filter audit log by actor, event type, target entity, and date range |
| FR-8.5 | Admin/HR can export audit records as CSV or PDF |
| FR-8.6 | Employee can view audit events affecting their own record |
| FR-8.7 | Manager can view audit events affecting their direct reports |

### 11.9 Notifications

| ID | Requirement |
|---|---|
| FR-9.1 | System delivers in-app notifications for: pending evidence review, evidence approval/rejection, score change events, promotion initiation, promotion decisions, configuration changes affecting the user |
| FR-9.2 | Notifications have read/unread state per user |
| FR-9.3 | Notifications are persisted and retrievable from a notification center UI |
| FR-9.4 | Email and Slack channels are explicitly out of scope for MVP |

### 11.10 Analytics Dashboard (2D)

| ID | Requirement |
|---|---|
| FR-10.1 | Analytics view displays org or team-level distribution of employees by track and level |
| FR-10.2 | Analytics view surfaces lists of promotion-ready employees, stalled employees, and at-risk employees |
| FR-10.3 | Analytics view displays aggregate velocity and readiness trends over time |
| FR-10.4 | Analytics scope respects role: Managers see team-scoped analytics; Admin sees org-wide |
| FR-10.5 | HR-scoped Analytics view exposes a **Calibration Queue** listing all employees currently in `ELIGIBLE` or `CALIBRATION_HOLD` state, sortable by eligibility date, manager, track, and level. Each row supports one-click navigation to the employee's Detail Panel and to the Calibration Flag resolution action. |
| FR-10.6 | HR-scoped Analytics view exposes a **Bootstrap Eligibility Snapshot** explorer: when the organization has transitioned from `CALIBRATION` → `ACTIVE`, HR can view the immutable snapshot captured at transition and compare it to current state. |
| FR-10.7 | HR-scoped Analytics view exposes a **Manager Approval Pattern** report showing, per manager, counts of promotions recommended, eligibility-to-recommendation latency, and Performance Narrative length distribution, to support calibration and detect outliers. |

### 11.11 Dashboard (2D)

| ID | Requirement |
|---|---|
| FR-11.1 | Dashboard provides a summary entry view with key KPIs |
| FR-11.2 | Dashboard provides quick links to: Career Map, recent notifications, pending actions |
| FR-11.3 | Dashboard content respects role and visibility scope |

### 11.12 Manager Engagement Nudges (New — from Blocker Resolution §14.1)

| ID | Requirement |
|---|---|
| FR-12.1 | Manager Dashboard displays a "Pending Reviews" badge with count of open evidence awaiting their approval |
| FR-12.2 | Evidence pending a Manager's review for more than 7 days appears in a "Stale Reviews" section of their Dashboard with increased visual emphasis |
| FR-12.3 | Admin/HR can view an organization-wide report of managers ranked by average evidence review latency |
| FR-12.4 | System logs evidence review latency metrics for observability and operational monitoring |

---

## 12. Non-Functional Requirements

### 12.1 Performance

| ID | Requirement |
|---|---|
| NFR-1.1 | 3D Career Map renders at interactive frame rate (≥30 fps sustained, target 60 fps) on standard desktop hardware for organizations with up to 500 employees |
| NFR-1.2 | Employee Detail Panel opens within 500ms of node click |
| NFR-1.3 | Evidence submission response within 2s excluding file upload time |
| NFR-1.4 | Score recalculation completes within 30s for an individual employee under normal load |
| NFR-1.5 | Organization-wide recalculation (triggered by config change) completes within 5 minutes for 500 employees |
| NFR-1.6 | API p95 response time < 500ms for read endpoints, < 2s for write endpoints |

### 12.2 Scalability

| ID | Requirement |
|---|---|
| NFR-2.1 | Architecture supports horizontal scaling of API and worker processes independently |
| NFR-2.2 | Background job processing scales independently of API request load |
| NFR-2.3 | 3D rendering approach (LOD, clustering, culling) must be designed to extend beyond 500-employee MVP target |

### 12.3 Reliability and Determinism

| ID | Requirement |
|---|---|
| NFR-3.1 | Score, Readiness %, Promotion Eligibility, ETA, and Confidence calculations are deterministic: identical inputs always produce identical outputs |
| NFR-3.2 | Recalculation jobs are idempotent: repeat execution does not duplicate score changes |
| NFR-3.3 | Failed jobs retry with exponential backoff (max 5 retries before dead-letter) |
| NFR-3.4 | Database transactions ensure consistency of multi-step operations (e.g., promotion + audit write atomic) |

### 12.4 Security

| ID | Requirement |
|---|---|
| NFR-4.1 | All data in transit is encrypted via TLS 1.2+ |
| NFR-4.2 | Evidence files in object storage are encrypted at rest |
| NFR-4.3 | Access to evidence files requires authenticated, time-limited pre-signed URLs |
| NFR-4.4 | No cross-organization data leakage; all queries are organization-scoped |
| NFR-4.5 | Role-based authorization enforced at API, domain, and data layers |
| NFR-4.6 | Passwords (if used) stored using bcrypt or equivalent; SSO preferred |
| NFR-4.7 | Secrets managed via cloud-provider secret manager; not stored in code or environment files |

### 12.5 Auditability

| ID | Requirement |
|---|---|
| NFR-5.1 | All data-mutating events write at least one audit record |
| NFR-5.2 | Audit records are immutable after write |
| NFR-5.3 | Audit records retain all fields required for reconstructing the event (actor, target, before, after, timestamp, reason) |

### 12.6 Observability

| ID | Requirement |
|---|---|
| NFR-6.1 | All services emit structured logs (JSON format) with correlation IDs |
| NFR-6.2 | Metrics exported in a standard format (Prometheus-compatible preferred) |
| NFR-6.3 | Distributed tracing instrumentation for request flows across services |
| NFR-6.4 | Alerts configured for: job queue backlog, recalculation failures, API error rate, database connection exhaustion |
| NFR-6.5 | Operations runbook maintained for common incident response |

### 12.7 Maintainability and Modularity

| ID | Requirement |
|---|---|
| NFR-7.1 | Backend organized into domain modules: scoring, evidence, configuration, audit, identity, forecasting |
| NFR-7.2 | Each domain module is independently testable |
| NFR-7.3 | Business logic decoupled from transport (API) and persistence (database) layers |
| NFR-7.4 | Test coverage target: ≥70% unit test coverage for business logic modules at MVP |

### 12.8 Integration Readiness

| ID | Requirement |
|---|---|
| NFR-8.1 | Public API exposes all core read operations required for future HRIS/LMS integration |
| NFR-8.2 | API follows OpenAPI 3.0+ specification |
| NFR-8.3 | API supports pagination, filtering, and sorting for list endpoints |
| NFR-8.4 | Webhooks emitted for key events (promotion completed, score changed significantly) — infrastructure ready, endpoints configurable in V2 |

### 12.9 Deployment and Environment

| ID | Requirement |
|---|---|
| NFR-9.1 | Application runs in containerized environments |
| NFR-9.2 | Separate dev, staging, and production environments exist with environment parity |
| NFR-9.3 | CI/CD pipeline automates build, test, and deployment |
| NFR-9.4 | Database migrations are versioned and automated |
| NFR-9.5 | Frontend served via CDN / edge |
| NFR-9.6 | Managed PostgreSQL, Redis, and object storage preferred |

### 12.10 Usability and Accessibility

| ID | Requirement |
|---|---|
| NFR-10.1 | UI follows dark mode as the default theme |
| NFR-10.2 | UI is responsive to desktop viewport widths from 1280px to 2560px |
| NFR-10.3 | Color palette is colorblind-safe (tested against common forms of color vision deficiency) |
| NFR-10.4 | All actions reachable via keyboard (tab navigation supported) in 2D panels and views |
| NFR-10.5 | Screen reader support for 2D panels (Employee Detail, Analytics, Settings); 3D canvas is exempt from screen reader parity in MVP but includes aria-label summaries for context |

---

## 13. Technical Constraints (Planning-Level)

These constraints reflect the intended product direction and guide the architect's choices in the next step. They are not final architectural decisions.

| Area | Constraint |
|---|---|
| Frontend | Next.js / React; dark mode by default |
| 3D Layer | Three.js or React Three Fiber; LOD and clustering required |
| Backend | Modular domain-oriented API; NestJS preferred |
| Database | PostgreSQL as the system of record |
| Cache / Jobs | Redis for caching and background job queue |
| Evidence Storage | S3-compatible object storage |
| Authentication | OIDC / SSO-ready |
| Environments | dev / staging / prod with CI/CD |
| Cloud Posture | Cloud-ready from day one; managed services preferred |

---

## 14. PRD Blocker Resolutions

The Product Brief flagged 7 blockers requiring PRD-level resolution. Each is resolved conservatively below.

### 14.1 Manager Engagement and Approval Workflow Nudges — **RESOLVED**

**Decision:** Engagement is driven via in-app visibility and operational transparency, not via push notifications (email/Slack are out of scope for MVP).

**PRD behavior:**
- Manager Dashboard prominently displays a "Pending Reviews" count badge
- Evidence pending review for > 7 days appears in a dedicated "Stale Reviews" section with visual emphasis (e.g., warning color, aging indicator)
- Admin/HR has access to a manager engagement report showing average review latency per manager
- Review latency metrics are exposed in observability (Prometheus metrics) for operational monitoring
- In-app notifications on new pending review arrival (FR-9.1)

**Rationale:** MVP keeps delivery scope tight while ensuring engagement is measurable. V2 will add email/Slack channels and configurable reminders.

### 14.2 Default Employee Visibility Rule — **RESOLVED**

**Decision:** **MVP default is `OWN_ONLY`** — employees see only their own data.

**PRD behavior:**
- Organizations start with `OWN_ONLY` visibility for peers
- Admin/HR can upgrade to `TEAM`, `ORG_SUMMARY`, or `ORG_FULL` as organization maturity and culture dictate
- The 3D Career Map shows all nodes to Managers (for their team) and Admin (org-wide); for Employees with `OWN_ONLY`, the map shows their own node only or aggregated (anonymous) org structure — see §14.5 for map scope resolution
- Managers always see their reports regardless of this setting

**Rationale:** Conservative default for enterprise adoption. Privacy-preserving. Organizations can opt in to peer visibility as culture allows.

### 14.3 3D Visual Encoding Beyond Level Color — **RESOLVED**

**Decision:** **Two visual encodings on each employee node, plus discrete state signals:**
1. **Color** — encodes level (L1 blue, L2 teal, L3 purple, L4 tan, L5 silver — from reference artifacts)
2. **Brightness / Opacity** — encodes Readiness % (brighter/higher opacity = higher Readiness %; graduated progress signal)

**Additional visual signals (discrete states):**
- Nodes whose **Promotion Eligibility** is `ELIGIBLE` receive a subtle pulsing highlight (accessible alternative: animation-off variant or shape variation). This signal is driven by the binary Promotion Eligibility gate (§7.5), NOT by Readiness % crossing an arbitrary threshold.
- Nodes with "At Risk" state (low Confidence + long stall) receive a muted/desaturated visual treatment to signal attention.

**Rationale:** Color-by-level + brightness-by-Readiness % give dense continuous information at a glance. The "Promotion-Ready" pulse is a binary state tied to Promotion Eligibility, keeping visual signaling consistent with the system's authoritative gate. The reference images confirm color-by-level; Readiness % brightness encoding is the PRD's resolved default.

### 14.4 ETA / Confidence Edge Cases for Low-History Employees — **RESOLVED**

**Decision:** Explicit edge case handling:

| Scenario | ETA Display | Confidence |
|---|---|---|
| Employee has <30 days of history (new to current level) | "Insufficient data" | Low |
| Employee has 30–59 days of history with velocity > 0 | Calculated ETA with caveat icon | Low |
| Employee has 60–89 days of history with consistent velocity | Calculated ETA | Medium |
| Employee has ≥60 days with consistent velocity AND ≤1 mandatory gap | Calculated ETA | High |
| Employee has velocity_90d == 0 (stalled or inactive) | "Insufficient data" | Low |
| Employee has declining velocity (>40% drop QoQ) | Calculated ETA with warning icon | Low |

**Rationale:** Confidence honesty. We never display a falsely confident ETA for an employee without enough evidence history. Conservative defaults protect the integrity of the intelligence product.

### 14.5 Manager Visibility Scope on the 3D Map — **RESOLVED**

**Decision:** **Managers see the full organization-wide 3D map**, but interaction and detail access are scoped:

- **Visible nodes:** Managers see all employee nodes across the org (anonymized summary only for non-reports per visibility rules)
- **Clickable nodes with full detail:** Only their direct reports and themselves
- **Non-report nodes:** Display level and track context (for organizational awareness) but the Detail Panel shows limited info (level, track; no score, ETA, or evidence data) unless visibility rules allow more
- **Default filter:** A "My Team" filter is applied by default on Manager login, showing only their reports; Manager can toggle off to see the full org map

**For Employees with `OWN_ONLY` visibility:** The 3D map shows an aggregated, anonymized organizational structure (segment shapes and level bands visible, individual peer nodes hidden). The employee's own node is highlighted.

**For Admin/HR:** Full 3D map, all nodes, all detail panels.

**Rationale:** Managers need organizational awareness to contextualize their team (e.g., "where is my team vs. org distribution?") but must not have unrestricted access to other teams' progression data. The default "My Team" filter keeps daily workflow tight; the toggle enables contextual awareness.

### 14.6 Track Change / Track Transfer Behavior — **RESOLVED**

**Decision:** **Score archival with full history preservation.**

**PRD behavior when an employee transfers tracks (e.g., Software Engineering → Management):**
1. A `TrackTransfer` event is logged immutably with actor, from_track, to_track, reason, and timestamp
2. The employee's score at the previous track is archived (preserved in ScoreSnapshot history; not deleted)
3. The employee starts at the assigned level in the new track with **Score = 0**
4. Previous evidence remains in the audit history but does not contribute to the new track's score
5. Admin can optionally carry over specific evidence items (mark them applicable to the new track's requirements) as a manual action — this is logged as manual evidence re-association
6. All previous ScoreSnapshots, evidence, and audit records remain accessible on the employee's profile
7. ETA for the new track begins accumulating velocity data from the transfer date

**Rationale:** Conservative default preserves audit integrity. Track-specific requirements differ; carrying scores automatically would violate the distinct-requirements model. Admins can manually re-associate evidence when it genuinely applies across tracks.

### 14.7 Evidence Expiry Behavior — **RESOLVED**

**Decision:** **Expiry triggers automatic state transition with score recalculation and employee notification.**

**PRD behavior:**
1. Requirements can be configured with an expiry period in months (e.g., certification valid for 24 months)
2. At evidence approval time, the system computes the evidence's `expires_at` timestamp based on the requirement's expiry period
3. A background job runs daily to detect expired evidence
4. Expired evidence state: `APPROVED` → `EXPIRED`
5. Score recalculation is triggered for the affected employee (expired evidence no longer contributes)
6. The corresponding requirement is marked as "incomplete" if it was previously satisfied by that evidence
7. Employee receives an in-app notification: "Your [X] evidence has expired. Re-submission may be required."
8. Expiry events are logged in the audit log

**Rationale:** Certifications and time-sensitive credentials genuinely expire in the real world. The product must reflect this. Score recalculation preserves the integrity of the Score Progress / Readiness % / Promotion Eligibility model — expiry of a mandatory credential flips Promotion Eligibility back to `NOT ELIGIBLE` even if the score is unchanged. Employee notification gives them time to renew before Promotion Eligibility degrades.

### 14.8 Bootstrap Promotion Surge at First Activation — **RESOLVED**

**Decision:** **Two-state organizational Rollout Mode with `CALIBRATION` as the default on new organizations.** See §8.9 for the full configuration surface and §11.7 / §11.10 for the corresponding functional requirements.

**PRD behavior at first activation:**
1. Organization seeds with Rollout Mode = `CALIBRATION`
2. Scoring, recalculation, Readiness %, and ETA continue to compute normally; Promotion Eligibility is evaluated and stored
3. Promotion initiation, approval, and commit endpoints are blocked org-wide; UI surfaces the "Eligible — Pending Calibration" state and a banner explaining the calibration posture
4. HR reviews the Calibration Queue (FR-10.5), calibrates with managers, and flags any eligible employee who needs organizational review
5. When calibration is complete, Admin transitions to `ACTIVE` with a mandatory rationale ≥100 characters; the Bootstrap Eligibility Snapshot is captured at that moment and retained immutably
6. Post-transition, promotion workflow operates normally, gated by Eligibility + absence of Calibration Hold + completed Manager Recommendation and approval workflow

**Rationale:** Without this resolution, FCM's first activation for any non-trivial org computes hundreds of "Eligible" employees simultaneously — a politically and operationally catastrophic signal. The two-state model turns the first activation into an intentional calibration step rather than an implicit promotion storm, protecting organizational trust in the system. The Bootstrap Eligibility Snapshot gives HR an immutable audit anchor of "what the system would have said on day one," enabling defensible post-hoc review.

**Tradeoff accepted:** The default `CALIBRATION` mode means organizations see FCM's promotion workflow as "suspended" until they explicitly activate it. This is surfaced clearly in Settings and onboarding guidance. Small organizations with no existing career-model inheritance may transition to `ACTIVE` immediately.

### 14.9 Promotion as Human Decision, Not Computed Outcome — **RESOLVED**

**Decision:** **Promotion Eligibility is a necessary precondition, never a sufficient one. Every committed promotion carries a Manager-authored Performance Narrative, and HR may intervene via Calibration Flag.** See §6.5 (workflow), §6.8 (calibration), §7.5 (eligibility), §11.7 (FRs) for the mechanisms.

**PRD behavior:**
1. The system computes Promotion Eligibility but never auto-initiates a promotion
2. "Initiate Promotion" is a Manager action, available only when (a) Eligibility = `ELIGIBLE`, (b) no active Calibration Hold, (c) Rollout Mode = `ACTIVE`
3. Every initiation requires a Performance Narrative (free-text, ≥200 characters) describing the Manager's judgment of the employee's performance at level — not a restatement of the checklist, but the Manager's own case
4. The Narrative is captured in the promotion record and audit log and is immutable thereafter
5. HR may place any eligibility state or pending promotion on Calibration Hold (FR-7.12) with a reason; holds block approval paths until HR resolves
6. Configured approval workflow (single / dual / HR gate per §8.7) executes after the Manager's Recommendation; the level transition commits only on completion of the full chain

**Rationale:** The most dangerous failure mode for a system like FCM is to be perceived as an automatic-promotion engine — a checklist that, when satisfied, produces a promotion without human judgment. This erodes managerial authority, invalidates organizational context (headcount, business priorities, peer comparisons), and makes the system feel mechanical rather than intelligent. The resolution reframes FCM as the **system that surfaces the facts and enforces the discipline of the decision, but never replaces the decision itself.** The Performance Narrative is the artifact that makes this explicit: it requires the Manager to say, in their own words, why this person should be promoted now. This single requirement prevents the entire "checklist promotion" failure mode.

**Tradeoff accepted:** Managers must invest effort in writing narratives; this is an intentional cost. The 200-character minimum is deliberately modest to avoid theater while still requiring a substantive statement. Organizations valuing higher rigor can extend this in configuration (V2).

---

## 15. Core Data Entities (Product Level)

This is a product-level data model. The architect will define the physical schema in the next workflow.

| Entity | Description | Key Relationships |
|---|---|---|
| Organization | Top-level tenant; owns all config and employee data | Has many: Users, CareerTracks, AuditEvents |
| User | An authenticated person; has one role per org | Belongs to: Organization; Has: Employee profile (if applicable) |
| CareerTrack | A named progression path | Belongs to: Organization; Has many: Levels |
| Level | A stage within a track with a score band | Belongs to: CareerTrack; Has many: Layers, Requirements, PromotionRules |
| Layer | An evaluation dimension within a level | Belongs to: Level; Has many: Requirements |
| Requirement | A specific evidence expectation | Belongs to: Layer; Has: weight, mandatory flag, evidence type, expiry |
| Employee | A person assigned to a track and level | Belongs to: User, Organization, CareerTrack, Level; Has many: Evidence, ScoreSnapshots |
| Evidence | A submission against a requirement | Belongs to: Employee, Requirement; Has: state, evidence payload, expires_at |
| ScoreSnapshot | A timestamped record of score state | Belongs to: Employee; Has: score, readiness_pct, eta_months, confidence |
| Forecast | (Embedded in ScoreSnapshot as ETA + Confidence) | — |
| ApprovalRecord | A decision on evidence or promotion | Belongs to: Actor (User), Target (Evidence or PromotionRecord) |
| PromotionRecord | A formal promotion event | Belongs to: Employee; Has: from_level, to_level, approval chain |
| PromotionRule | Promotion criteria per level | Belongs to: Level |
| ApprovalWorkflow | Configured workflow per org/level | Belongs to: Organization |
| VisibilityRule | Configured visibility scope per org | Belongs to: Organization |
| AuditEvent | An immutable log entry | Belongs to: Organization; References: Actor, Target |
| Notification | An in-app notification for a user | Belongs to: User |
| TrackTransfer | A record of an employee changing tracks | Belongs to: Employee |

---

## 16. Out of Scope for MVP

| Item | Rationale |
|---|---|
| Mobile application | 3D interaction is desktop-native; mobile is V2 |
| Email / Slack notification channels | In-app notifications sufficient for MVP; push channels are V2 |
| AI-generated next-action recommendations | Requires longitudinal data; V2 feature |
| HRIS / LMS integrations (Workday, BambooHR, LinkedIn Learning) | API is ready; integration implementations are post-MVP |
| Multi-tenant admin console | Architecture is org-scoped; multi-tenant console is V2 |
| Self-service organization onboarding wizard | Admin setup with CDF seed is sufficient for MVP |
| Employee score dispute / appeal workflow | Audit log is foundation; formal dispute process is V2 |
| Peer review of evidence (360-style) | Requires separate UX design; V2 |
| Predictive attrition modeling | Requires longitudinal data; V2 |
| Cross-organization benchmarking | Multi-tenant capability and anonymization design required; V2 |
| Goal-setting / OKR management | Different product domain |
| Compensation data integration | Sensitive domain requiring separate design |
| Custom career path recommendations (e.g., "you should become an architect") | V2 intelligence feature |
| Manager effectiveness analytics | V2 feature requiring additional metrics design |
| Offline mode | Not applicable for 3D SaaS product |

---

## 17. Assumptions, Dependencies, Risks

### 17.1 Assumptions

| # | Assumption |
|---|---|
| A1 | Target organizations operate a technology career model (CDF seed is a credible starting point) |
| A2 | Managers will actively engage with evidence review (scoring engine depends on this) |
| A3 | Desktop browser is the primary usage context |
| A4 | Dark mode and professional aesthetic fit the engineering organization buyer persona |
| A5 | Organizations can assign employees to initial tracks and levels during onboarding |
| A6 | The CDF seed configuration is acceptable as a starting point for most target customers |

### 17.2 Dependencies

| # | Dependency |
|---|---|
| D1 | Customer organization's identity provider for OIDC / SSO integration |
| D2 | Initial employee roster import (manual or CSV in MVP) |
| D3 | Manager engagement with evidence approval workflow |
| D4 | Engineering team's implementation of Level-of-Detail and clustering for 3D performance |

### 17.3 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R1 | Manager disengagement with evidence review | Med | High | FR-12.x engagement visibility + stale review dashboard section + Admin engagement reports |
| R2 | 3D performance degrades at scale | Med | High | NFR-1.1 performance target + LOD/clustering/culling mandatory in architecture |
| R3 | Configuration complexity slows initial adoption | Low | Med | CDF seed provides zero-config start; configuration is optional enhancement |
| R4 | Evidence gaming (thin evidence submitted for points) | Med | Med | Manager validation is the gate; mandatory reason fields; audit trail |
| R5 | Enterprise audit and compliance expectations exceed MVP | Low-Med | High | Immutable audit log + score snapshots in MVP scope; exportability built-in |
| R6 | Recalculation job failures leave stale scores | Low | Med | Retry with exponential backoff + alerting + UI pending state |
| R7 | Score inflation due to overly generous requirement weights | Low | Med | Admin visibility into weight changes + configuration audit log |
| R8 | Manager abuse of approval authority | Low | High | Mandatory reason fields + audit trail + optional dual-approval workflow + Admin engagement reports |
| R9 | 3D accessibility limitations | Med | Low-Med | 2D alternative views (Analytics, Dashboard) provide accessible paths; aria-label summaries for context |
| R10 | Bootstrap promotion surge at first activation (large cohort computes as Eligible simultaneously) | High | High | §8.9 Rollout Mode with `CALIBRATION` default + §14.8 resolution + Bootstrap Eligibility Snapshot + HR Calibration Queue (FR-10.5) |
| R11 | System perceived as automatic-promotion engine (erodes managerial authority, feels mechanical) | Med | High | §14.9 resolution: Manager Recommendation + Performance Narrative mandatory for every initiated promotion; Calibration Flag gives HR intervention authority; FR-7.10/7.11 enforcement |
| R12 | Peer pressure / leaderboard effect from map visibility | Med | Med | §8.6 enterprise-safe map anonymization default (`OWN_ONLY` seeds new orgs; peer nodes rendered anonymously to preserve shape without identity); escalation to broader visibility is explicit Admin action |
| R13 | Score ≠ Readiness ≠ Eligibility distinction lost in UI or API consumer code | Med | High | FR-3.6, FR-5.4, FR-7.4 require the distinction to be enforced at every surface; Promotion Eligibility server-side check on all promotion endpoints |

---

## 18. Success Criteria

The MVP is successful when all of the following are demonstrably true:

| # | Criterion |
|---|---|
| SC1 | A manager opens the Career Map, identifies promotion-ready, blocked, and at-risk reports, and clicks into any detail panel — all from the 3D map, without page navigation |
| SC2 | An employee sees their validated Score Progress, layer-by-layer breakdown, next requirements, Readiness %, Promotion Eligibility, ETA, and Confidence — and every data point traces to approved evidence |
| SC3 | Score Progress, Readiness %, and Promotion Eligibility are surfaced as three distinct, labeled outputs in every employee-facing progression view, and promotion actions (UI and API) are gated on Promotion Eligibility — never on Readiness % alone |
| SC4 | A manager approves or rejects evidence with a reason; score recalculates asynchronously and deterministically |
| SC5 | An Admin configures a career track; system recalculates affected employees asynchronously with a logged event |
| SC6 | All score changes, configuration changes, approval decisions, and promotion events are logged immutably and retrievable for audit |
| SC7 | System deploys cleanly to dev / staging / prod with real OIDC authentication, structured logging, and observability instrumentation |
| SC8 | 3D map remains interactive (≥30fps) for an organization with 500+ employee nodes |
| SC9 | All seven PRD-resolved blockers (§14) are implemented per the specified decisions |
| SC10 | A contested promotion decision can be reconstructed from the audit log within 5 minutes |

---

## 19. PRD Decision Summary

### 19.1 Locked Product Decisions

1. FCM is a career progression intelligence platform. Fibonacci is structure, not theme.
2. The 3D Career Map is the primary home screen, navigation, and exploration layer.
3. Score Progress, Readiness %, and Promotion Eligibility are three distinct concepts, displayed distinctly in every employee view. Readiness % is a proportional informational UI metric; Promotion Eligibility is the binary AND-gate (all mandatories APPROVED + min score + min time at level + no blockers) that is the system's sole authoritative check for initiating or approving a promotion.
4. ETA and Confidence are always a paired output.
5. Recalculation is deterministic and asynchronous.
6. All mutating events are immutably logged.
7. CDF seed is the starting default; every configurable dimension is editable by Admin.
8. Role-based access with three roles: Employee, Manager, Admin / HR.
9. OIDC / SSO-ready authentication from MVP.
10. Dark mode UI, desktop-first, cloud-ready deployment from day one.
11. Promotion is a human decision. The system surfaces Eligibility and enforces discipline; a Manager's Recommendation with a Performance Narrative (≥200 chars) plus the configured approval workflow is what commits a promotion. The system never auto-promotes.
12. Enterprise-safe map visibility default: new organizations seed with `OWN_ONLY`, and the map anonymizes non-visible peer nodes server-side to preserve organizational shape without identity.
13. Organizational Rollout Mode defaults to `CALIBRATION` on new organizations. Transition to `ACTIVE` is an Admin action requiring rationale ≥100 characters and captures an immutable Bootstrap Eligibility Snapshot.
14. Admin / HR is an operational persona, not a configuration audience — the Calibration Queue, Calibration Flag, Rollout-Mode control, and Bootstrap Eligibility Snapshot explorer are first-class HR surfaces.

### 19.2 Resolved Blocker Decisions (§14)

| # | Blocker | PRD Resolution |
|---|---|---|
| B1 | Manager engagement / approval nudges | In-app visibility (pending badges, stale review section, engagement report for Admin); no email/Slack in MVP |
| B2 | Default employee visibility | `OWN_ONLY` as MVP default; configurable upward by Admin |
| B3 | 3D visual encoding beyond level color | Color = level; Brightness/Opacity = Readiness %; discrete state highlights (Promotion-Ready = Promotion Eligibility `ELIGIBLE`; At Risk) with additional visual signals |
| B4 | ETA / Confidence edge cases | Explicit history-window rules; "Insufficient data" + Low confidence for <30 days or zero velocity; honesty over false confidence |
| B5 | Manager visibility scope on 3D map | Managers see full org map; only direct reports are clickable with full detail; default "My Team" filter on login |
| B6 | Track change / transfer behavior | Score archived; new track starts at 0; all history preserved in audit; optional manual evidence re-association by Admin |
| B7 | Evidence expiry behavior | Automatic state transition `APPROVED → EXPIRED`; score recalculation; employee notification; audit logged |
| B8 | Bootstrap promotion surge at first activation | Two-state Rollout Mode (`CALIBRATION` default / `ACTIVE`) per §8.9; explicit Admin transition with rationale; immutable Bootstrap Eligibility Snapshot captured at transition; HR Calibration Queue surfaces the eligibility landscape before any promotion is actioned |
| B9 | Promotion-as-checklist failure mode | §14.9 resolution: Eligibility is necessary not sufficient; every initiated promotion requires Manager-authored Performance Narrative (≥200 chars) captured immutably; HR may place any eligibility or pending promotion on Calibration Hold with reason; approval workflow commits the promotion, not the gate computation |

### 19.3 Remaining Blockers for the Architect Step Only

These items are PRD-resolved but require **architectural decisions** by the Architect in the next workflow step. They are not product blockers.

| # | Architect-Level Open Question |
|---|---|
| AO1 | Precise LOD / clustering strategy for 3D rendering at 500+ employees — algorithm selection, threshold tuning, WebGL performance budget |
| AO2 | Background job queue technology selection within the Redis ecosystem (BullMQ, Sidekiq-equivalent, custom) and job scheduling strategy |
| AO3 | Authentication provider and SSO integration layer — specific OIDC library and session management strategy for Next.js frontend |
| AO4 | Database schema details for ScoreSnapshot and AuditEvent retention at scale (partitioning, archival strategy) |
| AO5 | Evidence file access control — pre-signed URL lifetime, caching strategy, CDN interaction |
| AO6 | Multi-tenancy readiness posture — org_id scoping pattern at the database, API, and domain layers (decision: row-level security, schema-per-tenant, or column-based isolation) |
| AO7 | Real-time update strategy for 3D map and detail panel when async jobs complete (polling, WebSocket, Server-Sent Events) |

These are the architect's decisions to resolve in the next workflow step. The product requirements in this PRD are complete.

---

*Product Requirements Document — Fibonacci Career Map (FCM) — Version 1.0 Draft — 2026-04-18*
*Status: Ready for Architect Workflow (`/bmad-create-architecture`)*
