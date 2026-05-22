# Story 6.3: SeedingService with CDF defaults

Status: done

## Story

As an Admin bootstrapping a new org,
I want the CDF defaults seeded,
so that employees can appear on the map on day one.

## Acceptance Criteria

1. `SeedingService.seedOrganization(organization_id)` creates Software Engineering L1–L5, Architecture L4–L5, Management L3–L5; Capability/Delivery/Influence layers per level; a representative requirement per layer with Fibonacci weights (1, 2, 3, 5, 8, 13, 21); default promotion rules; `visibility_default = OWN_ONLY`; `approval_workflow_default = SINGLE`; `promotion_mode = CALIBRATION`.
2. Seed is idempotent: re-running against an already-seeded org throws `AlreadySeededError` without mutating data.
3. Every seeded row emits a `configuration.seeded` audit event via the outbox.
4. Unit test covers the full seeded state.

## Tasks / Subtasks

- [x] Task covering AC #1 — `SeedingService.seedOrganization(orgId)` produces three tracks (Software Engineering / Architecture / Management), 10 levels (SE L1–L5, ARCH L4–L5, MGMT L3–L5) with non-overlapping inclusive bands `[0,49], [50,99], [100,149], [150,199], [200,249]`, 30 layers (Capability/Delivery/Influence per level), 30 representative requirements with Fibonacci weights (1/5/13 mapping to layer leverage), 10 promotion rules with `minScore = scoreBandEnd` (PRD §8.5 default). Org defaults (`visibility_default = OWN_ONLY`, `approval_workflow_default = SINGLE`, `promotion_mode = CALIBRATION`) are not written by the seeder — they're already established at provision time via Story 6-1's schema `@default(...)` markers — but the seed result echoes them so the caller can verify in one round-trip.
- [x] Task covering AC #2 — idempotency: a re-run against an already-seeded org throws `AlreadySeededError` (carries `code: 'ALREADY_SEEDED'` + `organizationId`) BEFORE any write. The detector is `tx.careerTrack.count({ where: { organizationId } }) > 0` — the cheapest stable predicate. The test pins that zero create/outbox calls happen on the bail-out path.
- [x] Task covering AC #3 — every seeded row emits exactly one `configuration.seeded` outbox event inside the SAME transaction as the row create. The new variant lives in `@fcm/domain-contracts` (`ConfigurationSeededSchema`) with `entityType: 'configuration'` + `after: { kind, name }`. The repo test reconstructs the relay's merge candidate for all 83 emitted events (3+10+30+30+10) and pins that `safeParseAuditEvent` accepts each one — a drift in the variant or in the per-row payload would surface here before reaching the relay's DLQ.
- [x] Task covering AC #4 — the seeding-service test asserts counts (3/10/30/30/10) match `CDF_EXPECTED_COUNTS`, every promotion rule's `minScore === level.scoreBandEnd`, every requirement weight ∈ {1,2,3,5,8,13,21}, layer names are exactly {Capability, Delivery, Influence}, and a separate band-overlap assertion pins that consecutive CDF_LEVELS within the same track don't share boundaries (would trip the DB-level EXCLUDE constraint). 16 tests across AC1–AC4.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2
- E6.2a

### References

- PRD §6.1, §8
- Epics §4 E6
- [Source: planning-artifacts/stories.md — index entry for this story]

### Deferred to follow-up

- **Live-DB rollback fidelity.** The seeding-service unit fake's `$transaction(fn) => fn(tx)` doesn't simulate Postgres rollback. The AC2 bail-out path is unaffected (early throw before any write), but a future regression that introduces a band overlap mid-seed would only be caught by the DATABASE_URL-gated suite. Story 6-6 (the seed/assign/fetch happy-path integration test) is the natural home for that pressure test.
- **Concurrent-seed race.** Two simultaneous `seedOrganization(sameOrgId)` calls both pass the count=0 check, both start writing, the second trips P2002 on `career_tracks_org_slug_unique` and rolls back. Net result is one clean seed + one P2002 — acceptable for a bootstrap-tooling concern, documented in operator runbook scope.
- **Optional `tx?: Prisma.TransactionClient` on repos.** Cleaner architectural pattern that would let the seeder use ConfigurationRepository / EmployeesRepository while preserving transactional atomicity. Worth a future refactor pass when more orchestrators land; today, SeedingService bypassing the repos is documented and bounded to this one privileged module.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm --filter @fcm/domain-contracts run build` — green; new ConfigurationSeededSchema compiles.
- `pnpm --filter @fcm/api run build` — green.
- `pnpm test` — 256 pass + 2 skip (api) + 43 pass (domain-contracts). 16 new tests over the 6-2b baseline of 240.
- Adversarial review — 0 BLOCKER, 0 HIGH. One non-blocking docs nit (minScore vs PRD-displayed band-end mismatch) addressed inline with a clarifying comment in `cdf-defaults.ts`.

### Completion Notes List

- AC1: full CDF data table in `cdf-defaults.ts` — operator-tunable post-seed but the bootstrap state is deterministic and PRD-aligned. Bands are encoded non-overlappingly to satisfy the EXCLUDE constraint from Story 6-2.
- AC2: idempotency via `careerTrack.count > 0` short-circuit BEFORE writes. The test asserts zero create/outbox calls on bail-out.
- AC3: 83 outbox events per seed (one per row). Each payload validates against the new `ConfigurationSeededSchema` variant — reconstructed-relay-candidate parse pinned in the unit test.
- AC4: counts + names + weights + bands pinned. Live-DB integration (post-seed → CareerTracksRepository.list returns seeded tracks) is Story 6-6's job.
- Atomicity: ONE withOrgScope transaction wraps the entire seed. The test pins `calls.scopes.length === 1`. A partial-failure mid-seed rolls back every row + every outbox row.

### File List

- `packages/domain-contracts/src/events/audit.ts` (modified) — added `ConfigurationSeededSchema` variant with `kind ∈ {career_track, level, layer, requirement, promotion_rule}`. `AUDIT_EVENT_TYPES` bumped to 16.
- `packages/domain-contracts/src/events/audit.test.ts` (modified) — added the SAMPLE + bumped the count assertion.
- `apps/api/src/seeding/cdf-defaults.ts` (new) — CDF_TRACKS (3) + CDF_LEVELS (per-track level specs, non-overlapping bands) + CDF_LAYERS (Capability/Delivery/Influence with Fibonacci weights 1/5/13 + representative-requirement specs) + CDF_EXPECTED_COUNTS pinned at (3, 10, 30, 30, 10). Header documents the PRD §7.3 vs `int4range('[]')` reconciliation AND the PRD §8.5 minScore semantics.
- `apps/api/src/seeding/seeding.service.ts` (new) — `SeedingService.seedOrganization(orgId)` with `AlreadySeededError`. One `withOrgScope` transaction; emits 83 `configuration.seeded` outbox events.
- `apps/api/src/seeding/seeding.module.ts` (new) — registers + exports `SeedingService`.
- `apps/api/src/app.module.ts` (modified) — imports `SeedingModule`.
- `apps/api/test/seeding-service.test.mjs` (new) — 16 tests: AC1 entity counts + names + bands + Fibonacci weights + org-defaults echo; AC2 AlreadySeededError + no-writes + NotFoundException; AC3 outbox emission + AuditEvent taxonomy round-trip + all 5 kinds present; AC4 count pinning vs CDF_EXPECTED_COUNTS; transactionality (one withOrgScope) + RlsInvalidOrgIdError on bad orgId + CDF data-table consistency.

### Adversarial Review Outcomes

- Band non-overlap correct under `int4range('[]')` semantics; cross-track collisions (SE L4 + ARCH L4) permitted by `career_track_id WITH =` scoping.
- Concurrent-seed race: benign (second caller sees P2002, first commits clean). Documented.
- Outbox-per-row interpretation defensible — the variant carries `kind + name` per-row so operators can grep audit_events for the exact seeded entity set.
- AuditEvent round-trip pinned for all 83 events per seed.
- Transactional atomicity structurally guaranteed (one `withOrgScope` wrap). Live-DB rollback fidelity belongs to Story 6-6.
- SeedingService bypasses ConfigurationRepository/EmployeesRepository to preserve transactional atomicity; documented architectural call.
- One docs nit fixed inline: `cdf-defaults.ts` header now explicitly reconciles PRD §7.3's displayed boundaries with the schema's `int4range('[]')` encoding AND clarifies the PRD §8.5 minScore semantics.
