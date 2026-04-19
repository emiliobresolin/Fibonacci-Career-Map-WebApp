# Story 1.9: Secrets management wiring

Status: backlog

## Story

As an engineer,
I want every secret loaded from the cloud secret manager at runtime,
so that no secret ever appears in code, images, or env files.

## Acceptance Criteria

1. API and worker bootstrap reads secrets from the configured secret manager (AWS Secrets Manager / GCP Secret Manager / Azure Key Vault) through a provider-neutral interface.
2. `.env.example` documents only non-secret configuration; a CI secret-scanning step fails the build if a committed file contains a credential pattern.
3. Rotation of a secret in the secret manager is picked up by the next pod restart without code changes.
4. `docs/ops/secrets.md` documents the secret inventory.

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

- E1.5

### References

- Arch §12.6
- NFR-4.7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
