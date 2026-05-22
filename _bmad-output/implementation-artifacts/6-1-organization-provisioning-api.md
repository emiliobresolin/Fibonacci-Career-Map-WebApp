# Story 6.1: Organization provisioning API

Status: done (AC4 live-DB integration test deferred — see notes)

## Story

As an Admin,
I want a one-shot provisioning endpoint,
so that a new organization appears in FCM with correct defaults.

## Acceptance Criteria

1. `POST /v1/organizations` creates an organization with `slug`, `name`, default `visibility_default = OWN_ONLY`, `approval_workflow_default = SINGLE`, `promotion_mode = CALIBRATION`.
2. The endpoint is restricted to a privileged internal role (not tenant Admin); it is called by bootstrap tooling, not by end users.
3. A successful call emits an `organization.created` audit event via the outbox.
4. Integration test asserts defaults match PRD §14.2, §14.8, §8.7.

## Tasks / Subtasks

- [x] Task covering AC #1 — `OrganizationsService.provision({ slug, name })` creates the `Organization` row inside a Prisma transaction. The PRD-mandated defaults (`visibility_default = OWN_ONLY`, `approval_workflow_default = SINGLE`, `promotion_mode = CALIBRATION`) flow from the schema's `@default` markers; the service deliberately does NOT pass them into the `create()` call, and a unit test pins that negative assertion so a future regression that removes the schema defaults wouldn't be silently re-introduced by the service.
- [x] Task covering AC #2 — `InternalProvisioningGuard` checks `X-Internal-Token` against `INTERNAL_PROVISIONING_TOKEN` (env, ≥32 chars, production-required) using `timingSafeEqual`. The endpoint carries both `@Public()` (bypasses the global `JwtAuthGuard` because there's no tenant JWT at provision time) and `@UseGuards(InternalProvisioningGuard)` — both must pass. Closed-fail when the env is unset or wrong; constant-time comparison for both equal-length and length-mismatch branches.
- [x] Task covering AC #3 — the org INSERT and the `organization.created` outbox INSERT commit in the same `$transaction`, so a rollback drops both atomically. Payload validates against the extended `AuditEvent` taxonomy (`OrganizationCreatedSchema` carries the four PRD defaults under `after`), so the relay (Story 3-3) accepts it without falling to DLQ.
- [x] Task covering AC #4 — `apps/api/test/organizations-service.test.mjs` asserts the PRD §14.2/§14.8/§8.7 defaults round-trip through the service, AND that the emitted outbox payload validates against `AuditEvent` (so the relay would persist correct defaults into `audit_events.after`). Live-DB integration of the `@default` markers themselves is **deferred** alongside the existing `DATABASE_URL`-gated integration suite (see Deferred to follow-up below).

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.6
- E3.3

### References

- Arch §5.1, §5.4
- PRD §14.2, §14.8
- [Source: planning-artifacts/stories.md — index entry for this story]

### Deferred to follow-up

- **AC4 live-DB integration test.** The unit test asserts the service propagates the PRD-mandated defaults that Prisma returns from the `@default` markers, but the fake `PrismaService` doesn't prove Postgres actually applies them. Belongs in the broader `DATABASE_URL`-gated integration suite (paired with the existing `rls-integration.test.mjs`).
- **Reserved-slug blocklist.** The slug regex allows `api`, `admin`, `auth`, etc. — fine today since slugs aren't in any URL path position, but worth a small blocklist before Story 6-4 wires the bootstrap-tooling UX. Defer to Story 6-3 SeedingService or 6-4.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm --filter @fcm/api run build` — green.
- `pnpm test` — 149 pass + 1 skip (api) + 43 pass (domain-contracts) + 0 (scoring-core) = 193 tests, no failures. The 1 skip is the existing `DATABASE_URL`-gated RLS integration suite.
- Adversarial review (general-purpose subagent) — no BLOCKER/HIGH findings; 4 documented gaps acknowledged above.

### Completion Notes List

- AC1: `OrganizationsService.provision()` creates an `Organization` row with the PRD-mandated defaults via the schema's `@default(...)` markers. The service deliberately omits the default fields from the `create()` data so defaults always flow from one source of truth (the schema); the unit test pins this negative assertion.
- AC2: `InternalProvisioningGuard` enforces a shared-secret header (`X-Internal-Token`) compared via `timingSafeEqual` to `INTERNAL_PROVISIONING_TOKEN` (env, ≥32 chars, production-required). The endpoint carries `@Public()` to bypass `JwtAuthGuard` (no tenant JWT exists at provision time) AND `@UseGuards(InternalProvisioningGuard)` so both guards run; both must pass.
- AC3: org create + outbox emit happen inside a single `prisma.$transaction(...)`. The outbox payload validates against the extended `AuditEvent` discriminated union (`OrganizationCreatedSchema`, new in this story) so the relay (Story 3-3) accepts and persists it; the test reconstructs the same merge candidate the relay uses to confirm parity.
- AC4: unit test asserts the defaults match PRD §14.2 / §14.8 / §8.7. Live-DB assertion deferred to integration suite — documented above.

### File List

- `packages/domain-contracts/src/events/audit.ts` (modified) — added `OrganizationCreatedSchema` variant + `OrganizationCreated` type + `'organization.created'` discriminator into the union and `AUDIT_EVENT_TYPES`.
- `packages/domain-contracts/src/events/audit.test.ts` (modified) — added the `organization.created` SAMPLE + bumped the schema-vs-array pin to 13.
- `apps/api/src/common/env.config.ts` (modified) — `INTERNAL_PROVISIONING_TOKEN` (≥32 chars, optional in dev/test, production-required via superRefine).
- `apps/api/src/organizations/internal-provisioning.guard.ts` (new) — `X-Internal-Token` header gate using `timingSafeEqual` + length-mismatch no-op compare. Closed-fail when env unset.
- `apps/api/src/organizations/organizations.service.ts` (new) — `provision({ slug, name })` transactional create + outbox emit. Slug regex 2–63 chars, lowercase alphanumeric + hyphen. P2002 surfaces as 409.
- `apps/api/src/organizations/organizations.controller.ts` (new) — `POST /v1/organizations`, `@Public()` + `@UseGuards(InternalProvisioningGuard)`, HTTP 201.
- `apps/api/src/organizations/organizations.module.ts` (new) — wires the controller + service + guard. Exports `OrganizationsService` for Story 6-3 SeedingService.
- `apps/api/src/app.module.ts` (modified) — imports `OrganizationsModule`.
- `apps/api/test/internal-provisioning-guard.test.mjs` (new) — 7 tests: closed-fail when env unset; 401 when header missing/wrong/wrong-length; passes on match; array-typed header; non-HTTP transport closed-fail.
- `apps/api/test/organizations-service.test.mjs` (new) — 7 tests: AC1+AC4 defaults (positive + negative pin), AC3 outbox emission, AC3 payload validates against AuditEvent taxonomy, slug shape validation, name validation, P2002→409 collision, transactional atomicity (error propagation).

### Adversarial Review Outcomes

- timingSafeEqual usage + length-mismatch no-op compare verified correct.
- Guard pipeline ordering verified: global `JwtAuthGuard` short-circuits on `@Public()`, then method-level `InternalProvisioningGuard` enforces the shared secret. Both must pass.
- Outbox payload reconstruction matches the relay's merge logic — the test reconstructs the same candidate the relay would build, and `safeParseAuditEvent` returns ok.
- RLS posture verified: `organizations` and `outbox_events` are intentionally outside the RLS perimeter (org is the tenant root; outbox is cross-tenant infrastructure). No `withOrgScope` wrapping required.
- AUDIT_EVENT_TYPES + discriminator union pin test still green (count = 13 after this story).
- Findings: 0 BLOCKER, 0 HIGH, 4 LOW/Deferred (reserved-slug list, AC4 live-DB gap, P2002 message specificity, fake `$transaction` rollback fidelity) — none blocking, all documented as deferred follow-ups.
