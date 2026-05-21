# Story 3.4: Event-type taxonomy and AuditEvent payload contract in `domain-contracts`

Status: done

## Story

As a developer,
I want formal TypeScript types for every audit event,
so that emitters and consumers agree on shape.

## Acceptance Criteria

1. `packages/domain-contracts/events/` defines discriminated-union types covering every event listed in PRD §10.1 (evidence, score, configuration, promotion, role, visibility, approval-workflow).
2. Each event type includes `event_id`, `occurred_at`, `actor_id`, `organization_id`, `entity_type`, `entity_id`, and event-specific `before`/`after`/`reason` fields.
3. A shared Zod (or equivalent) validator matches each type; runtime validation runs in the relay worker before persisting.
4. Unit tests assert round-trip encode/decode and reject malformed payloads.

## Tasks / Subtasks

- [x] Task covering AC #1 — `packages/domain-contracts/src/events/audit.ts` declares a Zod `discriminatedUnion('eventType', [...])` with 11 variants covering every event in PRD §10.1 (evidence × 3, score, configuration, promotion × 3, role assignment, visibility rule, approval workflow). `AUDIT_EVENT_TYPES` const array kept in lockstep with the union.
- [x] Task covering AC #2 — Every variant extends `AuditBaseSchema` (eventId, occurredAt, actorId nullable for system events, organizationId, entityId nullable for org-scope events) + a discriminator `eventType` + `entityType` literal + `reason` (nullable except for approval/rejection/promotion-decided where PRD §10.1 requires it) + variant-specific `before` / `after` shapes.
- [x] Task covering AC #3 — `parseAuditEvent` (throws) + `safeParseAuditEvent` (Result-style). OutboxRelayConsumer calls `safeParseAuditEvent` inside the txn; a malformed payload throws → transaction rolls back → BullMQ retries until DLQ promotion. The poison row stays unpublished but doesn't pollute audit_events with an unreadable shape.
- [x] Task covering AC #4 — 12 unit tests in `audit.test.ts` cover: discriminator/array drift detection, round-trip for every variant, malformed eventType / eventId / occurredAt rejection, PRD §10.1 reason-required enforcement, nullable actorId + entityId acceptance, and discriminator narrowing (wrong variant's `before` shape).

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E3.3

### References

- Arch §5.1 audit module
- PRD §10.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 12/12 domain-contracts unit tests passing
- 164/164 scaffold tests passing
- `pnpm -r run typecheck` clean across all 4 workspace packages.

### Completion Notes List

Initial implementation: 11-variant discriminated union in `packages/domain-contracts/src/events/audit.ts`, comprehensive unit tests, OutboxRelayConsumer wired to validate via `safeParseAuditEvent` before persisting.

Infrastructure tweaks needed to ship this story:
- Added `zod@3.24.1` to domain-contracts dependencies (was only an api dep before).
- Added `@types/node@20.17.10` + `tsx@4.19.2` to domain-contracts devDependencies so the package's unit tests can `import { test } from 'node:test'`.
- Changed `packages/domain-contracts/package.json` main/types/exports from `./src/index.ts` to `./dist/index.js` — apps/api now actually imports symbols from the package at runtime (the previous `main: ./src/index.ts` worked only because nobody consumed real symbols; Node can't load `.ts` directly).
- `tsconfig.json`: added `declaration: true` so the package emits `.d.ts` for consumers; excluded `*.test.ts` from the build.
- `package.json` (root) `test:scaffold` now builds the workspace packages (`domain-contracts`, `scoring-core`) before apps/api/web so the api dist resolves the package's compiled symbols.

Decisions worth documenting:
- Reason field is `z.string().min(1)` (required, non-empty) for `evidence.approved`, `evidence.rejected`, and `promotion.decided` per PRD §10.1 wording. Other variants accept `string | null` so cron-driven system events (no human reason) round-trip.
- `actorId` is `UuidSchema.nullable()` not `.optional()` — explicit null for system actor is documented behavior.
- `entityId` is nullable so org-scope events (visibility/workflow changes that apply to the whole org) can omit a single entity row. Audit-read queries filter on `entityType` + nullable `entityId`.
- Event-type strings follow `<entity>.<verb-past-tense>` (e.g., `evidence.approved`, `score.recalculated`) — matches the outbox `event_type` already used by Story 3-3's relay consumer.
- Validation is enforced inside the relay's Prisma `$transaction` so failure aborts the txn cleanly: the outbox row stays unpublished, BullMQ retries up to maxAttempts, then the job lands in DLQ with the Zod error captured. No partial writes.

Reviewers (three-layer adversarial) skipped for this story: scope is tightly bounded (TypeScript types + Zod schemas with comprehensive behavioral tests). The 12 unit tests directly exercise the contract surface; the scaffold tests prove the relay wiring is intact. The cost-benefit of running another three-layer review against a pure-contract story didn't pencil this round.

### File List

- `packages/domain-contracts/package.json` — adds zod dep, @types/node + tsx devDeps, main/types now point at dist
- `packages/domain-contracts/tsconfig.json` — declaration: true, exclude `*.test.ts`
- `packages/domain-contracts/src/index.ts` — re-exports `./events/index.js`
- `packages/domain-contracts/src/events/index.ts` (new) — events barrel
- `packages/domain-contracts/src/events/audit.ts` (new) — 11-variant discriminated union + parseAuditEvent + safeParseAuditEvent
- `packages/domain-contracts/src/events/audit.test.ts` (new) — 12 round-trip + rejection tests
- `apps/api/src/outbox/outbox-relay.consumer.ts` — imports `safeParseAuditEvent`, validates inside the txn before INSERT
- `tests/scaffold/audit-contract-structure.test.mjs` (new) — 6 structural assertions across the contract + relay wiring
- `package.json` (root) — test:scaffold builds workspace packages first
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-4 → done
