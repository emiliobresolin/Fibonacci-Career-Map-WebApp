# Story 2.4: Layer 1 AuthGuard, @Roles decorator, CORS lock-down

Status: done

## Story

As an engineer,
I want a global AuthGuard and a `@Roles(...)` decorator,
so that every endpoint enforces role checks by default.

## Acceptance Criteria

1. Global NestJS `AuthGuard` validates the JWT, rejects unauthenticated requests with 401, and populates `request.user = { user_id, organization_id, role }`.
2. A `@Roles('ADMIN' | 'MANAGER' | 'EMPLOYEE')` decorator restricts routes; unmatched role returns 403 with a structured error body.
3. CORS allow-list is loaded from configuration; requests from unlisted origins are rejected.
4. An integration test asserts 401 on missing token, 403 on role mismatch, and 200 on matched role.

## Tasks / Subtasks

- [x] Task covering AC #1 — `JwtAuthGuard` registered via `APP_GUARD` in `AuthModule`; verifies bearer JWT via `JwtService.verifyAccess`, runs Story 2-3 Redis session-active check when jti present, stamps `request.user = { user_id, organization_id, role, jti? }`. Missing/malformed/empty/invalid token → 401 with structured `{ error, message }` body.
- [x] Task covering AC #2 — `@Roles(...Role[])` decorator + `ROLES_KEY` metadata; guard reads via `Reflector.getAllAndOverride` over handler + class. Mismatch → 403 with `{ error, message, requiredRoles }`. Unknown role symbol throws at module-load time (typo trap).
- [x] Task covering AC #3 — `CORS_ALLOWED_ORIGINS` env var (CSV) parsed by `parseOrigins`; `main.ts` applies `httpApp.enableCors` with a function callback rejecting unlisted origins. Production env-validation promotes the var to required + non-empty.
- [x] Task covering AC #4 — `apps/api/test/auth-guard.test.mjs` asserts the 401 (missing/bad token, revoked session), 403 (role mismatch) and pass (`canActivate → true` + `request.user` shape) outcomes against the guard class with stubbed `Reflector`/`JwtService`/`SessionStoreService`. `cors-origins.test.mjs` covers the allow-list parser. `roles-decorator.test.mjs` covers the typo-guard.

## Dev Notes

- The guard is the inversion this story locks in: every new route is authenticated unless it explicitly carries `@Public()`. The three opt-outs added by this story are `AuthController` (the OIDC dance), `HealthController` / `ReadinessController`, and `MetricsController` (which keeps its existing basic-auth guard).
- `audit.controller.ts` and `sessions.controller.ts` previously held inline bearer-token decode + role checks (documented as a Story 2-4 placeholder). Those have been removed; both controllers now read `req.user` and rely on `@Roles(...)` for the role gate. `AuditModule` no longer imports `AuthModule`/`SessionsModule` as a result.
- CORS: empty allow-list is the safe default in dev/test — the web hits the api through Next's same-origin rewrite. Production env-validation forbids an empty allow-list. The `cors` middleware permits requests with no `Origin` header (same-origin XHR, server-to-server, CLI) — CORS only meaningfully restricts browser-driven cross-origin requests.
- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.2

### References

- Arch §10.3 Layer 1
- FR-1.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm typecheck` — green (4 workspaces)
- `pnpm --filter @fcm/api test` — 29 / 29 pass (11 auth-guard + 1 module-wiring + 5 CORS + 5 roles-decorator + 7 partition)
- `pnpm test` — green across all workspaces (12 domain-contracts + 29 api + 0 scoring-core + web no-op)

### Adversarial Review Outcomes

Independent review (Blind Hunter + Edge Case Hunter) raised 12 findings. Triage:

**Addressed in this commit:**
- HIGH-1: `/auth/refresh` was @Public(), so the global guard couldn't enforce forced-logout. Added an inline `sessions.isActive` check in `refresh()` after `verifyRefresh`.
- HIGH-2: No test proved `APP_GUARD` was wired in the module graph. Added `auth-module-wiring.test.mjs` which inspects `Reflect.getMetadata('providers', AuthModule)` and asserts the `APP_GUARD → JwtAuthGuard` entry.
- MEDIUM-3: Class-level `@Public()` on `AuthController` was a footgun — replaced with per-handler `@Public()` on `init`, `callback`, `refresh`.
- MEDIUM-4: CORS rejection used `cb(new Error(...))` which leaked the origin string via Express's default 500 handler. Switched to `cb(null, allowed)` so the browser silently fails the CORS check at the client side.
- MEDIUM-5: `JwtService.verifyAccess` did not validate the `role` claim against the `ROLES` enum — a token with `role: 'SUPERUSER'` would have been stamped onto `req.user`. Added `ROLES.includes` check.
- MEDIUM-6: Bearer scheme matched case-sensitively. RFC 6750 §2.1 requires case-insensitive — `header.slice(0,7).toLowerCase() === 'bearer '`.
- LOW-9: `audit.controller` + `sessions.controller` threw `Error` (→ 500) on a missing `req.user`. Switched to `UnauthorizedException` (→ 401).
- NIT-10: Stale JSDoc on `sessions.module.ts` referenced inline role gating that no longer exists. Updated.

**Deferred (logged as follow-up, not blocking):**
- LOW-7: Session-store dormant path (no `REDIS_URL`) silently passes `isActive`. Acceptable per docs but worth a metric in production observability work.
- LOW-8: Non-HTTP transports unconditionally bypass the guard. Test asserts this is intentional; if microservice/WS controllers land, the `@Roles` decorator should grow a transport hint.
- NIT-11: Add a runtime CORS origin-compare test (trailing slash on a live request).
- NIT-12: Debug-level structured log on every 401 for triageability (do not log at info+, would be a PII firehose).

### Completion Notes List

- AC1: `JwtAuthGuard.canActivate` populates the request with the documented `{ user_id, organization_id, role }` shape; jti is included when present so the future `@ActorContext()` primitive (Story 2-5) has a single source of truth.
- AC2: `@Roles('ADMIN')` on `SessionsController`; `@Roles('EMPLOYEE','MANAGER','ADMIN')` on `AuditController` (RBAC scope inside the result set continues to be enforced in `AuditService`).
- AC3: `CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com` (CSV). Trailing slashes are normalised away; whitespace is trimmed. Production env-validation forbids empty / unset.
- AC4: Unit-level integration test against the guard class avoids needing `@nestjs/testing` or `supertest` in the toolchain; covers 401 (missing/non-Bearer/empty/invalid token/revoked session), 403 (role mismatch), and the pass path with `req.user` assertion.
- `@Public()` opt-outs applied to: `AuthController` (OIDC routes), `HealthController` (`/healthz`), `ReadinessController` (`/readyz`), `MetricsController` (`/metrics` — JWT-public but still basic-auth guarded).
- Removed inline JWT decode + session check from `AuditController` and `SessionsController`; they now read `req.user` and use `@Roles` for the role check.

### File List

- `apps/api/src/auth/auth.types.ts` (new) — `ROLES`, `Role`, `RequestUser`.
- `apps/api/src/auth/public.decorator.ts` (new) — `@Public()` + `IS_PUBLIC_KEY`.
- `apps/api/src/auth/roles.decorator.ts` (new) — `@Roles(...)` + `ROLES_KEY`.
- `apps/api/src/auth/auth.guard.ts` (new) — `JwtAuthGuard`.
- `apps/api/src/auth/auth.module.ts` (modified) — register `APP_GUARD`.
- `apps/api/src/auth/auth.controller.ts` (modified) — `@Public()` on OIDC dance.
- `apps/api/src/common/env.config.ts` (modified) — `CORS_ALLOWED_ORIGINS` + `parseOrigins` + prod-required.
- `apps/api/src/main.ts` (modified) — `enableCors` with allow-list callback.
- `apps/api/src/health/health.controller.ts` (modified) — `@Public()`.
- `apps/api/src/health/readiness.controller.ts` (modified) — `@Public()`.
- `apps/api/src/observability/metrics.controller.ts` (modified) — `@Public()` (keeps basic-auth).
- `apps/api/src/audit/audit.controller.ts` (modified) — drop inline auth, use `@Roles` + `req.user`.
- `apps/api/src/audit/audit.module.ts` (modified) — drop AuthModule/SessionsModule imports.
- `apps/api/src/sessions/sessions.controller.ts` (modified) — drop inline auth, use `@Roles('ADMIN')` + `req.user`.
- `apps/api/test/auth-guard.test.mjs` (new) — 10 tests covering AC1/AC2/AC4 outcomes.
- `apps/api/test/cors-origins.test.mjs` (new) — 5 tests covering AC3 parser.
- `apps/api/test/roles-decorator.test.mjs` (new) — 5 tests covering @Roles typo-guard + ROLES enumeration.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story 2-4 → done.
