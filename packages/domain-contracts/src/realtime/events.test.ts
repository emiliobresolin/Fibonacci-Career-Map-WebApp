import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REALTIME_EVENT_TYPES,
  RealtimeEventSchema,
  safeParseRealtimeEvent,
} from './events.js';
import {
  filterForRecipient,
  type RecipientContext,
  type VisibilityKind,
} from './visibility-filter.js';

const ORG_X = '11111111-1111-1111-1111-111111111111';
const ORG_Y = '22222222-2222-2222-2222-222222222222';
const EMP_1 = '33333333-3333-3333-3333-333333333333';
const EMP_2 = '44444444-4444-4444-4444-444444444444';
const USER = '55555555-5555-5555-5555-555555555555';

const BASE = {
  organizationId: ORG_X,
  occurredAt: '2026-05-22T10:00:00Z',
  correlation_id: 'corr-1',
};

function recipient(
  partial: Partial<RecipientContext> & { visibilityKind: VisibilityKind; role: RecipientContext['role'] },
): RecipientContext {
  return {
    user_id: USER,
    organization_id: ORG_X,
    directReportEmployeeIds: new Set(),
    ...partial,
  };
}

// ── REALTIME_EVENT_TYPES + Zod parity ───────────────────────────────

test('REALTIME_EVENT_TYPES enumerates exactly the variants of the discriminated union', () => {
  const optionLiterals = RealtimeEventSchema.options.map((o) => o.shape.eventType.value).sort();
  assert.deepEqual([...REALTIME_EVENT_TYPES].sort(), optionLiterals);
});

test('safeParseRealtimeEvent accepts a well-formed snapshot.updated', () => {
  const e = {
    ...BASE,
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 0.62, readinessPercent: 71, promotionEligible: false },
  };
  const r = safeParseRealtimeEvent(e);
  assert.equal(r.ok, true);
});

test('safeParseRealtimeEvent rejects unknown eventType', () => {
  const r = safeParseRealtimeEvent({ ...BASE, eventType: 'mystery.event' });
  assert.equal(r.ok, false);
});

test('safeParseRealtimeEvent rejects non-uuid organizationId', () => {
  const r = safeParseRealtimeEvent({
    ...BASE,
    organizationId: 'not-a-uuid',
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 1, readinessPercent: 100, promotionEligible: true },
  });
  assert.equal(r.ok, false);
});

// ── filterForRecipient — cross-org isolation ────────────────────────

test('cross-org: event for ORG_X suppressed for recipient in ORG_Y', () => {
  const ev = {
    ...BASE,
    organizationId: ORG_Y,
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 0.5, readinessPercent: 50, promotionEligible: false },
  };
  const v = filterForRecipient(ev, recipient({ visibilityKind: 'ORG_FULL', role: 'ADMIN' }));
  assert.equal(v.kind, 'suppress');
  if (v.kind === 'suppress') assert.equal(v.reason, 'cross_org');
});

// ── ADMIN sees everything ──────────────────────────────────────────

test('ADMIN with any visibilityKind sees employee events', () => {
  const ev = {
    ...BASE,
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 0.5, readinessPercent: 50, promotionEligible: false },
  };
  const v = filterForRecipient(ev, recipient({ visibilityKind: 'OWN_ONLY', role: 'ADMIN' }));
  assert.equal(v.kind, 'allow');
});

// ── Org-scope events broadcast to all roles ────────────────────────

test('config.changed always allowed for in-org recipients regardless of visibilityKind', () => {
  const ev = {
    ...BASE,
    eventType: 'config.changed',
    configurationAggregate: 'level',
    aggregateId: EMP_1,
  };
  const v = filterForRecipient(ev, recipient({ visibilityKind: 'OWN_ONLY', role: 'EMPLOYEE' }));
  assert.equal(v.kind, 'allow');
});

// ── OWN_ONLY ───────────────────────────────────────────────────────

test('OWN_ONLY allows when recipient is the subject employee', () => {
  const ev = {
    ...BASE,
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 0.5, readinessPercent: 50, promotionEligible: false },
  };
  const v = filterForRecipient(
    ev,
    recipient({
      visibilityKind: 'OWN_ONLY',
      role: 'EMPLOYEE',
      directReportEmployeeIds: new Set([EMP_1]),
    }),
  );
  assert.equal(v.kind, 'allow');
});

test('OWN_ONLY suppresses when recipient is NOT the subject employee', () => {
  const ev = {
    ...BASE,
    eventType: 'snapshot.updated',
    employeeId: EMP_2,
    summary: { scoreProgress: 0.5, readinessPercent: 50, promotionEligible: false },
  };
  const v = filterForRecipient(ev, recipient({ visibilityKind: 'OWN_ONLY', role: 'EMPLOYEE' }));
  assert.equal(v.kind, 'suppress');
});

// ── TEAM ───────────────────────────────────────────────────────────

test('TEAM allows manager-of when subject is a direct report', () => {
  const ev = {
    ...BASE,
    eventType: 'evidence.approved',
    evidenceId: EMP_2,
    employeeId: EMP_1,
  };
  const v = filterForRecipient(
    ev,
    recipient({
      visibilityKind: 'TEAM',
      role: 'MANAGER',
      directReportEmployeeIds: new Set([EMP_1]),
    }),
  );
  assert.equal(v.kind, 'allow');
});

test('TEAM suppresses for manager when subject is not a direct report', () => {
  const ev = {
    ...BASE,
    eventType: 'evidence.approved',
    evidenceId: EMP_2,
    employeeId: EMP_1,
  };
  const v = filterForRecipient(
    ev,
    recipient({ visibilityKind: 'TEAM', role: 'MANAGER' }),
  );
  assert.equal(v.kind, 'suppress');
});

// ── ORG_SUMMARY → allow_pruned ─────────────────────────────────────

test('ORG_SUMMARY returns allow_pruned for employee events', () => {
  const ev = {
    ...BASE,
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 0.5, readinessPercent: 50, promotionEligible: false },
  };
  const v = filterForRecipient(
    ev,
    recipient({ visibilityKind: 'ORG_SUMMARY', role: 'EMPLOYEE' }),
  );
  assert.equal(v.kind, 'allow_pruned');
});

test('ORG_FULL allows employee events as-is', () => {
  const ev = {
    ...BASE,
    eventType: 'snapshot.updated',
    employeeId: EMP_1,
    summary: { scoreProgress: 0.5, readinessPercent: 50, promotionEligible: false },
  };
  const v = filterForRecipient(
    ev,
    recipient({ visibilityKind: 'ORG_FULL', role: 'EMPLOYEE' }),
  );
  assert.equal(v.kind, 'allow');
});
