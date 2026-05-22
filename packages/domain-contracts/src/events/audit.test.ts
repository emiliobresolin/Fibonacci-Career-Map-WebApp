// Story 3-4 AC4: round-trip encode/decode for every discriminated variant
// + rejection of malformed payloads.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIT_EVENT_TYPES,
  AuditEventSchema,
  parseAuditEvent,
  safeParseAuditEvent,
  type AuditEvent,
} from './audit.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';
const UUID_D = '44444444-4444-4444-8444-444444444444';
const UUID_E = '55555555-5555-4555-8555-555555555555';
const UUID_F = '66666666-6666-4666-8666-666666666666';
const TS = '2026-05-21T12:34:56.000Z';

function base(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    eventId: UUID_A,
    occurredAt: TS,
    actorId: UUID_B,
    organizationId: UUID_C,
    entityId: UUID_D,
    ...extra,
  };
}

const SAMPLES: Record<string, AuditEvent> = {
  'evidence.submitted': base({
    eventType: 'evidence.submitted',
    entityType: 'evidence',
    reason: null,
    before: null,
    after: { evidenceId: UUID_D, requirementId: UUID_E, employeeId: UUID_F },
  }) as AuditEvent,
  'evidence.approved': base({
    eventType: 'evidence.approved',
    entityType: 'evidence',
    reason: 'Looks good',
    before: { evidenceId: UUID_D, employeeId: UUID_E, beforeScore: 100 },
    after: { afterScore: 120 },
  }) as AuditEvent,
  'evidence.rejected': base({
    eventType: 'evidence.rejected',
    entityType: 'evidence',
    reason: 'Insufficient detail',
    before: null,
    after: { evidenceId: UUID_D, employeeId: UUID_E },
  }) as AuditEvent,
  'score.recalculated': base({
    eventType: 'score.recalculated',
    entityType: 'score_snapshot',
    reason: null,
    before: { employeeId: UUID_D, triggeringEventId: UUID_E, beforeSnapshotId: null },
    after: { afterSnapshotId: UUID_F },
  }) as AuditEvent,
  'configuration.changed': base({
    eventType: 'configuration.changed',
    entityType: 'configuration',
    reason: 'Quarterly tuning',
    before: { configEntityType: 'level', configEntityId: UUID_D, field: 'name', beforeValue: 'old' },
    after: { afterValue: 'new' },
  }) as AuditEvent,
  'promotion.initiated': base({
    eventType: 'promotion.initiated',
    entityType: 'promotion',
    reason: null,
    before: null,
    after: { employeeId: UUID_D, fromLevelId: UUID_E, toLevelId: UUID_F },
  }) as AuditEvent,
  'promotion.decided': base({
    eventType: 'promotion.decided',
    entityType: 'promotion',
    reason: 'Meets all criteria',
    before: { employeeId: UUID_D },
    after: { decision: 'APPROVED' },
  }) as AuditEvent,
  'promotion.completed': base({
    eventType: 'promotion.completed',
    entityType: 'promotion',
    reason: null,
    before: { employeeId: UUID_D, fromLevelId: UUID_E },
    after: { toLevelId: UUID_F, finalScore: 250, finalEvidenceIds: [UUID_D, UUID_E] },
  }) as AuditEvent,
  'role_assignment.changed': base({
    eventType: 'role_assignment.changed',
    entityType: 'role_assignment',
    reason: 'Promotion to manager',
    before: { targetUserId: UUID_D, fromRole: 'EMPLOYEE' },
    after: { toRole: 'MANAGER' },
  }) as AuditEvent,
  'visibility_rule.changed': base({
    eventType: 'visibility_rule.changed',
    entityType: 'visibility_rule',
    reason: null,
    before: { fromSetting: 'OWN_ONLY' },
    after: { toSetting: 'TEAM' },
  }) as AuditEvent,
  'approval_workflow.changed': base({
    eventType: 'approval_workflow.changed',
    entityType: 'approval_workflow',
    reason: null,
    before: { fromKind: 'SINGLE' },
    after: { toKind: 'DUAL_MANAGER' },
  }) as AuditEvent,
  'session.revoked': base({
    eventType: 'session.revoked',
    entityType: 'session',
    reason: 'Admin-initiated forced logout',
    before: { targetUserId: UUID_D, revokedSessionCount: 2 },
    after: null,
  }) as AuditEvent,
  'blocker.opened': base({
    eventType: 'blocker.opened',
    entityType: 'employee_blocker',
    reason: 'Active PIP — see HR ticket TKT-12345 for details',
    before: null,
    after: { employeeId: UUID_D, kind: 'PIP' },
  }) as AuditEvent,
  'blocker.resolved': base({
    eventType: 'blocker.resolved',
    entityType: 'employee_blocker',
    reason: 'HR concluded the PIP successfully',
    before: { employeeId: UUID_D, kind: 'PIP' },
    after: null,
  }) as AuditEvent,
  'configuration.seeded': base({
    eventType: 'configuration.seeded',
    entityType: 'configuration',
    actorId: null,
    reason: null,
    before: null,
    after: { kind: 'career_track', name: 'Software Engineering' },
  }) as AuditEvent,
  'organization.created': base({
    // Story 6-1: bootstrap-tooling provisioning event. actorId is null
    // because the org has no users when the row is created.
    eventType: 'organization.created',
    entityType: 'organization',
    actorId: null,
    reason: null,
    before: null,
    after: {
      slug: 'acme',
      name: 'Acme Corp',
      visibilityDefault: 'OWN_ONLY',
      approvalWorkflowDefault: 'SINGLE',
      promotionMode: 'CALIBRATION',
    },
  }) as AuditEvent,
  'bootstrap_admin.provisioned': base({
    // Story 6-4: emitted when the bootstrap flow creates the first ADMIN
    // user + credential. actorId is null — bootstrap is internal tooling,
    // not a tenant user.
    eventType: 'bootstrap_admin.provisioned',
    entityType: 'bootstrap_credential',
    actorId: null,
    reason: null,
    before: null,
    after: { userId: UUID_D, username: 'bootstrap-admin@acme1234' },
  }) as AuditEvent,
  'bootstrap_admin.disabled': base({
    // Story 6-4 AC2: emitted when the first OIDC-linked ADMIN sign-in
    // auto-retires the bootstrap fallback. actorId is the OIDC admin
    // who triggered the retirement.
    eventType: 'bootstrap_admin.disabled',
    entityType: 'bootstrap_credential',
    reason: null,
    before: { username: 'bootstrap-admin@acme1234' },
    after: null,
  }) as AuditEvent,
  'recovery_codes.provisioned': base({
    // Story 6-4: bootstrap-batch issuance of 10 OIDC-outage recovery
    // codes. Org-scope event — entityId is null because the batch is
    // not a single row.
    eventType: 'recovery_codes.provisioned',
    entityType: 'recovery_code',
    actorId: null,
    entityId: null,
    reason: null,
    before: null,
    after: { count: 10 },
  }) as AuditEvent,
};

test('AUDIT_EVENT_TYPES enumerates exactly the variants of the discriminated union', () => {
  // Every variant in the schema must be present in the const array, and
  // vice versa — pinning the contract.
  const schemaTypes = new Set(AuditEventSchema.options.map((o) => o.shape.eventType.value));
  const arrayTypes = new Set(AUDIT_EVENT_TYPES);
  assert.deepEqual(
    [...schemaTypes].sort(),
    [...arrayTypes].sort(),
    'AUDIT_EVENT_TYPES drift from AuditEventSchema discriminator',
  );
  assert.equal(
    arrayTypes.size,
    19,
    'PRD §10.1 (11) + session.revoked (Story 2-3) + organization.created (Story 6-1) + blocker.opened/resolved (Story 6-2b) + configuration.seeded (Story 6-3) + bootstrap_admin.provisioned/disabled + recovery_codes.provisioned (Story 6-4) = 19',
  );
});

test('every PRD §10.1 event type has a valid sample + round-trips through parseAuditEvent', () => {
  for (const eventType of AUDIT_EVENT_TYPES) {
    const sample = SAMPLES[eventType];
    if (!sample) {
      assert.fail(`missing sample for ${eventType}`);
    }
    const parsed = parseAuditEvent(sample);
    assert.equal(parsed.eventType, eventType, `eventType discriminator must round-trip for ${eventType}`);
    assert.equal(parsed.eventId, sample.eventId, `eventId must round-trip for ${eventType}`);
  }
});

test('safeParseAuditEvent returns { ok: true } on valid input', () => {
  const result = safeParseAuditEvent(SAMPLES['evidence.approved']);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.event.eventType, 'evidence.approved');
  }
});

test('safeParseAuditEvent rejects when eventType is unknown', () => {
  const result = safeParseAuditEvent({
    ...SAMPLES['evidence.approved'],
    eventType: 'something.unknown',
  });
  assert.equal(result.ok, false);
});

test('safeParseAuditEvent rejects when eventId is not a UUID', () => {
  const result = safeParseAuditEvent({ ...SAMPLES['evidence.approved'], eventId: 'not-a-uuid' });
  assert.equal(result.ok, false);
});

test('safeParseAuditEvent rejects when occurredAt is not an ISO timestamp', () => {
  const result = safeParseAuditEvent({ ...SAMPLES['evidence.approved'], occurredAt: 'tomorrow' });
  assert.equal(result.ok, false);
});

test('evidence.approved REQUIRES a non-empty reason (PRD §10.1)', () => {
  const result = safeParseAuditEvent({ ...SAMPLES['evidence.approved'], reason: '' });
  assert.equal(result.ok, false);
});

test('evidence.rejected REQUIRES a non-empty reason (PRD §10.1)', () => {
  const result = safeParseAuditEvent({ ...SAMPLES['evidence.rejected'], reason: null });
  assert.equal(result.ok, false);
});

test('promotion.decided REQUIRES a non-empty reason (PRD §10.1)', () => {
  const result = safeParseAuditEvent({ ...SAMPLES['promotion.decided'], reason: '' });
  assert.equal(result.ok, false);
});

test('actorId may be null (system events) but must be a UUID otherwise', () => {
  const okNull = safeParseAuditEvent({ ...SAMPLES['score.recalculated'], actorId: null });
  assert.equal(okNull.ok, true);
  const badShape = safeParseAuditEvent({ ...SAMPLES['score.recalculated'], actorId: 'not-uuid' });
  assert.equal(badShape.ok, false);
});

test('entityId nullable for org-scope events (visibility_rule.changed has null entityId)', () => {
  const result = safeParseAuditEvent({ ...SAMPLES['visibility_rule.changed'], entityId: null });
  assert.equal(result.ok, true);
});

test('discriminator narrows the payload — supplying a different variant\'s before fails', () => {
  // evidence.approved expects before.evidenceId + before.employeeId + before.beforeScore.
  // Hand it the score.recalculated before shape — must fail.
  const result = safeParseAuditEvent({
    ...SAMPLES['evidence.approved'],
    before: { employeeId: UUID_D, triggeringEventId: UUID_E, beforeSnapshotId: null },
  });
  assert.equal(result.ok, false);
});
