# Story 2.7: Bootstrap admin fallback credentials and OIDC-outage recovery codes

Status: backlog

## Story

As a first-time administrator,
I want a username/password fallback and emergency recovery codes,
so that I can bootstrap FCM before OIDC is configured and recover from an IdP outage.

## Acceptance Criteria

1. First-run bootstrap creates one ADMIN with a bcrypt-hashed username/password; credentials are surfaced once via secure channel and never logged.
2. Once the first OIDC-linked ADMIN exists, username/password login is disabled automatically; a migration flag tracks this.
3. On org bootstrap, the system generates 10 single-use OIDC-outage recovery codes bound to Admins only; code redemption is audited and a code self-burns on use.
4. A runbook stub in `docs/ops/runbooks/oidc-outage.md` documents the recovery procedure.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.2
- E3.3

### References

- PRD FR-1.2
- Arch §10.1, AR-6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
