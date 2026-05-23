// Story 8-4 AC1: approval_records migration ships the load-bearing
// invariants — table shape, exclusive XOR FK, reason-length CHECK,
// RLS sweep, append-only trigger + fcm_app role lockdown.

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
  '20260602000000_approval_records',
  'migration.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

test('AC1: migration creates approval_records table', () => {
  assert.match(sql, /CREATE TABLE\s+"approval_records"/i);
});

test('AC1: ApprovalDecision enum with APPROVED + REJECTED', () => {
  assert.match(sql, /CREATE\s+TYPE\s+"ApprovalDecision"\s+AS\s+ENUM/i);
  assert.match(sql, /'APPROVED'/i);
  assert.match(sql, /'REJECTED'/i);
});

const REQUIRED_COLUMNS = [
  ['id', 'UUID NOT NULL'],
  ['organization_id', 'UUID NOT NULL'],
  ['evidence_id', 'UUID'],
  ['promotion_record_id', 'UUID'],
  ['actor_id', 'UUID NOT NULL'],
  ['decision', '"ApprovalDecision" NOT NULL'],
  ['reason', 'TEXT NOT NULL'],
  ['decided_at', 'TIMESTAMPTZ NOT NULL'],
];

for (const [col, fragment] of REQUIRED_COLUMNS) {
  test(`AC1: approval_records.${col} declared as ${fragment}`, () => {
    const blockMatch = sql.match(/CREATE TABLE\s+"approval_records"([\s\S]*?);/i);
    assert.ok(blockMatch);
    const block = blockMatch[1];
    const re = new RegExp(`"${col}"\\s+${fragment.replace(/\s+/g, '\\s+')}`, 'i');
    assert.match(block, re, `expected "${col}" ${fragment}`);
  });
}

test('AC1: evidence_id FK CASCADEs on delete', () => {
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*"evidence_id"\s*\)\s*REFERENCES\s+"evidence"\("id"\)\s+ON\s+DELETE\s+CASCADE/i,
  );
});

test('AC1: actor_id FK RESTRICTs on delete (preserves attribution)', () => {
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*"actor_id"\s*\)\s*REFERENCES\s+"users"\("id"\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
});

test('AC1: NO FK on promotion_record_id (parent table lands in Epic 13)', () => {
  // The column exists but no FK constraint references it — the
  // promotion_records table is Epic 13. A 13-X migration will add
  // the FK then. The CHECK below enforces row-level exclusivity in
  // the meantime.
  assert.doesNotMatch(
    sql,
    /FOREIGN KEY\s*\(\s*"promotion_record_id"\s*\)/i,
    'promotion_record_id FK should be deferred until promotion_records exists',
  );
});

test('AC1: exactly-one-parent CHECK (XOR evidence_id vs promotion_record_id)', () => {
  const block = sql.match(
    /CONSTRAINT\s+"approval_records_exactly_one_parent"\s+CHECK\s*\(([\s\S]*?)\)\s*,/i,
  );
  assert.ok(block);
  const body = block[1];
  assert.match(
    body,
    /"evidence_id"\s+IS\s+NOT\s+NULL\s+AND\s+"promotion_record_id"\s+IS\s+NULL/i,
  );
  assert.match(
    body,
    /"evidence_id"\s+IS\s+NULL\s+AND\s+"promotion_record_id"\s+IS\s+NOT\s+NULL/i,
  );
});

test('AC1: reason-length CHECK uses btrim so whitespace-only payloads cannot pass', () => {
  // M2 (post-review fix): without btrim, ten spaces would satisfy
  // `char_length(reason) >= 10` and pass the APPROVED CHECK even
  // though the reason is semantically empty. btrim strips leading/
  // trailing whitespace before the length comparison.
  //
  // Match the predicate against the whole SQL — extracting the
  // CHECK body with a regex is brittle when the body contains
  // nested parens, so just assert the predicate strings appear at
  // top level. The constraint name is the load-bearing anchor
  // (someone replacing the constraint must change the name too,
  // which trips the earlier presence assertion).
  assert.match(sql, /CONSTRAINT\s+"approval_records_reason_min_length"\s+CHECK/i);
  assert.match(
    sql,
    /"decision"\s*=\s*'APPROVED'\s+AND\s+char_length\(\s*btrim\(\s*"reason"\s*\)\s*\)\s*>=\s*10/i,
    'APPROVED arm must require btrim(reason) ≥ 10',
  );
  assert.match(
    sql,
    /"decision"\s*=\s*'REJECTED'\s+AND\s+char_length\(\s*btrim\(\s*"reason"\s*\)\s*\)\s*>=\s*20/i,
    'REJECTED arm must require btrim(reason) ≥ 20',
  );
  // And the BUGGY pre-fix form must NOT appear (defense against a
  // future "simplify" that drops the btrim).
  assert.doesNotMatch(
    sql,
    /char_length\(\s*"reason"\s*\)\s*>=\s*10/i,
    'naked char_length(reason) >= 10 lets whitespace pass — must use btrim',
  );
});

// Append-only enforcement
test('AC1: append-only trigger function raises on UPDATE / DELETE / TRUNCATE', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+"approval_records_reject_mutation"/i);
  assert.match(sql, /RAISE EXCEPTION\s+'approval_records is append-only/i);
});

for (const op of ['UPDATE', 'DELETE', 'TRUNCATE']) {
  test(`AC1: append-only trigger fires BEFORE ${op}`, () => {
    const re = new RegExp(`BEFORE\\s+${op}\\s+ON\\s+"approval_records"`, 'i');
    assert.match(sql, re);
  });
  test(`AC1: trigger is ENABLE ALWAYS for ${op} (replica role can't bypass)`, () => {
    // ENABLE ALWAYS ensures session_replication_role=replica can't
    // silently disable the trigger.
    const re = new RegExp(
      `ENABLE\\s+ALWAYS\\s+TRIGGER\\s+"approval_records_no_${op.toLowerCase()}"`,
      'i',
    );
    assert.match(sql, re);
  });
}

test('AC1: fcm_app role locked to INSERT + SELECT (no UPDATE/DELETE)', () => {
  // Primary enforcement layer: the DB role lacks the GRANT for
  // UPDATE/DELETE on approval_records. The trigger above is
  // defense-in-depth against the role check being bypassed.
  assert.match(sql, /REVOKE ALL ON "approval_records" FROM "fcm_app"/i);
  assert.match(sql, /GRANT INSERT, SELECT ON "approval_records" TO "fcm_app"/i);
});

test('AC1: TRUNCATE revoked from PUBLIC', () => {
  assert.match(sql, /REVOKE TRUNCATE ON "approval_records" FROM PUBLIC/i);
});

// RLS sweep
test('Story 2-6 sweep: ENABLE + FORCE row-level security', () => {
  assert.match(sql, /ALTER TABLE\s+"approval_records"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(sql, /ALTER TABLE\s+"approval_records"\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
});

test('Story 2-6 sweep: tenant_isolation policy with closed-fail current_setting', () => {
  const block = sql.match(/CREATE POLICY\s+"tenant_isolation_approval_records"[\s\S]*?;/i);
  assert.ok(block);
  const matches = block[0].match(/current_setting\(\s*'app\.current_org_id'\s*,\s*true\s*\)/gi);
  assert.ok(matches && matches.length >= 2, 'USING + WITH CHECK both must use closed-fail current_setting');
});
