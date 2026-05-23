// Story 8-1 AC2 + AC3: EvidenceStateMachine rejects illegal transitions
// with a structured error and accepts every legal one. The transition
// graph is the single authority that every later service (8-2 finalize,
// 8-4 approve/reject, 8-6 retroactive rejection, 8-7 expiry cron) will
// gate writes through, so the exhaustive table here pins the contract.
//
// Legal edges (Arch §6.2 + PRD FR-4.4 / 4.7 / 4.8):
//   DRAFT             -> PENDING_APPROVAL
//   PENDING_APPROVAL  -> APPROVED
//   PENDING_APPROVAL  -> REJECTED
//   APPROVED          -> REJECTED
//   APPROVED          -> EXPIRED
//
// Every other (from, to) pair — including each X -> X self-edge — is
// illegal and must throw IllegalEvidenceTransitionError with the
// stable code 'ILLEGAL_EVIDENCE_TRANSITION'.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  EVIDENCE_STATES,
  LEGAL_EVIDENCE_TRANSITIONS,
  EvidenceStateMachine,
  IllegalEvidenceTransitionError,
} = await import('../dist/evidence/evidence-state-machine.js');

const LEGAL = LEGAL_EVIDENCE_TRANSITIONS.map(([from, to]) => `${from}->${to}`);

function isLegal(from, to) {
  return LEGAL.includes(`${from}->${to}`);
}

// ── AC2 / AC3: the legal transition table is exactly what's expected ──

test('AC2: EVIDENCE_STATES enumerates the five lifecycle states', () => {
  assert.deepEqual([...EVIDENCE_STATES].sort(), [
    'APPROVED',
    'DRAFT',
    'EXPIRED',
    'PENDING_APPROVAL',
    'REJECTED',
  ]);
});

test('AC2: LEGAL_EVIDENCE_TRANSITIONS table matches the architecture spec exactly', () => {
  // Five edges — fewer means a story has dropped a transition; more
  // means one was added without architectural sign-off. Either case
  // should fail this test loudly and force a re-read of PRD §6.3 / FR-4.7.
  assert.equal(LEGAL_EVIDENCE_TRANSITIONS.length, 5);
  const asSet = new Set(LEGAL);
  assert.ok(asSet.has('DRAFT->PENDING_APPROVAL'));
  assert.ok(asSet.has('PENDING_APPROVAL->APPROVED'));
  assert.ok(asSet.has('PENDING_APPROVAL->REJECTED'));
  assert.ok(asSet.has('APPROVED->REJECTED'));
  assert.ok(asSet.has('APPROVED->EXPIRED'));
});

// ── AC3: every legal transition is accepted ──────────────────────────

for (const [from, to] of LEGAL_EVIDENCE_TRANSITIONS) {
  test(`AC3 (legal): ${from} -> ${to} is accepted`, () => {
    assert.equal(EvidenceStateMachine.canTransition(from, to), true);
    // assertCanTransition must NOT throw for a legal edge.
    assert.doesNotThrow(() => EvidenceStateMachine.assertCanTransition(from, to));
  });
}

// ── AC3: every illegal transition is rejected (incl. self-transitions) ──

for (const from of EVIDENCE_STATES) {
  for (const to of EVIDENCE_STATES) {
    if (isLegal(from, to)) continue;
    test(`AC3 (illegal): ${from} -> ${to} is rejected with structured error`, () => {
      assert.equal(EvidenceStateMachine.canTransition(from, to), false);
      let caught = null;
      try {
        EvidenceStateMachine.assertCanTransition(from, to);
      } catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof IllegalEvidenceTransitionError, 'expected typed error');
      // AC2: "structured error" — the code field is the stable
      // string downstream callers branch on; from/to carry the
      // exact rejected attempt for audit reconstruction.
      assert.equal(caught.code, 'ILLEGAL_EVIDENCE_TRANSITION');
      assert.equal(caught.from, from);
      assert.equal(caught.to, to);
      // The message must name both ends — it ends up in error
      // logs when an unhandled transition slips past a caller.
      assert.match(caught.message, new RegExp(from));
      assert.match(caught.message, new RegExp(to));
    });
  }
}

// ── Pin the "terminal" property of REJECTED / EXPIRED ────────────────
//
// PRD §6.3 ambiguity: "Employee may resubmit revised evidence" — we
// interpret this as a new evidence row, NOT a state flip. The tests
// below pin that interpretation so a future change of heart shows up
// here as a deliberate edit, not a silent drift.

test('REJECTED has no outgoing legal transitions (terminal — resubmission creates a new row)', () => {
  assert.deepEqual(EvidenceStateMachine.legalNextStates('REJECTED'), []);
});

test('EXPIRED has no outgoing legal transitions (terminal — re-submitting creates a new row)', () => {
  assert.deepEqual(EvidenceStateMachine.legalNextStates('EXPIRED'), []);
});

test('DRAFT has exactly one legal next state: PENDING_APPROVAL', () => {
  assert.deepEqual(EvidenceStateMachine.legalNextStates('DRAFT'), ['PENDING_APPROVAL']);
});

test('PENDING_APPROVAL has exactly two legal next states: APPROVED, REJECTED', () => {
  assert.deepEqual(
    [...EvidenceStateMachine.legalNextStates('PENDING_APPROVAL')].sort(),
    ['APPROVED', 'REJECTED'],
  );
});

test('APPROVED has exactly two legal next states: REJECTED (retroactive), EXPIRED', () => {
  assert.deepEqual(
    [...EvidenceStateMachine.legalNextStates('APPROVED')].sort(),
    ['EXPIRED', 'REJECTED'],
  );
});
