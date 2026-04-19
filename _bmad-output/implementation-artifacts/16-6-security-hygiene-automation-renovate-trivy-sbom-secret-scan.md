# Story 16.6: Security hygiene automation (Renovate, Trivy, SBOM, secret-scan)

Status: backlog

## Story

As a security engineer,
I want automated supply-chain hygiene.

## Acceptance Criteria

1. Renovate Bot configured for dependency auto-PRs on `apps/*` and `packages/*`.
2. Trivy scans every CI image; failures with CVSS ≥7 block merge to main.
3. SBOM generated per build and retained in the artifact registry.
4. Pre-commit hook + CI job scan for secret patterns.

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

- E1.6

### References

- Arch §12.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
