# Story 8.7: Evidence expiry cron consumer

Status: backlog

## Story

As a system,
I want expired evidence automatically transitioned and scores recalculated.

## Acceptance Criteria

1. Cron `evidence.expiry-scan` runs daily at 02:00 UTC, scans `WHERE state = 'APPROVED' AND expires_at < NOW()`, and per match: transitions → EXPIRED, enqueues recalc with synthetic `EvidenceExpired` event, and writes audit + notification via outbox — all in one transaction per evidence item.
2. The scan is rate-limited per org to avoid thundering herds.
3. Unit test with fixed clock verifies expiry decisions.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E8.1
- E4.2
- E4.4

### References

- PRD §14.7, FR-4.8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
