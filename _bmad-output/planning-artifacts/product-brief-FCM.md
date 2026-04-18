---
title: "Product Brief: Fibonacci Career Map (FCM)"
status: "draft"
created: "2026-04-18"
updated: "2026-04-18"
inputs:
  - "docs/MVP/mvp_documentation/MVP of FCM APP.pdf"
  - "docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_45_09 AM.png"
  - "docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_46_35 AM.png"
  - "_bmad-output/brainstorming/brainstorming-session-2026-04-18-1500.md"
---

# Product Brief: Fibonacci Career Map (FCM)

---

## Executive Summary

Career progression in technology organizations is broken by opacity. Most engineers and engineering managers operate without a shared, objective picture of where individuals stand, what they still need to demonstrate, and when they might realistically be ready for the next level. Performance reviews become subjective negotiations rather than evidence conversations. Managers make promotion decisions from memory and instinct. Employees feel uncertain about their trajectory and leave for organizations that seem to offer clearer paths.

**Fibonacci Career Map (FCM)** is a career progression intelligence platform for technology organizations. It gives employees a precise, evidence-based view of where they stand today and when they can realistically move forward. It gives managers a team-level picture of readiness, risk, and trajectory — navigable through a striking interactive 3D career map that makes the entire organization's progression state legible at a glance. And it gives HR and Admin the configurability and auditability to enforce fair, defensible processes at scale.

Fibonacci is not the theme of this product — it is the structure. The Fibonacci sequence organizes three things only: the visual spiral that maps career levels spatially, the weighting scale that prioritizes higher-impact evidence over routine activity, and the velocity rhythm that powers progression forecasting. Everything else — the career tracks, levels, requirements, promotion rules, and approval workflows — is configured by the organization.

For managers and HR, FCM also functions as an early-warning retention intelligence system: employees with stalled progression velocity and low forecast confidence are identifiable before they reach the point of disengagement. FCM ships ready to use on day one, seeded with defaults derived from the CDF Technology Levels model. Organizations can start immediately and refine over time. The product is built for enterprise production from the first line of code: real authentication, real audit trails, real environments, and a scoring engine that is deterministic, asynchronous, and explainable.

---

## The Problem

Engineering organizations at growth scale share a predictable set of career-management failures:

**For employees:**
- "I don't know exactly what I need to do to get promoted." Career frameworks exist on wikis but are not connected to any individual's actual activity or evidence. Employees cannot see their current position, their remaining gaps, or a realistic timeline.
- "My promotion depends on my manager's opinion of me." Without validated evidence and objective scoring, promotion decisions reduce to manager advocacy. This creates inconsistency, favoritism risk, and employee distrust.
- "I had no idea I was in trouble until my review." Feedback arrives too late, in bulk, with no forward signal. Employees who are stalling don't know it until damage is done.

**For managers:**
- "I have to hold the progression state of 10+ people in my head." Managers track who is close to promotion, who is blocked, and who is at retention risk through personal notes, memory, and intuition. This fails at scale.
- "I can't defend my promotion decisions to HR without scrambling for evidence." Without a structured evidence trail, promotion conversations become politically charged.
- "I can't see across my team at once." Managers see individual progression in 1:1s, but have no aggregate team view — no sense of bench strength, distribution risk, or which track is bottlenecked.

**For HR and Admin:**
- "We have a career framework, but it's not actually enforced." Policies exist but the system of record for progression is a spreadsheet or a wiki. There is no way to audit whether promotions actually followed the defined criteria.
- "Every org has its own ladder." Standard HR tools impose fixed frameworks. Engineering organizations need the flexibility to define their own tracks, rename layers, set custom weights, and evolve requirements over time.

The cost of the status quo is high: slow progression cycles, talent attrition driven by perceived unfairness, inconsistent promotion quality, and HR exposure when contested decisions lack documentation.

---

## The Solution

FCM is experienced primarily through an **interactive 3D career map** — a Fibonacci-spiral visualization rendered in 3D, dark-mode by default, that represents the organization's entire career structure spatially. Each career track occupies a segment of the spiral. Each level occupies a band within that segment. Every employee is a node positioned at their current track and level.

The 3D map is not a dashboard widget. It is the product's primary home screen and navigation model. Users rotate, zoom, and navigate the spiral to explore the organization's progression landscape. They filter by track and level to focus. They click on individual nodes to open a contextual detail panel — without ever leaving the 3D environment. This panel reveals the selected employee's validated score, layer-by-layer breakdown, next requirements, readiness percentage, ETA to next level, and forecast confidence.

From this single interactive surface, all core workflows begin. Managers explore team readiness. Employees locate themselves on the map and understand their path. HR views organizational distribution and bench strength. The system makes the invisible visible: who is close to promotion, who is stalled, where the pipeline is thin, and what the next 6 months of career movement looks like across the organization.

Behind the 3D map, FCM runs a structured evidence and scoring engine. Employees submit evidence against configurable requirements — courses, certifications, project deliveries, architectural decisions, mentoring records. Managers validate evidence with a reason. Validated evidence generates weighted points. Points accumulate against a level band. The system calculates two distinct outputs: a **Score** (total validated points) and a **Readiness percentage** (which also requires completion of all mandatory requirements). It also calculates an **ETA** — time to next level based on recent validated progression velocity — paired always with an explicit **Confidence indicator**.

Administrators configure the system through a dedicated settings module: career tracks, level names, score bands, layers, requirements, weights, promotion rules, and approval workflows. The product ships seeded with defaults derived from the CDF Technology Levels model, covering Software Engineering, Architecture, and Management tracks. These defaults are fully editable — the CDF structure is a starting point, not a constraint.

Every score change, configuration change, approval decision, and promotion event is immutably logged with actor identity, timestamp, and reason. Auditability and explainability are not features added at the end — they are woven into every data operation from the start.

---

## What Makes This Different

**1. The 3D map is the navigation model, not a feature.**
Most career intelligence tools present data in tables, charts, or static ladder diagrams. FCM presents the organization's entire career landscape as an explorable 3D spatial environment. The spatial encoding is instantly legible — small bands are junior, large bands are senior, node density shows distribution — and the interactivity makes exploration feel natural. This is the demo moment and the daily driver.

**2. Score and Readiness are explicitly separated.**
Tools that calculate a single "progress percentage" hide the difference between accumulated points and actual promotion eligibility. FCM distinguishes Score (evidence points accumulated) from Readiness (score progress plus all mandatory requirements completed). An employee with 90% of the score band but an unmet mandatory requirement has high Score and low Readiness. This distinction drives the right conversations and the right managerial interventions.

**3. ETA is paired with Confidence — not just a number.**
Showing "8 months" alone is misleading. FCM pairs every ETA with a confidence level (High / Medium / Low) derived from progression velocity consistency and mandatory completion rate. A low-confidence ETA is a manager signal, not just an output. This is the difference between a reporting tool and an intelligence tool.

**4. Organization-defined rules, not a fixed framework.**
FCM does not impose a career model. It ships with sensible CDF-derived defaults that organizations can use immediately, but every dimension — tracks, levels, layers, requirements, weights, promotion rules, approval workflows, visibility — is fully configurable. This is what makes the product fit real engineering organizations rather than only the organizations that happen to match the default model.

**5. Evidence-based and auditable by design.**
Every progression signal in FCM is tied to validated evidence. Every validation decision is recorded with a reason. Every score change is traceable. Organizations can reconstruct any promotion decision from the audit record. This is a first-class enterprise requirement, not an afterthought.

---

## Who This Serves

### Employee (Individual Contributor)

Software engineers, architects, data engineers, and other technical professionals who want to understand their current standing, track their progress toward the next level, and engage in structured development conversations with their manager.

**What they need from FCM:**
- See their current position on the career map
- Understand their validated score and layer-level breakdown
- Know exactly which requirements are complete, in progress, or missing
- Submit evidence against open requirements
- See their readiness percentage and ETA with confidence
- Have a defensible record of their progression journey

**What success looks like:** An employee can walk into any review conversation with a shared, objective view of where they stand. Surprises are eliminated.

---

### Manager

Engineering managers, team leads, and technical directors responsible for the progression and development of engineers on their team.

**What they need from FCM:**
- See their team distributed across the 3D career map
- Identify who is promotion-ready, who is blocked, and who is at retention risk
- Review and validate evidence from their reports with a reason trail
- Initiate and document promotion recommendations
- Use the system as the factual basis for development 1:1s

**What success looks like:** A manager can prepare for any development conversation in under 2 minutes using the 3D map and the employee detail panel. Promotion decisions are defensible.

---

### Admin / HR

HR business partners, people operations, and organization-level administrators responsible for configuring the career framework, enforcing standards, and ensuring audit compliance.

**What they need from FCM:**
- Configure and maintain career tracks, levels, layers, requirements, weights, and rules
- Define promotion workflow (single sign-off, dual approval, HR review gate)
- View organization-level career health and distribution
- Access audit logs and progression history for any individual or event
- Export data for workforce planning and HR system integration readiness

**What success looks like:** HR can configure the system once from the CDF seed, maintain it with low overhead, and produce a complete audit record for any challenged promotion decision.

---

## 3D-First Experience Model

The 3D interactive career map is FCM's primary home screen and navigation layer. It is not a visualization feature — it is the surface from which all exploration, investigation, and operational context begins.

### The 3D Canvas

The spiral structure maps career levels spatially: the innermost bands represent L1 (entry-level), and the structure expands outward and upward toward L5 and above. Each career track occupies a distinct segment of the spiral. Each employee is represented as a colored node positioned at their current track and level — color-coded by level (confirmed in reference images: L1 blue, L2 teal, L3 purple, L4 tan, L5 silver).

**Interactive capabilities (confirmed from reference artifacts):**
- Rotate freely via drag
- Zoom in and out
- Click on individual nodes (employees) to open a detail panel
- Filter visible nodes by track and level via left-side control panel
- "Selectable points" mode for precise node targeting

The left panel provides filter controls. The top navigation bar provides access to Dashboard, Career Map, Analytics, and Settings views.

### The Employee Detail Panel

When a node is clicked in the 3D map, a contextual panel slides in from the right side — without the user leaving the 3D environment. The map remains active and rotatable in the background.

The panel displays (confirmed from reference image 2, showing "Angel S., L3 Senior"):
- Employee name and current level
- Layer-by-layer scores: Capability, Delivery, Influence (shown as progress bars with percentages)
- Next Requirements list
- Next-Level Readiness percentage
- Forecast window (e.g., 3 months)
- ETA Estimate (e.g., 08 months)

From this panel, managers can take action on pending evidence without leaving the career map context.

### When Users Leave the 3D Canvas

Deeper operational modes are accessed through the top navigation bar and represent intentional mode changes, not the primary interaction pattern:

- **Dashboard:** Summary metrics, team-level KPIs, aggregate readiness trends
- **Analytics:** Detailed charts, distribution tables, bottleneck analysis, bench strength views
- **Settings:** Career track configuration, requirement management, approval workflow setup, org configuration

These views exist and are important — but they are accessed deliberately. The 3D map is always the home users return to.

---

## Core Workflows

### 1. Organization Onboarding to the 3D Map
Admin activates FCM with CDF-seeded defaults → reviews and customizes tracks/levels/layers/requirements if needed → imports or creates employee profiles → assigns employees to their current track and level → employees appear as nodes on the 3D career map.

### 2. Employee Evidence Submission
Employee selects an open requirement from their detail view → submits evidence (file, URL, or structured text description) → manager receives notification → manager reviews and approves or rejects with a mandatory reason field → upon approval, the system recalculates the employee's score asynchronously → ETA and confidence are updated → employee is notified of the outcome.

### 3. Manager Team Review via 3D Map
Manager opens Career Map → sees their team distributed across the spiral → uses filters to focus on specific tracks or levels → identifies nodes with visual readiness signals → clicks a team member's node → right panel opens with full progression summary → manager reviews pending evidence, score, ETA, and risks → can approve or reject evidence inline → closes panel and continues exploring other nodes.

### 4. Promotion Initiation
System detects employee meets promotion criteria (score in target band + all mandatory requirements met + optional time-at-level rule satisfied + no active blockers) → manager sees promotion-ready signal in the detail panel → manager initiates a formal promotion request → HR reviews and counter-signs if configured → promotion is approved → employee level is updated → node repositions on 3D map → promotion event is written to the immutable audit log.

### 5. Career Track Configuration
Admin navigates to Settings → Career Tracks → selects a track to edit → modifies levels, layer names, requirements, weights, mandatory flags, and promotion rules → saves changes → system schedules an asynchronous recalculation event for all employees on the affected track → recalculation runs in the background → all affected employee scores are updated with a timestamped change record.

---

## Configurable Admin Model

FCM is an organization-configured system. The CDF seed provides a working starting point; the configuration layer makes the product fit any engineering organization's actual career model.

### Configurable Dimensions

| Dimension | What is Configurable |
|---|---|
| Career Tracks | Names, active/inactive status, which levels are included |
| Levels | Names (L1–L5, Junior–Principal, or custom), score band boundaries |
| Layers | Names (default: Capability, Delivery, Influence), add or rename |
| Requirements | Type (course, certification, project, delivery, mentoring, etc.), weight (Fibonacci or numeric), mandatory flag, evidence type required, expiry period |
| Promotion Rules | Minimum score, mandatory requirement gate, manager approval required, HR counter-sign option, minimum time at level, active blocker check |
| Visibility Rules | What information employees can see about peers (score, readiness, ETA) |
| Approval Workflow | Single manager sign-off, dual manager sign-off, HR review gate |

### What Is Not Configurable

The scoring algorithm formula is fixed: validated evidence generates weighted points; points accumulate toward a level band; readiness requires both score progress and mandatory completion; ETA derives from velocity over the last 90 days. The Fibonacci spiral visual structure is the product identity and is not overridable. Audit log behavior is always on and always immutable — there is no option to disable logging.

---

## Scoring, Readiness, ETA, and Confidence

### Score

Score is the total number of validated evidence points an employee has accumulated at their current level. Each validated requirement contributes its configured weight (Fibonacci-scale by default: 1, 2, 3, 5, 8, 13, 21...). Points are generated by evidence approval, not by self-declaration.

Example weights from the MVP specification:
- Completed course: 3 points
- Internal certification: 5 points
- Led a medium-sized project: 8 points
- Drove an architectural decision: 13 points

### Level Bands

Each level is configured with a target score band. The default CDF-seeded bands:

| Level | Score Band |
|---|---|
| L1 | 0–50 |
| L2 | 50–100 |
| L3 | 100–150 |
| L4 | 150–200 |
| L5 | 200–250 |

### Readiness (distinct from Score)

**Readiness is not the same as Score.** Readiness is the percentage reflecting both score progress within the current level band AND the completion status of all mandatory requirements for that level.

An employee with 90% of the score band but one unmet mandatory requirement has a Readiness of 0% — they are not eligible for promotion regardless of points accumulated. This distinction is displayed explicitly in every employee view and drives the right conversations between employees and managers.

### ETA and Confidence

**ETA** is calculated as: `remaining validated points / recent validated progression velocity (90-day rolling average)`.

ETA is always displayed paired with an explicit **Confidence indicator**:

| Confidence | Conditions |
|---|---|
| High | Consistent velocity, few mandatory requirements remaining |
| Medium | Moderate consistency, some mandatory gaps |
| Low | Low or declining velocity, significant mandatory gaps, or insufficient history |

ETA without confidence is misleading. A low-confidence ETA is a managerial intervention signal, not just a projection.

### Deterministic Recalculation

Score and ETA recalculate automatically when new evidence is approved or when track configuration changes. Recalculation is asynchronous (runs in background processing) but deterministic: given the same evidence state and configuration, the system always produces the same score and ETA. Recalculation events are logged with timestamps.

---

## Seeded Default Setup (CDF)

FCM ships with a pre-loaded configuration derived from the CDF Technology Levels model. Organizations can use it immediately without any setup and modify it freely over time. The seed is a starting point, not a constraint.

### Default Tracks

**Software Engineering (L1–L5)**
- L1 — Software Engineer I: score band 0–50
- L2 — Software Engineer II: score band 50–100
- L3 — Software Engineer III: score band 100–150
- L4 — Software Engineer IV: score band 150–200
- L5 — Software Engineer V: score band 200–250

**Architecture (L4–L5)**
- L4 — Software Architect: score band 150–200
- L5 — Enterprise Architect: score band 200–250

**Management (L3–L5)**
- L3 — Software Engineering Manager: score band 100–150
- L4 — Software Engineering Director: score band 150–200
- L5 — Software Development Executive: score band 200–250

### Default Layer Model

Each level ships with three evaluation layers:
- **Capability** — technical knowledge, courses, certifications, technology breadth
- **Delivery** — real project execution, critical deliveries, cross-team impact
- **Influence** — autonomy, mentoring activity, organizational influence

### Default Requirement Logic

Default requirements are seeded per layer to provide usable starting examples. All defaults are editable by the organization's Admin.

---

## Functional Requirements (MVP Level)

### 3D Career Map
- Render the Fibonacci spiral career map in interactive 3D
- Support rotate (drag), zoom, and node selection
- Display employees as color-coded nodes by level
- Support filter controls by career track and level
- Display employee count per track/level segment
- Support click-to-detail panel interaction without leaving the 3D canvas

### Employee Detail Panel
- Display employee name, track, and current level
- Display layer-by-layer score breakdown (Capability, Delivery, Influence)
- Display validated score, next requirements, readiness percentage, ETA, and confidence
- Display completion status for mandatory requirements
- Allow manager to approve or reject pending evidence inline

### Evidence Management
- Allow employees to submit evidence against open requirements (file, URL, or text)
- Allow managers to approve or reject evidence with a mandatory reason field
- Store evidence files in S3-compatible object storage
- Trigger asynchronous score and ETA recalculation on approval

### Scoring Engine
- Calculate score as sum of validated weighted evidence points at current level
- Calculate readiness as score-band progress gated by mandatory requirement completion
- Calculate ETA as remaining points divided by 90-day validated velocity
- Assign confidence level (High / Medium / Low) based on velocity consistency and mandatory gaps
- Ensure recalculation is deterministic: same inputs always produce same outputs
- Run recalculation asynchronously; display recalculation-pending status in UI

### Admin Configuration
- Create, edit, and deactivate career tracks
- Configure levels with custom names and score bands
- Configure layers with custom names per level
- Configure requirements with type, weight, mandatory flag, evidence type, and expiry
- Configure promotion rules per level
- Configure visibility rules per organization
- Configure approval workflow (single sign-off, dual sign-off, HR gate)

### Promotion Workflow
- Detect and surface promotion-ready signal when all promotion criteria are met
- Allow manager to initiate a formal promotion request
- Support optional HR counter-sign step
- Record promotion event in audit log upon approval
- Update employee level and reposition node on 3D map after promotion

### Audit Log
- Log all score change events with: actor, timestamp, reason, before/after values
- Log all configuration changes with: actor, timestamp, field changed, before/after values
- Log all evidence approval and rejection decisions with: actor, timestamp, reason
- Log all promotion events with: actor, timestamp, decision, final values
- Audit log is immutable and always active

### Analytics Dashboard
- Display team-level distribution across tracks and levels
- Surface promotion-ready employees
- Surface stalled or at-risk employees
- Display readiness and velocity trends over time

### Authentication and Authorization
- Support OIDC / SSO authentication (production-ready integration)
- Enforce role-based access: Employee, Manager, Admin / HR
- Employees see their own data and organization-visible information per visibility rules
- Managers see their direct reports and team-level views
- Admin / HR sees all employees and all configuration

---

## Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Determinism** | Score and ETA recalculation must be deterministic: identical inputs always produce identical outputs |
| **Auditability** | All data-mutating events are logged immutably with actor, timestamp, and reason |
| **Explainability** | Every score and readiness value must be traceable to its source evidence and weights |
| **Performance** | 3D map must remain interactive and responsive for organizations with 500+ employees |
| **Security** | Role-based access strictly enforced; no cross-tenant data leakage; evidence files access-controlled |
| **Scalability** | Background processing (scoring, recalculation, analytics) must scale independently of API surface |
| **Maintainability** | Backend domain modules are independently deployable and testable |
| **Modularity** | Career track configuration is org-scoped and does not affect other organizations |
| **Observability** | Structured logs, service metrics, distributed tracing, and alerting on processing failures |
| **Integration Readiness** | API-first design; all core data accessible via authenticated API for future HR/LMS integration |
| **Dark Mode** | Default UI theme is dark mode; professional and readable in engineering contexts |
| **Cloud Posture** | Containerized from day one; managed services preferred; dev/staging/prod separation required |

---

## Technical Planning Constraints

These reflect the intended product direction established in source materials. They are planning constraints for architecture design, not locked decisions.

- **Frontend:** Next.js / React; dark mode by default; responsive desktop-first
- **3D Layer:** Three.js or React Three Fiber; interactive spiral rendering with LOD support for large employee sets
- **Backend:** Modular domain-oriented API; NestJS strongly preferred for domain structure and enterprise growth pattern
- **System of Record:** PostgreSQL; relational model for tracks, levels, evidence, snapshots, and audit events
- **Background Processing:** Redis-backed job queue for asynchronous score recalculation, ETA updates, snapshot generation, and analytics aggregation
- **Evidence Storage:** S3-compatible object storage for all evidence file attachments
- **Authentication:** OIDC / SSO-ready from day one; role assignment managed within FCM
- **Environments:** dev / staging / prod with CI/CD pipeline; environment parity required
- **Deployment:** Containerized; frontend on CDN/edge; API and workers in containers; managed databases and cache

---

## Core Data Entities (Product Level)

| Entity | Description |
|---|---|
| Organization | Top-level tenant; owns all configuration and employee data |
| CareerTrack | A named progression path (e.g., Software Engineering); contains levels |
| Level | A named stage within a track (e.g., L3); has a score band and layers |
| Layer | An evaluation dimension within a level (e.g., Capability); contains requirements |
| Requirement | A specific evidence expectation; has type, weight, mandatory flag, and expiry |
| Employee | A person assigned to a track and level; accumulates evidence and score |
| Evidence | A submission by an employee against a requirement; validated by a manager |
| ScoreSnapshot | A timestamped record of an employee's score and readiness state |
| Forecast | A calculated ETA and confidence value tied to a score snapshot |
| ApprovalRecord | A manager's decision on evidence, including reason and timestamp |
| AuditEvent | An immutable log entry for any system mutation |
| PromotionRecord | A formal promotion event including decision, actor, and previous/new level |

---

## MVP Scope

### In Scope

- Interactive 3D career map (primary navigation surface)
- Employee detail panel (accessible from 3D click; no page navigation required)
- Evidence submission by employees
- Evidence review and approval by managers (with reason)
- Weighted scoring engine (asynchronous, deterministic)
- Score vs. Readiness distinction enforced in all relevant views
- ETA forecast with explicit Confidence indicator
- Admin configuration of tracks, levels, layers, requirements, weights, and promotion rules
- Approval workflow configuration (single, dual, HR gate)
- Visibility rules configuration
- CDF-seeded defaults (Software Engineering L1–L5, Architecture L4–L5, Management L3–L5)
- Role-based access control (Employee, Manager, Admin / HR)
- Immutable audit log for all score, config, approval, and promotion events
- Analytics dashboard (team distribution, readiness, stalled/ready signals)
- OIDC / SSO-ready authentication
- Dark mode UI, professional design
- Cloud-ready deployment (dev / staging / prod)
- Structured logs, metrics, and observability baseline

### Explicitly Out of Scope (MVP)

| Item | Rationale |
|---|---|
| Mobile application | 3D interaction model is desktop-native; mobile is a V2 concern |
| Employee score dispute or appeal workflow | Requires dedicated process design; not in V1 |
| AI-generated career recommendations | Valuable V2 feature; requires longitudinal data to be meaningful |
| HR / LMS system integrations | Architecture must be API-first to enable these; implementations are post-MVP |
| Multi-organization tenant management | Architecture must be org-scoped; multi-tenant console is post-MVP |
| Public-facing career ladders | Different product surface; not in MVP |
| Email or Slack notification channels | In-app notification state is sufficient for MVP |
| Peer review of evidence (360-style) | Requires separate UX and review design; post-MVP |
| Self-service organization onboarding wizard | Admin setup with CDF seed is sufficient; wizard is a growth feature |
| Score dispute or contested promotion mediation | Audit log provides the foundation; formal dispute workflow is V2 |

---

## Assumptions, Constraints, Dependencies, and Risks

### Assumptions

1. The target organization operates a technology career model with distinct engineering tracks (the CDF seed is a credible starting point for most customers).
2. Managers will engage actively with evidence review. If managers do not approve evidence, the scoring engine cannot function — this is a product adoption dependency, not a technical one.
3. The 3D visualization is the primary product differentiator and the "aha moment" in customer evaluations. Its quality directly affects adoption.
4. Organizations are willing to invest in initial track configuration or to accept the CDF defaults as a starting point.
5. Dark mode and professional aesthetic are appropriate signals for the engineering organization buyer persona.
6. Desktop browser is the primary usage context; mobile is secondary and out of scope.

### Constraints

1. The Fibonacci spiral visual structure is the product's identity. It is not a configurable theme.
2. Audit logging is always on and always immutable. There is no org-level toggle to disable it.
3. The scoring formula is fixed (evidence points → score band → readiness gate). Orgs configure the weights and bands, not the algorithm.
4. The product is single-tenant per deployment in MVP. Multi-tenancy is an architectural readiness requirement for V2.

### Dependencies

1. Manager engagement with evidence approval is required for the scoring engine to produce meaningful outputs.
2. Initial employee data import (track/level assignment) must be completed by Admin for the 3D map to reflect real organizational state.
3. 3D rendering performance at scale depends on Level-of-Detail and cluster rendering implementation quality — this is an engineering execution dependency.
4. OIDC / SSO integration depends on the customer organization's identity provider.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Manager captures evidence approval as a gatekeeping tool | High — scoring becomes unfair | Mandatory reason field; HR visibility into all approvals; optional dual-approval workflow |
| Configuration complexity slows down initial adoption | Medium — time-to-value delayed | CDF seed means zero-config out of the box; config is enhancement, not prerequisite |
| 3D performance degrades at 500+ employees | High — core UX broken | Level-of-detail rendering, cluster aggregation, visible-segment optimization required in engineering implementation |
| CDF seed structure does not match customer's existing framework | Medium — onboarding friction | Seed is fully editable; frame as starting template in onboarding communication |
| Evidence quality gaming (thin evidence submitted to accumulate points) | Medium — score integrity risk | Manager validation is the gate; evidence with attached files or verifiable links is more defensible |
| Enterprise audit and compliance expectations exceed MVP capabilities | Low-Medium — deal-blocker risk | Immutable audit log and score snapshots are in MVP scope; export and advanced compliance tooling are V2 |
| Async recalculation job failure leaves employees with stale scores | Medium — trust issue | Jobs must be idempotent, retryable, and surface processing status in the UI |

---

## Success Criteria

The MVP is successful when all of the following conditions are verifiable:

1. A manager can open the 3D career map, identify which of their reports are promotion-ready, blocked, or at risk, and click into any individual's detail panel — all within the 3D map context, without navigating to a separate page.
2. An employee can see their current validated score, layer-by-layer breakdown, next requirements, readiness percentage, ETA, and confidence level — and every data point is traceable to a specific approved evidence item.
3. The distinction between Score and Readiness is explicit and visible in every employee-facing view. An employee with unmet mandatory requirements sees Readiness as distinct from Score.
4. A manager can approve or reject evidence with a reason, and the score recalculates asynchronously and deterministically following approval.
5. An Admin can configure or modify a career track, levels, layers, requirements, and weights — and the system recalculates all affected employee scores asynchronously with a logged event.
6. Every score change, configuration change, approval decision, and promotion event is logged immutably and can be retrieved for audit purposes.
7. The system deploys cleanly to dev, staging, and production environments with real OIDC authentication, structured logging, and observability instrumentation active.
8. The 3D map remains interactive and responsive for an organization with at least 200 employee nodes rendered.

---

## Product Vision (2–3 Year Horizon)

If FCM succeeds in the MVP, it becomes the default system of record for engineering career progression in technology organizations — the place where managers have development conversations, where employees track their journeys, and where HR certifies promotion decisions.

In the 12–24 month horizon:
- Multi-organization support (SaaS platform)
- AI-assisted next-action recommendations based on progression history and gap analysis
- Integration with LMS platforms (LinkedIn Learning, Coursera, Pluralsight) to auto-link completed courses to open requirements
- Integration with HRIS platforms (Workday, BambooHR) for org sync and compensation alignment
- Mobile read-only views for employees to check their status
- Self-service onboarding for new organizations

In the 24–36 month horizon:
- Predictive attrition modeling from stall patterns and low-confidence ETAs
- Cross-organization benchmarking for anonymized level distribution and progression velocity
- Manager effectiveness analytics (evidence approval rate, review quality, team development outcomes)
- Career path recommendation engine suggesting track transitions based on evidence profile

---

## Key Decisions Summary and PRD Blockers

### Locked Decisions (from source artifacts, non-negotiable)

1. **Product identity:** FCM is a career progression intelligence platform. Not a visualization app. Not a Fibonacci novelty.
2. **3D map is the primary home screen and navigation surface.** Employee exploration happens via contextual panels within the 3D environment. Full-page views (Analytics, Settings) are deliberate secondary modes.
3. **Score and Readiness are distinct, separately displayed metrics.** This is the most important business rule.
4. **ETA and Confidence are always paired outputs.** ETA without confidence is not acceptable.
5. **Auditability is non-negotiable.** All mutating events are logged immutably.
6. **CDF seed is an editable default, not the product model.** The product is configurable; CDF gives organizations a zero-friction start.
7. **Recalculation is deterministic and asynchronous.** Same inputs, same outputs. Background processing, not blocking.

### Ambiguities Resolved Conservatively

1. **Visibility rules default:** Employees see their own data only by default. Peer visibility is configurable by Admin. Conservative for enterprise adoption.
2. **Retroactive evidence approvals:** Allowed but flagged in audit log with date discrepancy noted. Conservative for auditability.
3. **Multi-tenancy:** Single-org per deployment in MVP. Architecture must be org-scoped to enable future multi-tenancy without a rewrite.
4. **Confidence thresholds:** High / Medium / Low is sufficient for MVP. Numeric confidence scoring (e.g., percentage) is a V2 precision enhancement.

### True Blockers for the PRD Step

1. **Manager engagement model:** The scoring engine depends entirely on manager evidence approval. If the org's managers are passive reviewers, the system will not produce meaningful scores. The PRD should describe the notification and workflow nudge mechanism that keeps managers engaged. *This is a product design gap that needs resolution before the PRD is complete.*

2. **Employee visibility rules — default specification:** The brief defers this to org configuration, but the PRD will need to specify the precise default (what employees see about peers at launch for a new org). This needs a explicit default ruling in the PRD.

3. **Heatmap / visual encoding on 3D nodes:** The reference images show color-coded levels but the brief does not specify whether readiness is also visually encoded (e.g., node brightness or opacity reflects readiness %). The PRD needs to specify this explicitly. This affects the 3D rendering spec.

4. **Score band and velocity calculation window:** The 90-day velocity window is specified in source materials. The PRD must confirm this and specify edge cases: what ETA is shown for a new employee with no velocity history? What is the minimum data window before a confidence level of "High" can be assigned?

5. **Manager visibility scope on the 3D map:** The brief states managers see "direct reports and team-level views" but the 3D map is an organization-wide surface. The PRD must specify whether managers see only their reports as selectable nodes, all nodes (but only their reports' panels), or some other scoping. This affects both the 3D rendering spec and the RBAC implementation.

6. **Track change / track transfer behavior:** When an employee moves from Software Engineering to Management (a real and common career event), what happens to their accumulated score? Does it reset? Is it archived? Can it transfer partially? The PRD needs an explicit ruling on this. Conservative default: score is archived; new track starts fresh with full history preserved for audit.

7. **Evidence expiry behavior:** Requirements can be configured with an expiry period. The brief does not specify what the system does when evidence expires — does the score decrement? Does the requirement reopen? Does the employee receive a notification? This is a product behavior specification needed for the PRD.

---

*Product Brief: Fibonacci Career Map (FCM) — Version 1.0 Draft — 2026-04-18*
*Ready for PRD workflow. Resolve the 4 blockers above before beginning PRD.*
