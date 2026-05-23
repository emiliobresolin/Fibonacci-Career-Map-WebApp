// Story 8-1 AC1: assert the evidence-table migration ships every load-bearing
// schema invariant — the EvidenceState enum + the columns named in the AC,
// the RLS sweep (Story 2-6 pattern), the FK posture, and the indexes that
// downstream stories (8-2 finalize, 8-7 expiry-scan cron, 9-1 scoring) rely
// on.
//
// We don't have a live DB in the unit-test bar; the integration-test pass
// for AC2 / RLS isolation lands when the real-DB harness ships
// (deferred follow-up — same gap as configuration-migration-shape).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  HERE,
  '..',
  'prisma',
  'migrations',
  '20260531000000_evidence_state_machine',
  'migration.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

// ── AC1: EvidenceState enum carries every state named in the AC ──

test('AC1: CREATE TYPE "EvidenceState" enumerates the five states', () => {
  assert.match(sql, /CREATE\s+TYPE\s+"EvidenceState"\s+AS\s+ENUM/i);
  for (const state of ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED']) {
    assert.match(sql, new RegExp(`'${state}'`), `EvidenceState must include '${state}'`);
  }
});

// ── AC1: evidence table + each column named in the AC ──

test('AC1: migration creates evidence table', () => {
  assert.match(sql, /CREATE TABLE\s+"evidence"/i);
});

const REQUIRED_COLUMNS = [
  // (column, expected type fragment)
  ['id', 'UUID NOT NULL'],
  ['organization_id', 'UUID NOT NULL'],
  ['employee_id', 'UUID NOT NULL'],
  ['requirement_id', 'UUID NOT NULL'],
  ['state', '"EvidenceState" NOT NULL'],
  ['payload', 'JSONB'],
  ['storage_object_key', 'TEXT'],
  ['submitted_at', 'TIMESTAMPTZ'],
  ['approved_at', 'TIMESTAMPTZ'],
  ['expires_at', 'TIMESTAMPTZ'],
  ['created_at', 'TIMESTAMPTZ NOT NULL'],
  ['updated_at', 'TIMESTAMPTZ NOT NULL'],
];

for (const [col, fragment] of REQUIRED_COLUMNS) {
  test(`AC1: evidence.${col} declared as ${fragment}`, () => {
    const blockMatch = sql.match(/CREATE TABLE\s+"evidence"([\s\S]*?);/i);
    assert.ok(blockMatch, 'could not locate CREATE TABLE block for evidence');
    const block = blockMatch[1];
    const re = new RegExp(
      `"${col}"\\s+${fragment.replace(/\s+/g, '\\s+').replace(/"/g, '"')}`,
      'i',
    );
    assert.match(block, re, `expected "${col}" ${fragment}`);
  });
}

test('AC1: state column defaults to DRAFT', () => {
  const blockMatch = sql.match(/CREATE TABLE\s+"evidence"([\s\S]*?);/i);
  assert.ok(blockMatch);
  assert.match(blockMatch[1], /"state"\s+"EvidenceState"\s+NOT\s+NULL\s+DEFAULT\s+'DRAFT'/i);
});

// ── AC1: FK posture ─────────────────────────────────────────────────

test('AC1: evidence FK to organizations CASCADEs on delete', () => {
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*"organization_id"\s*\)\s*REFERENCES\s+"organizations"\("id"\)\s+ON\s+DELETE\s+CASCADE/i,
  );
});

test('AC1: evidence FK to employees CASCADEs on delete', () => {
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*"employee_id"\s*\)\s*REFERENCES\s+"employees"\("id"\)\s+ON\s+DELETE\s+CASCADE/i,
  );
});

test('AC1: evidence FK to requirements RESTRICTs on delete (audit-trail guard)', () => {
  // RESTRICT — a requirement delete is blocked while evidence rows
  // reference it. Operators deactivate (active=false) instead. Matches
  // the employees → tracks/levels defense-in-depth pattern.
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*"requirement_id"\s*\)\s*REFERENCES\s+"requirements"\("id"\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
});

// ── AC1: state-consistency CHECK constraints ─────────────────────────

test('AC1: submitted_at CHECK — DRAFT may be unsubmitted, post-DRAFT must carry submitted_at', () => {
  assert.match(
    sql,
    /CHECK\s*\(\s*"state"\s*=\s*'DRAFT'\s+OR\s+"submitted_at"\s+IS\s+NOT\s+NULL\s*\)/i,
  );
});

test('AC1: evidence_approved_at_consistency CHECK pins approved_at NOT NULL for APPROVED and EXPIRED', () => {
  // The earlier draft of this CHECK had a load-bearing bug: the second
  // arm `state IN ('APPROVED', 'REJECTED', 'EXPIRED')` carried no
  // approved_at predicate, so an APPROVED row with approved_at IS NULL
  // would pass — the audit-read surface would then render "approved on
  // null". The corrected constraint pins APPROVED and EXPIRED to
  // approved_at IS NOT NULL explicitly and leaves REJECTED
  // unconstrained (it's reachable from PENDING_APPROVAL with NULL OR
  // from APPROVED retroactively with NOT NULL).
  const block = sql.match(/CONSTRAINT\s+"evidence_approved_at_consistency"\s+CHECK\s*\(([\s\S]*?)\)\s*(?:,|\))/i);
  assert.ok(block, 'evidence_approved_at_consistency CHECK block not found');
  const body = block[1];
  // DRAFT / PENDING_APPROVAL: approved_at IS NULL
  assert.match(
    body,
    /"state"\s+IN\s*\(\s*'DRAFT'\s*,\s*'PENDING_APPROVAL'\s*\)\s+AND\s+"approved_at"\s+IS\s+NULL/i,
    'pre-approval states must require approved_at IS NULL',
  );
  // APPROVED + EXPIRED: approved_at IS NOT NULL
  assert.match(
    body,
    /"state"\s+IN\s*\(\s*'APPROVED'\s*,\s*'EXPIRED'\s*\)\s+AND\s+"approved_at"\s+IS\s+NOT\s+NULL/i,
    'APPROVED and EXPIRED must require approved_at IS NOT NULL',
  );
  // REJECTED: unconstrained on approved_at
  assert.match(
    body,
    /"state"\s*=\s*'REJECTED'/i,
    'REJECTED arm must accept either approved_at state',
  );
  // Defense: the buggy form (state IN APPROVED,REJECTED,EXPIRED with
  // no approved_at predicate) must NOT appear.
  assert.doesNotMatch(
    body,
    /"state"\s+IN\s*\(\s*'APPROVED'\s*,\s*'REJECTED'\s*,\s*'EXPIRED'\s*\)/i,
    'buggy unconstrained predicate must not be present',
  );
});

// ── AC1: hot-path indexes for downstream stories ────────────────────

test('AC1: evidence_organization_id_idx exists (RLS predicate + tenant reads)', () => {
  assert.match(
    sql,
    /CREATE\s+INDEX\s+"evidence_organization_id_idx"\s+ON\s+"evidence"\("organization_id"\)/i,
  );
});

test('AC1: evidence_employee_state_idx exists (employee panel + scoring loader)', () => {
  assert.match(
    sql,
    /CREATE\s+INDEX\s+"evidence_employee_state_idx"\s+ON\s+"evidence"\("employee_id",\s*"state"\)/i,
  );
});

test('AC1: evidence_requirement_id_idx exists (change-impact preview path)', () => {
  assert.match(
    sql,
    /CREATE\s+INDEX\s+"evidence_requirement_id_idx"\s+ON\s+"evidence"\("requirement_id"\)/i,
  );
});

test('AC1: evidence_expiry_scan_idx is partial on (state=APPROVED AND expires_at IS NOT NULL)', () => {
  // Story 8-7's daily cron scans for "state=APPROVED AND expires_at <
  // NOW()". A partial index keeps the scan cheap as the evidence
  // table grows; without WHERE the planner reads the whole table.
  assert.match(
    sql,
    /CREATE\s+INDEX\s+"evidence_expiry_scan_idx"\s+ON\s+"evidence"\("organization_id",\s*"expires_at"\)\s+WHERE\s+"state"\s*=\s*'APPROVED'\s+AND\s+"expires_at"\s+IS\s+NOT\s+NULL/i,
  );
});

// ── AC1 + AC2 (Story 2-6 sweep): RLS posture ────────────────────────

test('Story 2-6 sweep: evidence has ENABLE + FORCE row-level security', () => {
  assert.match(sql, /ALTER TABLE\s+"evidence"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(sql, /ALTER TABLE\s+"evidence"\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test('Story 2-6 sweep: tenant_isolation_evidence policy uses closed-fail current_setting', () => {
  // The `true` second arg makes a missing GUC return NULL (row excluded)
  // — without it the GUC raises in dev and silently passes in prod.
  assert.match(
    sql,
    /CREATE POLICY\s+"tenant_isolation_evidence"\s+ON\s+"evidence"/i,
  );
  const block = sql.match(/CREATE POLICY\s+"tenant_isolation_evidence"[\s\S]*?;/i);
  assert.ok(block);
  assert.match(block[0], /USING\s*\(/i);
  assert.match(block[0], /WITH\s+CHECK\s*\(/i);
  // Both arms must use closed-fail current_setting.
  const matches = block[0].match(/current_setting\(\s*'app\.current_org_id'\s*,\s*true\s*\)/gi);
  assert.ok(matches && matches.length >= 2, 'closed-fail predicate missing from USING or WITH CHECK');
});
