---
stepsCompleted: [1, 2]
inputDocuments: ['docs/MVP/mvp_documentation/MVP of FCM APP.pdf', 'docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_45_09 AM.png', 'docs/MVP/images/ChatGPT Image Apr 18, 2026, 10_46_35 AM.png']
session_topic: 'Fibonacci Career Map (FCM) — Product Definition Brainstorming'
session_goals: 'Clarify product framing, user value, roles, workflows, scoring/ETA logic, 3D-first interaction model, admin config model, MVP boundaries, and key risks'
selected_approach: 'AI-Recommended Techniques'
techniques_used: ['Structured Domain Exploration', 'Devil\'s Advocate', 'Workflow Mapping', 'Risk Surface Analysis']
ideas_generated: ['Product framing as intelligence platform', '3D-first panel interaction model', 'Score vs Readiness separation', 'Async deterministic recalculation', 'ETA + Confidence paired display', 'CDF as editable seed not constraint', 'Dual-approval option for promotions', 'Immutable audit log as enterprise requirement', 'LOD rendering for 3D performance']
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Emilio
**Date:** 2026-04-18

## Session Overview

**Topic:** Fibonacci Career Map (FCM) — Product Definition Brainstorming
**Goals:** Clarify product framing, user value, roles, core workflows, scoring and ETA logic, 3D-first interaction model, configurable admin model, MVP scope boundaries, and key risks/assumptions

### Artifact Context

Source artifacts scanned and synthesized:
- MVP PDF (17 pages — full product logic, scoring model, 3D spec, architecture)
- Reference image 1: Pure 3D spiral UI (L1–L5 color coded, drag-to-rotate, selectable points)
- Reference image 2: Full application UI (navigation bar, filters panel, 3D spiral, employee detail panel)

### Session Setup

Autonomous context provided by user. All artifacts pre-read. Full product intent is clear.
Proceeding with AI-Recommended facilitation focused on production-minded product definition.

---

## Domain 1 — Product Framing

- FCM is a **career progression intelligence platform**, not a visualization tool
- Fibonacci is used in exactly 3 ways: visual structure (spiral), progression weighting (Fibonacci-scale requirement weights), forecasting rhythm (velocity-based ETA)
- The differentiator: org-configured rules + CDF-seeded defaults + evidence-based scoring + ETA with confidence — this combination does not exist together in current market tools
- Framing risk: describing as "Fibonacci app" or "3D visualization" collapses the product vision
- The 3D spiral is immediately readable: small bands = junior, large bands = senior — spatial encoding works at a glance
- The 3D map is the "aha moment" in every demo — it must be excellent, not downplayed

## Domain 2 — User Value by Role

**Employee:** Wants clarity and fairness — know exactly where they stand (score, not opinion), what's blocking them (requirements, not vibes), when they'll realistically be promoted (ETA not "maybe next year")

**Manager:** Wants evidence-based leadership — promotion decisions from data not gut-feel, pre-computed team brief before every 1:1, early retention-risk signals

**Admin/HR:** Wants system of record — configure once, enforce consistently, audit any contested decision, export for workforce planning

Key risk: manager controls evidence approval AND requirement weights (conflict of interest) → dual-approval workflow option and mandatory reason field mitigate

## Domain 3 — Core Workflows

1. **Onboarding to map:** Admin seeds org → assigns employee to track/level → employee sees 3D position → employee sees requirements → employee submits evidence
2. **Evidence validation:** Employee submits → manager approves/rejects with reason → async score recalculation → ETA updated → employee notified
3. **Manager review from 3D:** Opens Career Map → sees team distribution on spiral → clicks team member node → right panel slides open with score/ETA/risks → can approve evidence inline
4. **Promotion initiation:** System detects criteria met → manager initiates → HR reviews optionally → approved → level updated → new 3D position
5. **Admin track config:** Settings → Career Tracks → edit levels/layers/requirements/weights → save → async recalculation of all affected scores (audited event)

## Domain 4 — 3D-First Interaction Model

- The 3D spiral is always the primary canvas — all detail views are **panels over the map, not separate pages**
- The user never navigates away from the 3D experience when exploring employees
- Click on node → right panel slides in with: name, level, Capability/Delivery/Influence scores, Next Requirements, Readiness %, ETA
- Left panel: filters (track, level, number toggles)
- Navigation bar: Dashboard | Career Map | Analytics | Settings → these are full-page views for deep analysis
- 3D is the "home" — 2D analytical views are accessed intentionally via nav, not accidentally

Design rule: **The 3D map is always active. All exploration happens on it. Full-page views are deliberate mode changes.**

Performance note: LOD rendering, cluster aggregation at zoom-out, and visible-segment-only rendering are required for 500+ employees — known engineering challenge, not product blocker.

## Domain 5 — Configurable Admin Model

Configurable dimensions:
- Career tracks (names, active levels)
- Levels (names, score bands)
- Layers (names — Capability/Delivery/Influence default, but fully renameable)
- Requirements (type, Fibonacci/numeric weight, mandatory flag, expiry, evidence type)
- Promotion rules (min score, mandatory completion, manager sign-off, HR counter-sign, min time at level, blockers)
- Visibility rules (what employees can see about each other)
- Approval workflow (single, dual, HR gate)

NOT configurable: scoring algorithm formula, Fibonacci spiral visual, audit log behavior (always on, always immutable)

CDF seed = starting template, always editable. Not a constraint.

## Domain 6 — Scoring, Readiness, and ETA Logic

**Pipeline:** Evidence submitted → manager validates → requirement weight applied → points added to score → score vs level band → Readiness % → ETA → Confidence

**Critical business rule — Score ≠ Readiness:**
- Score = points accumulated
- Readiness = score + ALL mandatory requirements met
- 90% score + 0 mandatory requirements = 0% readiness
- This distinction must appear in every employee view

**ETA formula:** `remaining points / 90-day validated velocity`
**Confidence:** High (consistent velocity, few mandatories left) | Medium | Low (stalled, low velocity)

Retroactive approvals: allowed but flagged in audit log with date discrepancy noted.
Requirement weight changes: trigger async recalculation event, employees notified of score changes.

## Domain 7 — MVP Scope

**In scope:** 3D career map, employee detail panel, evidence submission/approval, weighted scoring (async), readiness % + ETA with confidence, admin configuration of all configurable dimensions, CDF seed, RBAC (Employee/Manager/Admin), audit log, analytics dashboard, OIDC/SSO-ready auth, dark mode, cloud-ready deployment

**Out of scope (MVP):** Mobile app, employee score dispute workflow, AI recommendations, HR/LMS integrations, multi-tenant management, public career ladders, email/Slack notifications, peer review of evidence, self-service org onboarding wizard

## Domain 8 — Risks and Assumptions

| Risk | Mitigation |
|---|---|
| Manager gaming scores | All approvals logged with reason; HR visibility; optional dual-approval |
| Recalculation at scale | Async Redis job queue; idempotent, audited, retryable |
| 3D performance at 500+ employees | LOD rendering, cluster aggregation, visible-segment-only |
| Config complexity overwhelming orgs | CDF seed means zero-config start; config is enhancement not prerequisite |
| CDF seed mismatch | Frame as editable template, not a constraint |
| Evidence gaming | Manager validation is the gate; attached files more defensible |
| Enterprise compliance requirements | Immutable audit log + score snapshots from day one |

**Key Assumptions:**
- Org runs on a tech career model (CDF seed fits)
- Managers will engage with the approval workflow
- 3D visualization is the key demo differentiator
- Dark mode / professional aesthetic signals engineering culture fit

---

## Session Conclusions — Feed to Product Brief

1. FCM = career progression intelligence platform. Fibonacci = structure, not theme.
2. 3D map = primary canvas. All employee exploration happens via sliding panels over the spiral. Never leave the 3D.
3. Score ≠ Readiness. The most important business rule. Must be explicit in every view.
4. Auditability and explainability are first-class. Every change is logged, timestamped, explained.
5. Configurable model is the enterprise business model. CDF seed = fast start, config = retention.
6. ETA + Confidence must always be displayed together.
7. Scoring pipeline = deterministic + async. Same inputs → same outputs. Always.
8. MVP is production-grade from day one. Real auth, real environments, real observability. No shortcuts.
