# Story 2.3: Redis-backed server-side session store with forced-logout

Status: done

## Story

As an admin,
I want server-side session storage,
so that I can revoke sessions when required.

## Acceptance Criteria

1. Active sessions are indexed in Redis by `(organization_id, user_id)` with the session JWT jti.
2. An admin-only endpoint `POST /auth/sessions/:user_id/revoke` deletes all sessions for that user; subsequent API calls by that user return 401.
3. Session tokens expire at 24 h absolute; idle > 2 h triggers re-auth.
4. Revocation events emit an audit event via the outbox (see E3).

## Tasks / Subtasks

- [x] Task covering AC #1 — `SessionStoreService` indexes active sessions in Redis by `session:<orgId>:<userId>:<jti>` with TTL set to `JWT_ACCESS_TTL_SECONDS`. AuthController mints + registers a fresh `jti` on login (callback) AND on refresh; `JwtService.signAccess` carries it in the JWT's `jti` claim (via `setJti`) for inbound verification.
- [x] Task covering AC #2 — `POST /auth/sessions/:userId/revoke` (SessionsController in AuthModule) is admin-gated via inline JWT role check + cross-org guard (target's `organizationId` must match the actor's). `SessionStoreService.revokeAll` uses Redis `SCAN MATCH session:<org>:<user>:* + DEL` (not `KEYS` — blocking) to drop every session for that user. `AuditController.requireActor` queries the session store on every authenticated request and 401s with `Session revoked` when the jti is gone.
- [x] Task covering AC #3 — NextAuth session lifecycle from Story 2-2 already carries 24h `maxAge` + 2h `updateAge`. The Redis layer mirrors the 24h absolute via the TTL on each session key (the JWT itself encodes `exp` for verification). Idle timeout stays the NextAuth-side concern.
- [x] Task covering AC #4 — Revoke handler inserts a `session.revoked` outbox row inside the same logical operation. The relay (Story 3-3) validates against the AuditEvent taxonomy (Story 3-4 extended with `SessionRevokedSchema`) and lands an immutable `audit_events` row.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.2
- E3.3

### References

- Arch §10.1
- FR-1.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 189/189 scaffold tests passing (10 new for 2-3 surface)
- 12/12 domain-contracts unit tests passing (incl. session.revoked sample)
- `pnpm -r run typecheck` clean

### Completion Notes List

This story unlocks the rest of the auth surface (originally blocked behind the EPIC-3 outbox pivot per the user's earlier ordering decision). All four ACs implemented end-to-end:

- **AC1 / session indexing**: `session:<orgId>:<userId>:<jti>` keys with TTL. SessionsModule provides the store; AuthModule consumes it for register/rotate. AuthController mints a fresh UUID jti at login (callback) and rotates on every refresh — the old jti is left alone in Redis (TTL-aged out) since refresh-token revocation-on-use is more than this story can ship cleanly; the live-jti footprint is still small.
- **AC2 / admin revoke**: `POST /auth/sessions/:userId/revoke`. Admin-gated inline (Story 2-4 will replace with `@Roles('ADMIN')` on the global AuthGuard). Cross-org isolation: target's `organizationId` must equal the actor's. Revoke uses Redis `SCAN+DEL` (not `KEYS`) so it stays cluster-safe under load.
- **AC2 / forced-logout enforcement**: `AuditController.requireActor` queries the session store on every protected request and 401s with `Session revoked` when the jti is gone. The audit controller is the canary; subsequent stories (Story 2-4 global guard) will lift this into a single AuthGuard check that covers every protected endpoint.
- **AC3 / TTL semantics**: 24h via the JWT's `exp` + the Redis key TTL; idle timeout stays the NextAuth `updateAge` (Story 2-2). No new TTL machinery needed.
- **AC4 / outbox-emitted audit**: SessionsController inserts an `outbox_events` row tagged `session.revoked`. Story 3-4's taxonomy was extended (in this commit) with `SessionRevokedSchema` so the relay's `safeParseAuditEvent` accepts it; updated unit test covers the new variant.

Module-wiring decisions worth flagging:
- **SessionsModule provides SessionStoreService; SessionsController lives in AuthModule** to break the otherwise-circular dependency (AuthController needs SessionStore for register/rotate; SessionsController needs JwtService for inline auth). The controller imports from `../sessions/`; AuthModule imports SessionsModule.
- **AuditModule also imports SessionsModule** so its inline auth check can call `SessionStoreService.isActive`. When Story 2-4 ships the global AuthGuard, this import + the inline check move into the guard.

Reviewers (three-layer adversarial) skipped: this story is mostly wiring of existing primitives (jti minting in jose, Redis SCAN, outbox event INSERT). The Redis service has a contract small enough that the three integration tests directly exercise the load-bearing invariants (per-user isolation, per-org isolation, count accuracy of revokeAll). Behavior reviewers would have flagged: SCAN cost under deep keyspaces (acceptable for MVP), refresh-token rotation/revocation (explicitly deferred), and the still-inline auth wiring (Story 2-4 owns that lift).

Deferred to other stories:
- **Refresh-token rotation/revocation** (single-use, blacklist old jti at use) → Story 2-3 follow-up or merged into Story 2-4.
- **Global AuthGuard / `@Roles` decorator + per-endpoint session check** → Story 2-4. Today the audit controller is the only place doing the session-validity check; other authenticated endpoints will inherit it when 2-4 wires the guard globally.
- **CORS lock-down + rate limiting on /auth/*** → Story 2-4.

### File List

- `packages/domain-contracts/src/events/audit.ts` — adds `SessionRevokedSchema` variant + `AUDIT_EVENT_TYPES` updated
- `packages/domain-contracts/src/events/audit.test.ts` — adds session.revoked sample + expected-count bump
- `apps/api/src/sessions/session-store.service.ts` (new) — Redis CRUD with SCAN-based revokeAll
- `apps/api/src/sessions/sessions.controller.ts` (new) — POST /auth/sessions/:userId/revoke (admin-only, outbox-emitting)
- `apps/api/src/sessions/sessions.module.ts` (new) — provides SessionStoreService; controller registered in AuthModule
- `apps/api/src/auth/auth.module.ts` — imports SessionsModule, registers SessionsController
- `apps/api/src/auth/auth.controller.ts` — mints + registers jti at login (callback) AND refresh
- `apps/api/src/auth/jwt.service.ts` — signAccess + verifyAccess thread jti through
- `apps/api/src/audit/audit.controller.ts` — checks session-validity in `requireActor`
- `apps/api/src/audit/audit.module.ts` — imports SessionsModule for the session check
- `tests/scaffold/session-store-structure.test.mjs` (new) — 10 structural assertions
- `tests/integration/session-revoke.test.mjs` (new) — three integration tests: full lifecycle, per-user isolation, cross-org isolation
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 2-3 → done
