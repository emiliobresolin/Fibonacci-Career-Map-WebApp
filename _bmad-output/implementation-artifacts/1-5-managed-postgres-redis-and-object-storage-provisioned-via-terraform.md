# Story 1.5: Managed Postgres, Redis, and object storage provisioned via Terraform

Status: backlog

## Story

As an operator,
I want managed Postgres 15+, Redis 7+, and S3-compatible storage provisioned across dev/staging/prod via Terraform,
so that environments are reproducible.

## Acceptance Criteria

1. `infra/terraform/` defines modules for Postgres, Redis, and object storage; per-env tfvars.
2. Applying the dev workspace produces reachable endpoints whose connection strings are stored in the cloud secret manager.
3. Each environment is separately statefiled (no shared tfstate) and documented in `docs/ops/infrastructure.md`.
4. Terraform `plan` runs in CI against PRs touching `infra/terraform/`.

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

- E1.1

### References

- Arch §12.1, §12.3
- AG7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
