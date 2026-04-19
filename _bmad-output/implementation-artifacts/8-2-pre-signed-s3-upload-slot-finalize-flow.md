# Story 8.2: Pre-signed S3 upload slot + finalize flow

Status: backlog

## Story

As an Employee,
I want to upload a file directly to object storage,
so that evidence bytes don't flow through the API.

## Acceptance Criteria

1. `POST /v1/requirements/:id/evidence/upload-slot` returns a pre-signed PUT URL with 15-min TTL, single-use, content-length-range bounded, and key `org/{organization_id}/evidence/{employee_id}/{uuid}/{filename}`.
2. `POST /v1/requirements/:id/evidence/finalize` validates object existence via S3 `HEAD`, records `storage_object_key`, `storage_etag`, `content_type`, `size_bytes`, transitions the evidence DRAFT → PENDING_APPROVAL, and emits an `evidence.submitted` outbox event.
3. Organization scoping is asserted: a key outside `org/{organization_id}/...` is rejected with `403 FORBIDDEN_SCOPE`.
4. Integration test covers upload-slot, upload-to-S3 stub, finalize, and state-machine assertion.

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

- E8.1

### References

- Arch §9.1, AD-9
- PRD FR-4.2, FR-4.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
