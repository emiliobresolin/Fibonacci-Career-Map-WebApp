import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STALE_AFTER_MS,
  EmployeeRecalcStatusSchema,
  RECALC_STATUS_VALUES,
  nextStatus,
} from './recalc-status.js';

// ── Schema + enum surface ───────────────────────────────────────────

test('RECALC_STATUS_VALUES enumerates the four documented states', () => {
  assert.deepEqual([...RECALC_STATUS_VALUES].sort(), ['completed', 'idle', 'pending', 'stale']);
});

test('EmployeeRecalcStatusSchema parses canonical values', () => {
  for (const v of RECALC_STATUS_VALUES) {
    assert.equal(EmployeeRecalcStatusSchema.parse(v), v);
  }
});

test('EmployeeRecalcStatusSchema rejects non-canonical values', () => {
  assert.throws(() => EmployeeRecalcStatusSchema.parse('busy'));
  assert.throws(() => EmployeeRecalcStatusSchema.parse(''));
  assert.throws(() => EmployeeRecalcStatusSchema.parse(null));
});

test('DEFAULT_STALE_AFTER_MS is 60 seconds (FR-5.12)', () => {
  assert.equal(DEFAULT_STALE_AFTER_MS, 60_000);
});

// ── enqueued transitions ────────────────────────────────────────────

test('idle → pending on enqueued', () => {
  assert.equal(nextStatus('idle', { kind: 'enqueued' }), 'pending');
});

test('completed → pending on enqueued (next recalc starts)', () => {
  assert.equal(nextStatus('completed', { kind: 'enqueued' }), 'pending');
});

test('stale → pending on enqueued (re-enqueue after timeout)', () => {
  assert.equal(nextStatus('stale', { kind: 'enqueued' }), 'pending');
});

test('pending → pending on enqueued (idempotent against duplicate enqueues)', () => {
  assert.equal(nextStatus('pending', { kind: 'enqueued' }), 'pending');
});

// ── completed transitions ───────────────────────────────────────────

test('pending → completed on completed event', () => {
  assert.equal(nextStatus('pending', { kind: 'completed' }), 'completed');
});

test('idle → idle when a stale completed event arrives (no-op)', () => {
  assert.equal(nextStatus('idle', { kind: 'completed' }), 'idle');
});

test('stale → stale when a stale completed event arrives', () => {
  // This is a defensible choice: the UI may have already shown the
  // stale warning; a belated completion arrives but the snapshot data
  // is too old to trust without an explicit refresh. The orchestrator
  // can override by emitting a fresh `enqueued` first.
  assert.equal(nextStatus('stale', { kind: 'completed' }), 'stale');
});

// ── failed transitions ──────────────────────────────────────────────

test('pending → idle on failed (DLQ owns triage; UI returns to last snapshot)', () => {
  assert.equal(nextStatus('pending', { kind: 'failed' }), 'idle');
});

test('non-pending states are unaffected by failed events', () => {
  assert.equal(nextStatus('idle', { kind: 'failed' }), 'idle');
  assert.equal(nextStatus('completed', { kind: 'failed' }), 'completed');
  assert.equal(nextStatus('stale', { kind: 'failed' }), 'stale');
});

// ── tick transitions (time-based) ───────────────────────────────────

test('pending → stale when age > SLA (default 60s)', () => {
  assert.equal(nextStatus('pending', { kind: 'tick', ageMs: 60_001 }), 'stale');
});

test('pending stays pending exactly at SLA boundary (strict >)', () => {
  // The threshold uses strict `>` so the boundary tick keeps pending.
  assert.equal(nextStatus('pending', { kind: 'tick', ageMs: 60_000 }), 'pending');
});

test('pending stays pending before SLA', () => {
  assert.equal(nextStatus('pending', { kind: 'tick', ageMs: 5_000 }), 'pending');
});

test('pending → stale honors a custom SLA', () => {
  assert.equal(
    nextStatus('pending', { kind: 'tick', ageMs: 31_000 }, { staleAfterMs: 30_000 }),
    'stale',
  );
});

test('tick has no effect on non-pending states', () => {
  for (const s of ['idle', 'completed', 'stale']) {
    assert.equal(nextStatus(s, { kind: 'tick', ageMs: 1_000_000 }), s);
  }
});
