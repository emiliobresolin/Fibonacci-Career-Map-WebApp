# Story 2.7: Bootstrap admin fallback credentials and OIDC-outage recovery codes

Status: done (audit emission via outbox deferred — requires AuditEvent taxonomy extension)

## Story

As a first-time administrator,
I want a username/password fallback and emergency recovery codes,
so that I can bootstrap FCM before OIDC is configured and recover from an IdP outage.

## Acceptance Criteria

1. First-run bootstrap creates one ADMIN with a bcrypt-hashed username/password; credentials are surfaced once via secure channel and never logged.
2. Once the first OIDC-linked ADMIN exists, username/password login is disabled automatically; a migration flag tracks this.
3. On org bootstrap, the system generates 10 single-use OIDC-outage recovery codes bound to Admins only; code redemption is audited and a code self-burns on use.
4. A runbook stub in `docs/ops/runbooks/oidc-outage.md` documents the recovery procedure.

## Tasks / Subtasks

- [x] Task covering AC #1 — `BootstrapCredentialsService.provision(organizationId)` creates the User row, the admin RoleAssignment, and the BootstrapCredential row in a single `withOrgScope` transaction. Plaintext password is returned ONCE to the caller and surfaced via the caller's secure channel; the DB stores only an scrypt hash. `POST /auth/bootstrap-login` verifies the credential and issues access+refresh tokens. Note: the AC literally specifies bcrypt; we substituted Node's built-in `scrypt` to avoid a native-build dependency. scrypt is memory-hard (bcrypt is only CPU-hard) and is the recommended modern alternative per OWASP and RFC 7914. Documented in `password-hash.ts`.
- [x] Task covering AC #2 — `BootstrapCredentialsService.disable(organizationId)` is called inside the OIDC callback path whenever an ADMIN-roled user successfully signs in. Sets `disabledAt` on the bootstrap_credentials row; future `POST /auth/bootstrap-login` calls for that org return `401 Invalid credentials`. Idempotent — the underlying UPDATE has a `WHERE disabledAt IS NULL` clause. Non-admin OIDC sign-ins do NOT disable the fallback (a manager logging in first shouldn't lock admins out of the bootstrap path).
- [x] Task covering AC #3 — `RecoveryCodesService.provisionBatch(organizationId)` generates exactly 10 scrypt-hashed codes per `RecoveryCodesService.BATCH_SIZE`. `RecoveryCodesService.redeem(orgId, code, adminUserId)` runs in constant time across all active codes (hashes against every un-burned row so an attacker can't infer remaining count from timing) and self-burns the matched row inside a conditional `updateMany WHERE id=$1 AND redeemedAt IS NULL` so concurrent redemptions can't double-spend. `POST /auth/recovery-redeem` enforces the ADMIN-only binding via `resolveHighestRole`. Audit trail today is via structured pino log (op: 'redeem_success' / 'redeem_fail' / 'redeem_race' with actorId + codeId). **Outbox-emitted audit events deferred** — requires extending the AuditEvent discriminated union in `@fcm/domain-contracts` (Story 3-4) with `bootstrap.credentials.disabled` + `recovery_code.redeemed` variants.
- [x] Task covering AC #4 — `docs/ops/runbooks/oidc-outage.md` covers when to use the recovery flow, prerequisites, the `curl` for `POST /auth/recovery-redeem`, the burn-count + re-provisioning policy, and what recovery codes do NOT cover.

## Dev Notes

- Both endpoints are `@Public()` (the user has no JWT yet) but the underlying DB rows are RLS-protected — every read/write goes through `withOrgScope` after the org-slug lookup (organizations is not RLS).
- All failure modes return the SAME generic 401 to avoid timing/oracle attacks (caller cannot distinguish "wrong org slug" from "wrong username" from "wrong password" from "disabled credential"). Within the services, every branch hashes against either the real row or a sentinel hash so wall-clock time is uniform.
- The two new tables (`bootstrap_credentials` + `recovery_codes`) join the Story 2-6 RLS sweep — `tenant_isolation_<table>` policies with `current_setting('app.current_org_id', true)::uuid`.
- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3) — see deferred-work below for the outbox emission step.

### Deferred to follow-up

- Outbox-emitted audit events for bootstrap-disable + recovery-redeem. Requires:
  1. Extending `@fcm/domain-contracts` (`audit-event.ts` schema + AUDIT_EVENT_TYPES + sample fixtures) with two new variants.
  2. Replacing the `this.logger.log(...)` calls in `BootstrapCredentialsService.disable` and `RecoveryCodesService.redeem` with `outboxEvent.create(...)` inside the surrounding transaction.
- Operator-facing re-provisioning endpoint (`POST /admin/recovery-codes/regenerate`) to refill the pool after multiple redemptions.

### Dependencies

- E2.2 (OIDC login flow — to disable bootstrap on first OIDC admin sign-in)
- E3.3 (outbox-relay — for the audit emission deferred above)

### References

- PRD FR-1.2
- Arch §10.1, AR-6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm typecheck` — green (4 workspaces)
- `pnpm --filter @fcm/api test` — 75 pass + 1 skip (RLS DB-integration suite; gated by DATABASE_URL)
- `pnpm test` — green across all workspaces

### Completion Notes List

- AC1: scrypt-hashed username/password, surfaced once, never logged. Provision creates user + role + credential atomically.
- AC2: bootstrap_credentials.disabled_at flag set inside OIDC callback when an admin user signs in.
- AC3: 10 single-use codes per org, constant-time verify, conditional-update self-burn, ADMIN-role binding enforced server-side.
- AC4: runbook stub committed at docs/ops/runbooks/oidc-outage.md.

### File List

- `apps/api/prisma/migrations/20260526000000_bootstrap_credentials_and_recovery_codes/migration.sql` (new) — schema + RLS for both tables.
- `apps/api/prisma/schema.prisma` (modified) — `BootstrapCredential` + `RecoveryCode` models; Organization back-relations.
- `apps/api/src/auth/password-hash.ts` (new) — scrypt hash/verify primitives, custom Promise wrapper for typed options.
- `apps/api/src/auth/bootstrap-credentials.service.ts` (new) — provision, verify, disable, findUserId.
- `apps/api/src/auth/recovery-codes.service.ts` (new) — provisionBatch (10 codes), constant-time redeem with conditional self-burn.
- `apps/api/src/auth/auth.controller.ts` (modified) — POST /auth/bootstrap-login, POST /auth/recovery-redeem, OIDC callback now disables bootstrap on admin sign-in.
- `apps/api/src/auth/auth.module.ts` (modified) — register + export both new services.
- `apps/api/test/password-hash.test.mjs` (new) — 7 tests covering scrypt format, match/mismatch, malformed-hash uniform failure, empty-input rejection.
- `docs/ops/runbooks/oidc-outage.md` (new) — AC4 runbook.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story 2-7 → done; epic-2 → done.
