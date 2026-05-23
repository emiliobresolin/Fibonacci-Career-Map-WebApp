// Story 8-2 — pure key helpers: build, parse, scope-check.
// These are the AC3 forbidden-scope predicate's building blocks; the
// services layer routes a misscoped key through the same isKeyInOrgScope
// check, so the unit coverage here is load-bearing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildEvidenceKey,
  isKeyInOrgScope,
  parseEvidenceKey,
  validateFilename,
  InvalidEvidenceKeyError,
  EVIDENCE_FILENAME_MAX,
} = await import('../dist/evidence/evidence-key.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const ORG2 = '22222222-2222-4222-8222-222222222222';
const EMP = '33333333-3333-4333-8333-333333333333';
const EV = '44444444-4444-4444-8444-444444444444';

// ── buildEvidenceKey ──────────────────────────────────────────────

test('buildEvidenceKey produces the canonical shape', () => {
  const key = buildEvidenceKey({
    organizationId: ORG,
    employeeId: EMP,
    evidenceId: EV,
    filename: 'report.pdf',
  });
  assert.equal(key, `org/${ORG}/evidence/${EMP}/${EV}/report.pdf`);
});

test('buildEvidenceKey rejects a non-UUID orgId', () => {
  assert.throws(
    () =>
      buildEvidenceKey({
        organizationId: 'not-a-uuid',
        employeeId: EMP,
        evidenceId: EV,
        filename: 'x.pdf',
      }),
    InvalidEvidenceKeyError,
  );
});

test('buildEvidenceKey rejects path-traversal filename', () => {
  for (const bad of ['../escape.pdf', 'foo/bar.pdf', '.', '..', 'has space.pdf', '$pwn.exe', '']) {
    assert.throws(
      () =>
        buildEvidenceKey({
          organizationId: ORG,
          employeeId: EMP,
          evidenceId: EV,
          filename: bad,
        }),
      InvalidEvidenceKeyError,
      `expected reject for filename=${JSON.stringify(bad)}`,
    );
  }
});

test('validateFilename rejects strings over the cap', () => {
  const tooLong = 'a'.repeat(EVIDENCE_FILENAME_MAX + 1);
  assert.throws(() => validateFilename(tooLong), InvalidEvidenceKeyError);
});

test('validateFilename accepts dotted + underscored + hyphenated names', () => {
  for (const ok of ['report.pdf', 'my-report.pdf', 'my_report.pdf', 'a.b.c.pdf', 'file123']) {
    assert.equal(validateFilename(ok), ok, `expected accept for ${ok}`);
  }
});

// ── isKeyInOrgScope (AC3 predicate) ───────────────────────────────

test('AC3: isKeyInOrgScope accepts a key under the matching org', () => {
  const key = `org/${ORG}/evidence/${EMP}/${EV}/x.pdf`;
  assert.equal(isKeyInOrgScope(key, ORG), true);
});

test('AC3: isKeyInOrgScope rejects a key under a DIFFERENT org', () => {
  const key = `org/${ORG2}/evidence/${EMP}/${EV}/x.pdf`;
  assert.equal(isKeyInOrgScope(key, ORG), false);
});

test('AC3: isKeyInOrgScope rejects a path-traversal attempt with org embedded later', () => {
  // An attacker key that contains the actor's org_id in a NON-prefix
  // position must NOT pass — the predicate is anchored to the start.
  const sneaky = `org/${ORG2}/evidence/${EMP}/${EV}/../../../${ORG}/x.pdf`;
  assert.equal(isKeyInOrgScope(sneaky, ORG), false);
});

test('AC3: isKeyInOrgScope rejects keys missing the "evidence/" segment', () => {
  // A key that's only `org/<id>/foo` lands under the right org prefix
  // by accident if we don't require the literal `evidence/` next
  // segment. The predicate must reject.
  const wrong = `org/${ORG}/other/${EMP}/${EV}/x.pdf`;
  assert.equal(isKeyInOrgScope(wrong, ORG), false);
});

test('AC3: isKeyInOrgScope rejects empty / non-string keys + malformed orgIds', () => {
  assert.equal(isKeyInOrgScope('', ORG), false);
  assert.equal(isKeyInOrgScope('org/' + ORG + '/evidence/x', 'not-a-uuid'), false);
  assert.equal(isKeyInOrgScope(null, ORG), false);
  assert.equal(isKeyInOrgScope(undefined, ORG), false);
  assert.equal(isKeyInOrgScope(123, ORG), false);
});

// ── parseEvidenceKey ──────────────────────────────────────────────

test('parseEvidenceKey returns components for a canonical key', () => {
  const key = `org/${ORG}/evidence/${EMP}/${EV}/report.pdf`;
  assert.deepEqual(parseEvidenceKey(key), {
    organizationId: ORG,
    employeeId: EMP,
    evidenceId: EV,
    filename: 'report.pdf',
  });
});

test('parseEvidenceKey returns null for too-many-segments', () => {
  const sneaky = `org/${ORG}/evidence/${EMP}/${EV}/sub/file.pdf`;
  assert.equal(parseEvidenceKey(sneaky), null);
});

test('parseEvidenceKey returns null for wrong static segments', () => {
  assert.equal(parseEvidenceKey(`foo/${ORG}/evidence/${EMP}/${EV}/x.pdf`), null);
  assert.equal(parseEvidenceKey(`org/${ORG}/other/${EMP}/${EV}/x.pdf`), null);
});
