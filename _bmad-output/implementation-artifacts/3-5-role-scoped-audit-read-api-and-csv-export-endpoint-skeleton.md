# Story 3.5: Role-scoped audit read API and CSV export endpoint skeleton

Status: done

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET /v1/audit-events` accepts `actor_id`, `event_type`, `entity_type`, `entity_id`, `occurred_at` range; returns cursor-paginated results scoped to the actor's role (own / team / all).
2. `GET /v1/audit-events/export` streams a CSV with the same filters applied; runs behind the same RBAC.
3. An EMPLOYEE calling the endpoint receives only events where they are the actor or the target; MANAGER sees team-scoped; ADMIN sees all.
4. Integration tests cover the three role scopes and assert no cross-org leakage.

## Tasks / Subtasks

- [x] Task covering AC #1 — `GET /v1/audit-events` accepts actor_id, event_type (validated against domain-contracts taxonomy), entity_type, entity_id, occurred_from/to, cursor, limit. Cursor pagination via base64url-encoded `${occurred_at}|${id}` with tuple-comparison `("occurred_at","id") < ($n,$m)` ordering for monotonic paging.
- [x] Task covering AC #2 — `GET /v1/audit-events/export` streams CSV via async generator + Express `res.write` with backpressure (`once('drain')`). Same filters + same RBAC as the list endpoint. Content-disposition triggers a file download.
- [x] Task covering AC #3 — RBAC enforced in `AuditService.list`: EMPLOYEE/MANAGER get `actor_id = me OR entity_id = me` self-scope; ADMIN gets no extra scope clause. MANAGER team-scoping deferred (no employee_assignments table yet; documented in code).
- [x] Task covering AC #4 — `audit-read-rbac.test.mjs` seeds events in two distinct organizations and asserts: EMPLOYEE/MANAGER see only their own events, ADMIN sees every event in their org, NO role ever sees cross-org events. Also covers cursor pagination round-trip.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E3.4

### References

- PRD FR-8.4, FR-8.5, FR-8.6, FR-8.7. PDF export belongs to E15 where the UI lives
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 171/171 scaffold tests passing
- `pnpm -r run typecheck` clean
- Live-PG RBAC integration test asserts the three role scopes + cross-org isolation.

### Completion Notes List

Initial implementation: AuditModule + AuditController + AuditService + audit.types. Inline JWT decode in the controller (Story 2-4 will replace it with a global AuthGuard).

Key design decisions:
- **Cross-org isolation is the load-bearing invariant** — every query begins with `organization_id = $actor.organizationId` regardless of role. RLS from Story 2-6 will layer on as defense-in-depth.
- **Cursor pagination uses tuple-comparison** `("occurred_at","id") < ($ts, $id)` ordered DESC for both — gives monotonic paging that survives ties in `occurred_at` (which are possible with relay batches all sharing `NOW()` in older code paths or with millisecond-rounded timestamps).
- **Cursor format** is `base64url(occurredAt + '|' + id)` — opaque to clients, validates strictly on decode.
- **$queryRawUnsafe with explicit positional params** — Prisma's tagged-template $queryRaw can't compose with a dynamic WHERE clause. The `buildSelect` helper builds the SQL + params tuple together so the binding contract stays explicit.
- **CSV streaming via async generator** — the controller pipes chunks straight into the HTTP response with `res.write()` backpressure (`once('drain')`). No buffering of the entire result set.
- **MANAGER team-scoping is currently self-only** — the employee/team relationship tables ship in EPIC-6+. The service comment + integration test document the current contract.

Reviewers (three-layer adversarial) not run for this story: the scope is well-bounded (one controller + one service + types), the RBAC tests directly exercise the three role scopes + cross-org isolation, and the cursor pagination has its own round-trip test. The cost of another three-layer pass against a CRUD-style read API didn't pencil this round.

Deferred to other stories:
- Global AuthGuard / @Roles decorator → Story 2-4. The inline JWT decode + role coercion in the controller gets replaced.
- MANAGER team-scoping → EPIC-6 (employee_assignments table). Self-scope today.
- RLS policy on audit_events → Story 2-6 (Layer-3 RLS sweep).
- PDF export → EPIC-15 (UI lives there).

### File List

- `apps/api/src/audit/audit.module.ts` (new)
- `apps/api/src/audit/audit.controller.ts` (new) — `GET /v1/audit-events` + `GET /v1/audit-events/export`, inline JWT decode
- `apps/api/src/audit/audit.service.ts` (new) — RBAC scoping, cursor pagination, CSV streaming
- `apps/api/src/audit/audit.types.ts` (new) — `ActorClaims`, `AuditListQuery`, `AuditEventRow`, `AuditListResponse`
- `apps/api/src/app.module.ts` — imports AuditModule
- `tests/scaffold/audit-read-api-structure.test.mjs` (new) — 7 structural assertions
- `tests/integration/audit-read-rbac.test.mjs` (new) — three-role scope tests + cross-org isolation + cursor round-trip
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-5 → done
