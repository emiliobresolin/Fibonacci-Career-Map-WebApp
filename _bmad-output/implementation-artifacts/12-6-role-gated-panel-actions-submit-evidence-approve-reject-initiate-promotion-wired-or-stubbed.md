# Story 12.6: Role-gated panel actions: Submit Evidence, Approve/Reject, Initiate Promotion (wired or stubbed)

Status: backlog

## Story

As an Employee/Manager/HR/Admin,
I want role-specific actions inside the panel.

## Acceptance Criteria

1. Employee on own panel: "Submit Evidence" button opens the evidence-submission flow (wired to E8.2).
2. Manager on report's panel: "Approve" / "Reject" actions on any pending evidence item inline (wired to E8.4).
3. "Initiate Promotion" button rendered but its wiring is completed in E13.8; when the org is in `CALIBRATION`, the button is suppressed and replaced with the label "Eligible — Pending Calibration" (per FR-3.16).
4. "Flag for Calibration" action visible to HR only on nodes in `ELIGIBLE` state; wired in E13.6 (UI stub here).
5. "View Full Profile" link for Manager and Admin; wired in E15.3.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E12.4
- E8.2
- E8.4

### References

- PRD FR-3.9, FR-3.10, FR-3.11, FR-3.15, FR-3.16
- Arch §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
