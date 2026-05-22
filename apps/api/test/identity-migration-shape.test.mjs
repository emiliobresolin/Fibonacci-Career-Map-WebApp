// Story 6-2a AC1 + AC2 + AC3: migration-shape pin for the identity
// tables (employees + employee_assignments).
//
// The AC names specific DB-level invariants:
//   AC1 — `employees(id PK, organization_id FK NOT NULL, user_id FK NOT NULL, ...)`
//         with RLS enabled and `(organization_id, user_id)` uniqueness.
//   AC2 — `employee_assignments` with RLS + PARTIAL unique
//         `(employee_id, organization_id, role) WHERE deactivated_at IS NULL`.
//   AC3 — BEFORE INSERT/UPDATE trigger rejecting self-management.
//
// We pin the migration SQL contains those strings. Live-DB behavior
// (RLS isolation, self-mgmt rejection, uniqueness violation) is
// covered by the DATABASE_URL-gated identity-integration suite per
// AC5 — see identity-integration.test.mjs.

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
  '20260529000000_employees_and_employee_assignments',
  'migration.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

// ── AC1 — employees ─────────────────────────────────────────────────

test('AC1: migration creates employees table', () => {
  assert.match(sql, /CREATE TABLE\s+"employees"/i);
});

test('AC1: employees has organization_id UUID NOT NULL', () => {
  const block = sql.match(/CREATE TABLE\s+"employees"([\s\S]*?);/i)[1];
  assert.match(block, /"organization_id"\s+UUID\s+NOT\s+NULL/i);
});

test('AC1: employees has user_id UUID NOT NULL', () => {
  const block = sql.match(/CREATE TABLE\s+"employees"([\s\S]*?);/i)[1];
  assert.match(block, /"user_id"\s+UUID\s+NOT\s+NULL/i);
});

test('AC1: employees has FK to organizations (CASCADE) and users (CASCADE)', () => {
  assert.match(
    sql,
    /"employees_organization_id_fkey"\s+FOREIGN KEY\s*\(\s*"organization_id"\s*\)\s+REFERENCES\s+"organizations"\("id"\)\s+ON\s+DELETE\s+CASCADE/i,
  );
  assert.match(
    sql,
    /"employees_user_id_fkey"\s+FOREIGN KEY\s*\(\s*"user_id"\s*\)\s+REFERENCES\s+"users"\("id"\)\s+ON\s+DELETE\s+CASCADE/i,
  );
});

test('AC1: employees has FK to career_tracks RESTRICT and levels RESTRICT', () => {
  // RESTRICT is deliberate — a config delete must not silently
  // unassign every employee. Operators reassign first.
  assert.match(
    sql,
    /"employees_career_track_id_fkey"[\s\S]*?REFERENCES\s+"career_tracks"\("id"\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
  assert.match(
    sql,
    /"employees_level_id_fkey"[\s\S]*?REFERENCES\s+"levels"\("id"\)\s+ON\s+DELETE\s+RESTRICT/i,
  );
});

test('AC1: employees has unique (organization_id, user_id)', () => {
  assert.match(
    sql,
    /CREATE\s+UNIQUE\s+INDEX\s+"employees_organization_id_user_id_unique"\s+ON\s+"employees"\("organization_id",\s*"user_id"\)/i,
  );
});

test('AC1: employees has RLS sweep (ENABLE + FORCE + tenant_isolation policy)', () => {
  assert.match(sql, /ALTER TABLE\s+"employees"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(sql, /ALTER TABLE\s+"employees"\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  const policy = sql.match(/CREATE POLICY\s+"tenant_isolation_employees"[\s\S]*?;/i);
  assert.ok(policy, 'tenant_isolation_employees policy missing');
  assert.match(
    policy[0],
    /current_setting\(\s*'app\.current_org_id'\s*,\s*true\s*\)::uuid/gi,
  );
});

// ── AC2 — employee_assignments ──────────────────────────────────────

test('AC2: migration creates employee_assignments table', () => {
  assert.match(sql, /CREATE TABLE\s+"employee_assignments"/i);
});

test('AC2: employee_assignments has employee_id UUID NOT NULL + role + manager_employee_id', () => {
  const block = sql.match(/CREATE TABLE\s+"employee_assignments"([\s\S]*?);/i)[1];
  assert.match(block, /"employee_id"\s+UUID\s+NOT\s+NULL/i);
  assert.match(block, /"role"\s+"Role"\s+NOT\s+NULL/i);
  assert.match(block, /"manager_employee_id"\s+UUID(?!\s+NOT)/i, 'manager_employee_id must be nullable');
});

test('AC2: employee_assignments manager_employee_id FK uses ON DELETE SET NULL', () => {
  // SET NULL keeps the org graph well-formed when a manager exits —
  // their reports become unparented rather than orphaned-then-deleted.
  assert.match(
    sql,
    /"employee_assignments_manager_employee_id_fkey"[\s\S]*?REFERENCES\s+"employees"\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/i,
  );
});

test('AC2: employee_assignments has PARTIAL unique (employee_id, organization_id, role) WHERE deactivated_at IS NULL', () => {
  // The partial-unique posture allows soft-deactivated rows to coexist
  // with a fresh re-grant — same pattern as role_assignments (Story 2-1).
  assert.match(
    sql,
    /CREATE\s+UNIQUE\s+INDEX\s+"employee_assignments_active_unique"\s+ON\s+"employee_assignments"\("employee_id",\s*"organization_id",\s*"role"\)\s+WHERE\s+"deactivated_at"\s+IS\s+NULL/i,
  );
});

test('AC2: employee_assignments has RLS sweep', () => {
  assert.match(sql, /ALTER TABLE\s+"employee_assignments"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(sql, /ALTER TABLE\s+"employee_assignments"\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  const policy = sql.match(/CREATE POLICY\s+"tenant_isolation_employee_assignments"[\s\S]*?;/i);
  assert.ok(policy);
  assert.match(
    policy[0],
    /current_setting\(\s*'app\.current_org_id'\s*,\s*true\s*\)::uuid/gi,
  );
});

// ── AC3 — self-management trigger ───────────────────────────────────

test('AC3: reject_self_management() function exists and uses check_violation SQLSTATE', () => {
  // The function MUST raise with SQLSTATE 23514 (check_violation) so
  // Prisma surfaces it as a P2010 / known-shape error the service
  // layer can pattern-match against.
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+"reject_self_management"/i);
  assert.match(sql, /USING\s+ERRCODE\s*=\s*'check_violation'/i);
});

test('AC3: trigger fires BEFORE INSERT OR UPDATE on employee_assignments', () => {
  assert.match(
    sql,
    /CREATE TRIGGER\s+"employee_assignments_reject_self_management"\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+"employee_assignments"\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+"reject_self_management"/i,
  );
});

test('AC3: trigger compares manager_employee_id to employee_id (and skips when null)', () => {
  // Two halves of the predicate must both be present: the IS NOT NULL
  // short-circuit AND the equality. Without the NULL guard, an
  // unmanaged (null manager) row would compare null = uuid → null →
  // pass, which is fine semantically but better to be explicit.
  const fnBlock = sql.match(/CREATE OR REPLACE FUNCTION\s+"reject_self_management"[\s\S]*?\$\$;/i);
  assert.ok(fnBlock, 'self-management function body not found');
  assert.match(
    fnBlock[0],
    /NEW\."manager_employee_id"\s+IS\s+NOT\s+NULL\s+AND\s+NEW\."manager_employee_id"\s*=\s*NEW\."employee_id"/i,
  );
});
