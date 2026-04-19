# Story 1.6: Containerization and Kubernetes deployment manifests for API and worker

Status: backlog

## Story

As an operator,
I want container images for `fcm-api` and `fcm-worker` and Kubernetes manifests with HPA and ingress,
so that the system can deploy to dev/staging/prod.

## Acceptance Criteria

1. Multi-stage Dockerfile produces a single image capable of running in API or worker mode via env.
2. `infra/k8s/` ships manifests for Deployments (API, worker), Services, Ingress, HPA (API + worker scale independently), and ConfigMap/Secret references.
3. CI builds and pushes images tagged with commit SHA on merge to main.
4. `kubectl apply` against the dev cluster deploys a reachable `GET /healthz` through ingress.

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

- E1.2
- E1.5

### References

- Arch §12.2
- AD-10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
