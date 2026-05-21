# Story 2.2: OIDC/SSO login via openid-client and NextAuth session

Status: done

## Story

As a user,
I want to log in through my organization's identity provider,
so that I can use FCM without a password.

## Acceptance Criteria

1. `apps/api` exposes OIDC callback endpoints using `openid-client`; discovery document is loaded from per-org config.
2. `apps/web` uses NextAuth.js configured with a custom credentials/OIDC adapter that hands off to the API.
3. Successful authentication sets an HTTP-only, Secure, SameSite=Lax session cookie; session has 24 h expiry and 2 h idle timeout.
4. The API issues a short-lived (15 min) JWT bearer token used for subsequent API calls; refresh happens through a secure server-side web endpoint.

## Tasks / Subtasks

- [x] Task covering AC #1 — POST /auth/oidc/init + per-org openid-client discovery + Issuer.discover SSRF guard
- [x] Task covering AC #2 — NextAuth `fcm-oidc` Credentials provider + OIDC callback page that completes the handshake via signIn()
- [x] Task covering AC #3 — JWT-strategy session with maxAge=24h, updateAge=2h, HttpOnly + SameSite=Lax + Secure-in-prod
- [x] Task covering AC #4 — 15-min access token TTL + refresh endpoint + jwt-callback rotation when the access token is past its safety window

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.1

### References

- Arch §10.1
- FR-1.1, FR-1.5
- AD-11
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 125/125 scaffold tests passing (`pnpm run test:scaffold`)
- `pnpm -r run typecheck` clean across api/web/domain-contracts/scoring-core
- Three-layer adversarial review: Blind Hunter + Edge Case Hunter + Acceptance Auditor — fixes from all three batched into this story before commit.

### Completion Notes List

Initial implementation: openid-client + jose + NestJS AuthModule on the api side; NextAuth v4 Credentials provider on the web side that POSTs to the api's /auth/oidc/callback to mint JWTs; login page → IdP redirect; OIDC callback page → signIn().

Review-batch patches (applied before commit):

- **Server-anchored PKCE/nonce/state.** Added `OidcStateStore` (in-memory Map with 10-min TTL, single-use consume). `/auth/oidc/init` returns only `{ authorizationUrl, state }`; the codeVerifier + nonce stay server-side and are looked up by state at `/auth/oidc/callback`. Defeats the original implementation's PKCE round-trip (verifier crossing the api→web→api boundary) and gives `state` real CSRF protection. Redis-backed replacement lands in Story 2-3.
- **JWT signing key.** Removed the hardcoded `'dev-only-jwt-secret-do-not-use-in-production'` fallback. When `JWT_SIGNING_SECRET` is unset (dev/test only — prod env-validation forbids it), JwtService now mints an ephemeral `randomBytes(32)` key per process and logs a warning. Tokens are invalidated on restart in dev — acceptable trade-off.
- **SSRF guard on Issuer.discover().** `OidcService.assertSafeIssuerUrl` refuses non-https in prod, plus any RFC1918 / loopback / link-local / IPv6 ULA / `.local` host. An org admin who can set `oidc_config.issuer` can no longer pivot through discovery to AWS metadata or cluster-local services.
- **Role precedence.** Replaced `orderBy: { role: 'asc' }` (which would have de-escalated dual-role Admin+Employee users to EMPLOYEE via Postgres enum ordinal sort) with an explicit `ROLE_PRECEDENCE` map computed in JS. Applies to both `/auth/oidc/callback` and `/auth/refresh`.
- **Cache cleanup unhandled rejection.** `OidcService.getClient` no longer rethrows from the `.catch` handler — that pattern produced an UnhandledPromiseRejection on discovery failure. The original awaiter still gets the rejection via the awaited promise.
- **Sanitized OIDC error logs.** Replaced `String(err)` (which would serialize the authorization code or partial id_token bytes that openid-client puts in error messages) with `getErrorCode(err)` that emits only the structural `code` or `name` field.
- **tokenSet.claims() try/catch.** Malformed id_tokens now produce a 401 with a sanitized log, not a 500.
- **`requireRedirectUri()` → InternalServerErrorException.** Operator configuration error, not auth failure.
- **Refresh endpoint user/org cross-check.** Before issuing a new token pair, looks up the user by `payload.sub` and verifies `user.organizationId === payload.org`. Belt-and-braces against a future signing-key compromise that could let an attacker craft refresh tokens for arbitrary orgs.
- **P2002 race on user.upsert.** Concurrent first-logins for the same (org, email) no longer 500 — the catch reads the survivor row and continues.
- **Discovery + token-exchange timeouts.** Both wrapped in `withTimeout(10s)` so a stuck IdP can't pin a NestJS request indefinitely.
- **Dev-stub state literal rejected in production.** Defense-in-depth against the dev shortcut leaking into a prod web build: `/auth/oidc/callback` refuses `code === 'dev-stub'` or `state === 'dev-stub'` outright when `NODE_ENV=production`, regardless of how the web bundle was built. The login-page dev shortcut itself was removed — it now goes through the same OIDC flow (which would 401 against the state store). A proper dev-login endpoint will land alongside Story 2-7 (bootstrap admin).
- **Refresh rotation wired into NextAuth jwt callback.** Tracks `accessTokenExpiresAt` in the JWT; rotates via `refreshApiAccessToken` when past the safety window. The refresh endpoint exists in the api regardless, but the NextAuth session lifecycle now actually exercises it (closes the AC4 gap).
- **NEXTAUTH_SECRET lazy check.** No longer throws at module-load (next build's "Collect page data" was failing the build); throws lazily from `getApiBaseUrl()` only when an actual request reaches it in production.
- **Double-submit guard on login page** via `useRef` so a fast double-click can't fire two `/auth/oidc/init` calls and clobber sessionStorage.
- **Stale `sessionStorage.fcm.oidc.pending` cleanup** on both login page mount and callback page mount.

Deferred to Story 2-3 (Redis-backed session store) — acknowledged in code comments:
- Refresh-token rotation/revocation via jti tracking
- Cross-replica state store (in-memory Map drops in-flight logins on pod restart)
- Rate limiting on `/auth/*`
- Logout endpoint

Deferred to dedicated stories:
- NextAuth type-module augmentation (low-risk type cleanup)
- Behavioral JWT tests (scaffold-test convention is structural)

### File List

API (NestJS):
- `apps/api/src/auth/auth.module.ts` (new) — wires AuthController + OidcService + OidcStateStore + JwtService
- `apps/api/src/auth/auth.controller.ts` (new) — POST /auth/oidc/init, /auth/oidc/callback, /auth/refresh
- `apps/api/src/auth/oidc.service.ts` (new) — per-org openid-client cache, PKCE/nonce mint, callback exchange, SSRF + timeout guards
- `apps/api/src/auth/oidc-state.store.ts` (new) — server-side single-use PKCE/nonce/state anchor
- `apps/api/src/auth/jwt.service.ts` (new) — HS256 access (15m) + refresh (24h) signing/verify via jose
- `apps/api/src/app.module.ts` — imports AuthModule
- `apps/api/src/common/env.config.ts` — adds OIDC_REDIRECT_URI + JWT_* env + production superRefine
- `apps/api/package.json` — adds openid-client@5.7.1, jose@5.9.6

Web (Next.js):
- `apps/web/src/lib/auth.ts` (new) — NextAuth Credentials provider + cookie config + jwt-callback refresh rotation
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` (new) — NextAuth v4 App-Router handler
- `apps/web/src/app/auth/oidc/callback/page.tsx` (new) — completes the IdP redirect by calling signIn('fcm-oidc')
- `apps/web/src/app/login/page.tsx` — kicks off /auth/oidc/init and redirects to the IdP
- `apps/web/package.json` — adds next-auth@4.24.11

Scaffold tests:
- `tests/scaffold/auth-structure.test.mjs` (new) — 16 assertions across deps, env, AuthModule shape, OIDC + JWT semantics, NextAuth config, login + OIDC callback pages, state store wiring, refresh-rotation wiring

Sprint status:
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 2-2 → done
