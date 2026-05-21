// Scaffold guardrail: verifies the audit_events partitioning + append-only
// surface defined by Story 3-1 (Arch §6.4, §9.3, AD-7).
//
// These tests are structural — they assert that the migration declares the
// right SQL pieces. The live PG behavioral test for AC4 (UPDATE/DELETE
// rejected) lives in tests/integration/audit-events-append-only.test.mjs
// and is skipped when DATABASE_URL is unset.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const migrationsDir = resolve(root, 'apps/api/prisma/migrations');

function findAuditMigration() {
  const dirs = readdirSync(migrationsDir);
  const matches = dirs.filter((d) => /audit_events_partitioned$/.test(d));
  assert.equal(
    matches.length,
    1,
    `expected exactly 1 audit_events_partitioned migration dir, found ${matches.length}`,
  );
  return resolve(migrationsDir, matches[0], 'migration.sql');
}

test('Prisma schema declares the AuditEvent model with composite id (partitioning anchor)', () => {
  const schema = readFileSync(resolve(root, 'apps/api/prisma/schema.prisma'), 'utf8');
  assert.match(schema, /model AuditEvent/, 'AuditEvent model must exist (AC1)');
  assert.match(schema, /@@map\("audit_events"\)/, 'AuditEvent must map to audit_events table (AC1)');
  // Composite PK is mandatory for partitioned tables; the partition key (occurred_at)
  // must be part of every unique constraint, including the PK.
  assert.match(schema, /@@id\(\[id,\s*occurredAt\]\)/, 'AuditEvent must use composite (id, occurredAt) PK for partitioning (AC1)');
  assert.match(schema, /before\s+Json\?/, 'AuditEvent.before must be Json? (AC2)');
  assert.match(schema, /after\s+Json\?/, 'AuditEvent.after must be Json? (AC2)');
});

test('Migration creates audit_events as PARTITION BY RANGE (occurred_at) with composite SQL PK (AC1)', () => {
  const sql = readFileSync(findAuditMigration(), 'utf8');
  assert.match(
    sql,
    /CREATE TABLE[^;]*"audit_events"[\s\S]*?PARTITION BY RANGE\s*\(\s*"occurred_at"\s*\)/,
    'audit_events must be a RANGE-partitioned table on occurred_at (AC1)',
  );
  assert.match(
    sql,
    /PRIMARY KEY\s*\(\s*"id"\s*,\s*"occurred_at"\s*\)/,
    'audit_events SQL PK must be composite (id, occurred_at) for partitioning (AC1)',
  );
});

test('Migration pre-creates 3 monthly partitions + a DEFAULT partition (AC1)', () => {
  const sql = readFileSync(findAuditMigration(), 'utf8');
  const namedPartitions =
    sql.match(/CREATE TABLE[^;]*"audit_events_\d{4}_\d{2}"\s+PARTITION OF\s+"audit_events"/g) ?? [];
  assert.equal(namedPartitions.length, 3, '3 named monthly partitions must be pre-created (AC1)');
  // Explicit UTC offsets — the bound is timezone-invariant regardless of the
  // session's TimeZone GUC at deploy time.
  assert.match(sql, /TIMESTAMPTZ\s+'2026-05-01[^']*\+00'\s*\)\s*TO\s*\(\s*TIMESTAMPTZ\s+'2026-06-01[^']*\+00'/);
  assert.match(sql, /TIMESTAMPTZ\s+'2026-06-01[^']*\+00'\s*\)\s*TO\s*\(\s*TIMESTAMPTZ\s+'2026-07-01[^']*\+00'/);
  assert.match(sql, /TIMESTAMPTZ\s+'2026-07-01[^']*\+00'\s*\)\s*TO\s*\(\s*TIMESTAMPTZ\s+'2026-08-01[^']*\+00'/);
  // DEFAULT partition catches back-dated rows and any row past 2026-08-01
  // when the Story 3-6 maintenance cron lags.
  assert.match(
    sql,
    /CREATE TABLE[^;]*"audit_events_default"\s+PARTITION OF\s+"audit_events"\s+DEFAULT/,
    'DEFAULT partition required to catch out-of-range inserts (AC1)',
  );
});

test('Migration creates GIN indexes on before/after + the two B-tree indexes (AC2)', () => {
  const sql = readFileSync(findAuditMigration(), 'utf8');
  // jsonb_path_ops chosen deliberately (containment-dominated workload).
  assert.match(
    sql,
    /CREATE INDEX[^;]*"audit_events_before_gin_idx"[^;]*USING GIN\s*\(\s*"before"[^)]*\)/,
    'GIN index on before required (AC2)',
  );
  assert.match(
    sql,
    /CREATE INDEX[^;]*"audit_events_after_gin_idx"[^;]*USING GIN\s*\(\s*"after"[^)]*\)/,
    'GIN index on after required (AC2)',
  );
  assert.match(
    sql,
    /CREATE INDEX[^;]*"audit_events_organization_id_occurred_at_idx"[^;]*ON\s+"audit_events"\s*\(\s*"organization_id",\s*"occurred_at"\s*\)/,
    'B-tree (organization_id, occurred_at) required (AC2)',
  );
  assert.match(
    sql,
    /CREATE INDEX[^;]*"audit_events_entity_type_entity_id_occurred_at_idx"[^;]*ON\s+"audit_events"\s*\(\s*"entity_type",\s*"entity_id",\s*"occurred_at"\s*\)/,
    'B-tree (entity_type, entity_id, occurred_at) required (AC2)',
  );
});

test('Migration installs BEFORE UPDATE/DELETE/TRUNCATE triggers with ENABLE ALWAYS (AC3 defense-in-depth)', () => {
  const sql = readFileSync(findAuditMigration(), 'utf8');
  assert.match(
    sql,
    /CREATE\s+(OR REPLACE\s+)?FUNCTION\s+"audit_events_reject_mutation"/,
    'reject-mutation trigger function must exist (AC3)',
  );
  assert.match(sql, /RAISE EXCEPTION/, 'trigger function must raise an exception (AC3)');
  for (const op of ['no_update', 'no_delete', 'no_truncate']) {
    assert.match(
      sql,
      new RegExp(`CREATE TRIGGER\\s+"audit_events_${op}"[\\s\\S]*?BEFORE (UPDATE|DELETE|TRUNCATE) ON\\s+"audit_events"`),
      `BEFORE trigger audit_events_${op} required (AC3)`,
    );
    assert.match(
      sql,
      new RegExp(`ALTER TABLE\\s+"audit_events"\\s+ENABLE ALWAYS TRIGGER\\s+"audit_events_${op}"`),
      `trigger audit_events_${op} must be ENABLE ALWAYS so session_replication_role=replica cannot bypass it (AC3)`,
    );
  }
});

test('Migration revokes TRUNCATE from PUBLIC on parent and every child partition (AC3)', () => {
  const sql = readFileSync(findAuditMigration(), 'utf8');
  assert.match(sql, /REVOKE TRUNCATE ON\s+"audit_events"\s+FROM PUBLIC/);
  assert.match(sql, /REVOKE TRUNCATE ON\s+"audit_events_2026_05"\s+FROM PUBLIC/);
  assert.match(sql, /REVOKE TRUNCATE ON\s+"audit_events_2026_06"\s+FROM PUBLIC/);
  assert.match(sql, /REVOKE TRUNCATE ON\s+"audit_events_2026_07"\s+FROM PUBLIC/);
  assert.match(sql, /REVOKE TRUNCATE ON\s+"audit_events_default"\s+FROM PUBLIC/);
});

test('Migration applies REVOKE/GRANT to fcm_app role on parent + all child partitions (AC3 primary)', () => {
  const sql = readFileSync(findAuditMigration(), 'utf8');
  assert.match(
    sql,
    /SELECT 1 FROM pg_roles WHERE rolname = 'fcm_app'/,
    'migration must conditionally check for the fcm_app role (AC3)',
  );
  // Parent-level grants.
  assert.match(sql, /REVOKE ALL ON "audit_events" FROM "fcm_app"/);
  assert.match(sql, /GRANT INSERT, SELECT ON "audit_events" TO "fcm_app"/);
  // Child-iteration: PG checks privileges on the target relation, so parent
  // grants don't propagate to direct child-table access.
  assert.match(
    sql,
    /FROM pg_inherits[\s\S]*?inhparent = 'public.audit_events'/,
    'child-partition grants must be iterated (AC3)',
  );
  assert.match(sql, /REVOKE ALL ON %s FROM "fcm_app"/);
  assert.match(sql, /GRANT INSERT, SELECT ON %s TO "fcm_app"/);
});

test('Integration test for AC4 exists (live PG required to actually execute)', () => {
  const integ = resolve(root, 'tests/integration/audit-events-append-only.test.mjs');
  assert.ok(existsSync(integ), 'AC4 integration test file must exist (skips when DATABASE_URL is unset)');
});
