// Story 6-2b AC1: migration-shape pin for employee_blockers.
//
// AC1 names specific invariants that must survive any future refactor:
//   - kind enum with the four PRD §8.5 values
//   - reason TEXT NOT NULL CHECK (char_length(reason) >= 20)
//   - opened_by / resolved_by FK to users
//   - PARTIAL UNIQUE (employee_id, kind) WHERE resolved_at IS NULL
//   - RLS sweep
// AC3 implication: the index must support the hot-path "is this
// employee blocked?" predicate (Arch §6.2's EXISTS).

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
  '20260530000000_employee_blockers',
  'migration.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

test('AC1: BlockerKind enum declares the four PRD §8.5 values exactly', () => {
  // Ordering matters for ALTER TYPE ADD VALUE downstream operations
  // — pin it to match the schema.prisma declaration.
  assert.match(
    sql,
    /CREATE TYPE\s+"BlockerKind"\s+AS ENUM\s*\(\s*'PIP'\s*,\s*'PERFORMANCE_CONCERN'\s*,\s*'HR_HOLD'\s*,\s*'OTHER'\s*\)/i,
  );
});

test('AC1: employee_blockers table is created', () => {
  assert.match(sql, /CREATE TABLE\s+"employee_blockers"/i);
});

test('AC1: employee_blockers carries organization_id + employee_id + kind + reason NOT NULL', () => {
  const block = sql.match(/CREATE TABLE\s+"employee_blockers"([\s\S]*?);/i)[1];
  assert.match(block, /"organization_id"\s+UUID\s+NOT\s+NULL/i);
  assert.match(block, /"employee_id"\s+UUID\s+NOT\s+NULL/i);
  assert.match(block, /"kind"\s+"BlockerKind"\s+NOT\s+NULL/i);
  assert.match(block, /"reason"\s+TEXT\s+NOT\s+NULL/i);
});

test('AC1: reason has CHECK char_length >= 20', () => {
  assert.match(
    sql,
    /CHECK\s*\(\s*char_length\(\s*"reason"\s*\)\s*>=\s*20\s*\)/i,
  );
});

test('AC1: opened_by NOT NULL + resolved_by NULL with both FK to users RESTRICT', () => {
  const block = sql.match(/CREATE TABLE\s+"employee_blockers"([\s\S]*?);/i)[1];
  assert.match(block, /"opened_by"\s+UUID\s+NOT\s+NULL/i);
  assert.match(block, /"resolved_by"\s+UUID(?!\s+NOT)/i, 'resolved_by must be nullable');
  assert.match(
    sql,
    /"employee_blockers_opened_by_fkey"[\s\S]*?REFERENCES\s+"users"\("id"\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
  assert.match(
    sql,
    /"employee_blockers_resolved_by_fkey"[\s\S]*?REFERENCES\s+"users"\("id"\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
});

test('AC1: resolved_at + resolved_by must be set together (consistency CHECK)', () => {
  // The CHECK guarantees the audit-read API can attribute a
  // resolution — a row with resolved_at set but resolved_by NULL
  // (or vice versa) is malformed.
  assert.match(
    sql,
    /CHECK\s*\(\s*\(\s*"resolved_at"\s+IS\s+NULL\s+AND\s+"resolved_by"\s+IS\s+NULL\s*\)\s+OR\s+\(\s*"resolved_at"\s+IS\s+NOT\s+NULL\s+AND\s+"resolved_by"\s+IS\s+NOT\s+NULL\s*\)\s*\)/i,
  );
});

test('AC1: PARTIAL unique on (employee_id, kind) WHERE resolved_at IS NULL', () => {
  assert.match(
    sql,
    /CREATE\s+UNIQUE\s+INDEX\s+"employee_blockers_active_unique"\s+ON\s+"employee_blockers"\("employee_id",\s*"kind"\)\s+WHERE\s+"resolved_at"\s+IS\s+NULL/i,
  );
});

test('AC1+AC4: active-employee partial index supports the eligibility-evaluator EXISTS read', () => {
  // The Arch §6.2 evaluator does EXISTS(... WHERE resolved_at IS NULL).
  // The partial index keeps this constant-time at any blocker volume.
  assert.match(
    sql,
    /CREATE\s+INDEX\s+"employee_blockers_active_employee_idx"\s+ON\s+"employee_blockers"\("employee_id"\)\s+WHERE\s+"resolved_at"\s+IS\s+NULL/i,
  );
});

test('AC3: employee_blockers has RLS sweep (ENABLE + FORCE + tenant_isolation policy)', () => {
  assert.match(sql, /ALTER TABLE\s+"employee_blockers"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(sql, /ALTER TABLE\s+"employee_blockers"\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  const policy = sql.match(/CREATE POLICY\s+"tenant_isolation_employee_blockers"[\s\S]*?;/i);
  assert.ok(policy);
  assert.match(
    policy[0],
    /current_setting\(\s*'app\.current_org_id'\s*,\s*true\s*\)::uuid/gi,
  );
});
