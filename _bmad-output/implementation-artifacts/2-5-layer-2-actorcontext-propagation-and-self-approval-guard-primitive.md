# Story 2.5: Layer 2 ActorContext propagation and self-approval guard primitive

Status: done

## Story

As a backend developer,
I want every domain service method to receive an `ActorContext` and a reusable self-approval guard,
so that business-level authorization is explicit and testable.

## Acceptance Criteria

1. A `ServiceContext` module provides an `ActorContext` object (`{ user_id, organization_id, role, display_name }`) available in REST handlers, WebSocket handlers, and BullMQ job payloads.
2. A `SelfApprovalGuard.ensureNotSelf(actor, subjectUserId)` primitive throws `SelfApprovalNotAllowedError` when `actor.user_id === subjectUserId`.
3. An example service method consumes `ActorContext` and calls the guard; a failing and a passing unit test cover both outcomes.

## Tasks / Subtasks

- [x] Task covering AC #1 — `ActorContext` type + `@ActorContext()` parameter decorator in `apps/api/src/auth/actor-context.ts`. REST handlers declare `@ActorContext() actor: ActorContext`; BullMQ jobs use `JobPayloadWithActor<T>` and call `actorFromJobData(job.data)`; WebSocket propagation will live on `socket.data.actor` once Story 5-2 lands the WS handshake. JWT extended with the OIDC `name` claim minted by `auth.controller` at login + refresh, exposed on `request.user.display_name` by the Layer-1 AuthGuard.
- [x] Task covering AC #2 — `SelfApprovalGuard.ensureNotSelf` + `SelfApprovalNotAllowedError` in `apps/api/src/auth/self-approval.guard.ts`. Error carries `actorUserId` + `subjectUserId` + `code: 'SELF_APPROVAL_NOT_ALLOWED'` so the audit pipeline can correlate attempts. Empty/non-string `subjectUserId` raises `TypeError` (contract-violation guard).
- [x] Task covering AC #3 — `apps/api/test/self-approval-guard.test.mjs` defines an `ExampleApprovalService` fixture that consumes `ActorContext`, runs the guard, and (only on success) records the decision. Tests cover both the failing path (self → throws + state untouched) and the passing path (other → returns `{ ok: true }` + state captured).

## Dev Notes

- The `ActorContext` shape is intentionally lean — only the four fields a domain service is allowed to act on. Anything mutable between login and the call (current role assignments, organization mutations) must be re-fetched at the service layer, not trusted from this object.
- `SelfApprovalGuard` is a stateless static method, not a NestJS guard. It composes inside service methods *after* domain preconditions have run so the failure produces a 403 with domain context, not a generic auth failure.
- `JwtAuthGuard` (Story 2-4) populates `request.user.display_name` from the `name` claim — empty string when the claim is absent (tokens minted before this story carry no `name`; the next refresh re-mints with it populated).
- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.4

### References

- Arch §10.3 Layer 2
- PRD §9.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm typecheck` — green (4 workspaces)
- `pnpm --filter @fcm/api test` — 51 / 51 pass (+20 tests over 2-4 baseline: 10 ActorContext/SelfApprovalGuard + 5 jwt-name-sanitize + 5 expanded coverage from review fixes)
- `pnpm test` — green across all workspaces

### Adversarial Review Outcomes

Independent review raised 10 findings. Triage:

**Addressed in this commit:**
- BLOCKER-1: `actorFromJobData` didn't validate `role` against the `ROLES` enum — a poisoned BullMQ payload could ship `role: 'SUPERUSER'` and bypass the same enum check `verifyAccess` runs. Now asserts membership.
- MAJOR-2: BullMQ propagation was convention-only with no producer helper. Added `withActor(actor, data)` so the call site is explicit, the actor field is impossible to omit by accident, and consumers fail loudly on payloads that bypassed the helper.
- MAJOR-3: WS propagation was JSDoc-only. Added `SocketWithActor` type + `actorFromSocket` extractor (re-using `actorFromJobData`'s validator) so Story 5-2's handshake adapter has a load-bearing target.
- MAJOR-4: `name` claim was unbounded + unsanitized. `JwtService.verifyAccess` now strips ASCII control characters (0x00-0x1F, 0x7F) and caps length at 256 chars before returning.
- MAJOR-5: Refresh path staleness (FCM `user.displayName` lags upstream IdP edits) was undocumented. Added comment block in `auth.controller.refresh` describing the ≤24h staleness window and pointing at SCIM sync as the closing work.
- MINOR-6: `ensureNotSelf` did not defend against a malformed actor (`{}` would silently pass the self-check via `undefined === '<sub>'`). Now asserts `actor.user_id` is a non-empty string.
- NIT-10: `@ActorContext()` threw `Error` (→ 500) for non-HTTP transports. Switched to `UnauthorizedException` to match the documented 401 contract.

**Deferred (logged for follow-up, not blocking):**
- NIT-7: UUID case-sensitivity hazard is purely speculative — codebase already standardizes on canonical Prisma UUIDs. No fix today.
- NIT-8: `signAccess` double-sets `jti` (spread in constructor + `setJti()` call). Pre-existing from Story 2-3; harmless.
- NIT-9: AC3 example lives only in the test file. The first real consumer (Epic 8 evidence approval) will replace it with a production call site — noted so it isn't forgotten.

### Completion Notes List

- AC1: `ActorContext` type lives in `apps/api/src/auth/actor-context.ts`. Three propagation channels:
  - REST: `@ActorContext()` parameter decorator reads `req.user` (populated by the Layer-1 guard); 401 if used on a `@Public()` route.
  - BullMQ: `JobPayloadWithActor<T> = T & { actor: ActorContext }`; producers spread the actor into job data; consumers call `actorFromJobData(job.data)` which validates the shape and throws on a payload that bypassed the convention.
  - WebSocket: documented in the JSDoc — Story 5-2 will land `socket.data.actor` via the WS handshake.
- AC2: `SelfApprovalGuard.ensureNotSelf(actor, subjectUserId)`. Throws `SelfApprovalNotAllowedError` (machine-readable `code`, `actorUserId`, `subjectUserId`) when matched. Empty / non-string subjectUserId raises a `TypeError` because that condition is a calling-code bug, not a self-approval question.
- AC3: `ExampleApprovalService` test fixture demonstrates the integration pattern future Epic-8 (evidence approval) and Epic-13 (promotion decision) services will follow: take `ActorContext`, run the guard, only then mutate state. Tests assert both outcomes — failing path keeps state pristine, passing path returns + records.
- JWT carry: `signAccess` accepts `name` (OIDC standard claim) — `auth.controller.callback` passes `user.displayName`, `auth.controller.refresh` re-fetches `displayName` from the DB along with `organizationId` and re-mints. `verifyAccess` round-trips the claim back into `AccessTokenPayload.name`.

### File List

- `apps/api/src/auth/actor-context.ts` (new) — `ActorContext` type, `actorContextFromRequestUser`, `@ActorContext()` decorator, `JobPayloadWithActor<T>`, `withActor`, `actorFromJobData`, `SocketWithActor`, `actorFromSocket`.
- `apps/api/src/auth/self-approval.guard.ts` (new) — `SelfApprovalGuard.ensureNotSelf` + `SelfApprovalNotAllowedError`.
- `apps/api/src/auth/auth.types.ts` (modified) — `RequestUser.display_name` added.
- `apps/api/src/auth/auth.guard.ts` (modified) — populate `display_name` from `payload.name` (empty-string fallback for legacy tokens).
- `apps/api/src/auth/jwt.service.ts` (modified) — `AccessTokenPayload.name` carry; `signAccess` sets the `name` claim; `verifyAccess` round-trips it through `sanitizeName` (strip control chars, cap 256 chars).
- `apps/api/src/auth/auth.controller.ts` (modified) — `callback` + `refresh` paths mint with `name: user.displayName`; `refresh` extends Prisma `select` with `displayName`.
- `apps/api/test/self-approval-guard.test.mjs` (new) — 15 tests covering ActorContext shape, BullMQ + WS propagation, guard contract (including malformed-actor defense), and AC3 example service.
- `apps/api/test/jwt-name-sanitize.test.mjs` (new) — 5 tests covering MAJOR-4 fix: control-char strip, length cap, plain-name preservation, whitespace-only handling.
- `apps/api/test/auth-guard.test.mjs` (modified) — updated req.user assertion to include `display_name`; added test for empty-`name` fallback.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story 2-5 → done.
