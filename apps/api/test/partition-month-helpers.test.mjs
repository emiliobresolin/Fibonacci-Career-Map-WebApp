// Unit tests for the pure date helpers used by the partition-maintenance
// consumer. These are deterministic and run without a DB.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import from the compiled dist (test:scaffold builds first).
const { nextMonths, nextMonthYM, LOOKAHEAD_MONTHS } = await import(
  '../dist/partitions/partition-maintenance.consumer.js'
);

test('LOOKAHEAD_MONTHS is 3 (Arch §6.4 / AR-8)', () => {
  assert.equal(LOOKAHEAD_MONTHS, 3);
});

test('nextMonthYM rolls over December → January of next year', () => {
  assert.deepEqual(nextMonthYM(2026, 12), [2027, 1]);
});

test('nextMonthYM increments month within a year', () => {
  assert.deepEqual(nextMonthYM(2026, 5), [2026, 6]);
  assert.deepEqual(nextMonthYM(2026, 11), [2026, 12]);
});

test('nextMonths returns N consecutive (year, month) tuples from an anchor', () => {
  const anchor = new Date('2026-05-21T00:00:00Z');
  const result = nextMonths(anchor, 3);
  assert.deepEqual(result, [
    { year: 2026, month: 5 },
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
  ]);
});

test('nextMonths handles year boundaries correctly', () => {
  const anchor = new Date('2026-11-15T00:00:00Z');
  const result = nextMonths(anchor, 4);
  assert.deepEqual(result, [
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
    { year: 2027, month: 2 },
  ]);
});

test('nextMonths uses UTC month — not local time — so a non-UTC operator gets the same answer', () => {
  // A date that's late-night local time on the 31st may be the 1st of
  // the next month in UTC. We always use UTC.
  const anchor = new Date(Date.UTC(2026, 4, 1, 0, 0, 0)); // 2026-05-01 UTC
  const result = nextMonths(anchor, 1);
  assert.deepEqual(result, [{ year: 2026, month: 5 }]);
});

test('nextMonths with count=0 returns an empty array', () => {
  const result = nextMonths(new Date(), 0);
  assert.deepEqual(result, []);
});
