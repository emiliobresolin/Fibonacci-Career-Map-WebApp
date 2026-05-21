// Scaffold guardrail: verifies the outbox_events table + pg_notify trigger
// surface defined by Story 3-2 (Arch §9.3, AD-7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const migrationsDir = resolve(root, 'apps/api/prisma/migrations');

function findOutboxMigration() {
  const dirs = readdirSync(migrationsDir);
  // Anchor on the full `<timestamp>_outbox_events` pattern so a future
  // migration with "outbox_events" as a substring doesn't false-match.
  const matches = dirs.filter((d) => /^\d{14}_outbox_events$/.test(d));
  assert.equal(matches.length, 1, `expected exactly 1 outbox_events migration dir, found ${matches.length}`);
  return resolve(migrationsDir, matches[0], 'migration.sql');
}

test('Prisma schema declares the OutboxEvent model with the eight required columns (AC1)', () => {
  const schema = readFileSync(resolve(root, 'apps/api/prisma/schema.prisma'), 'utf8');
  // Anchored on a real model declaration so a docstring mentioning the
  // word "model OutboxEvent" can't false-positive.
  assert.match(schema, /^model\s+OutboxEvent\s*\{/m, 'OutboxEvent model must exist (AC1)');
  assert.match(schema, /@@map\("outbox_events"\)/, 'OutboxEvent must map to outbox_events (AC1)');
  // Required fields per AC1.
  for (const fieldRegex of [
    /eventId\s+String\s+@id/,
    /organizationId\s+String/,
    /aggregateType\s+String/,
    /aggregateId\s+String/,
    /eventType\s+String/,
    /payload\s+Json/,
    /createdAt\s+DateTime/,
    /publishedAt\s+DateTime\?/,
  ]) {
    assert.match(schema, fieldRegex, `OutboxEvent must declare field matching ${fieldRegex}`);
  }
});

test('Migration creates outbox_events with event_id PK and the required columns (AC1)', () => {
  const sql = readFileSync(findOutboxMigration(), 'utf8');
  assert.match(sql, /CREATE TABLE[^;]*"outbox_events"/, 'outbox_events table required (AC1)');
  assert.match(sql, /PRIMARY KEY\s*\(\s*"event_id"\s*\)/, 'event_id must be the PK (AC1)');
  for (const col of [
    '"event_id" UUID NOT NULL',
    '"organization_id" UUID NOT NULL',
    '"aggregate_type" TEXT NOT NULL',
    '"aggregate_id" UUID NOT NULL',
    '"event_type" TEXT NOT NULL',
    '"payload" JSONB NOT NULL',
    '"created_at" TIMESTAMPTZ NOT NULL',
    '"published_at" TIMESTAMPTZ',
  ]) {
    assert.ok(sql.includes(col), `outbox_events must declare column: ${col} (AC1)`);
  }
});

test('Migration creates the AFTER INSERT pg_notify trigger with hardened search_path (AC2)', () => {
  const sql = readFileSync(findOutboxMigration(), 'utf8');
  assert.match(
    sql,
    /CREATE\s+(OR REPLACE\s+)?FUNCTION\s+"outbox_events_notify"/,
    'outbox_events_notify trigger function required (AC2)',
  );
  // pg_catalog. qualifier + SET search_path = pg_catalog, public defends
  // against a hostile schema shadowing pg_notify.
  assert.match(
    sql,
    /pg_catalog\.pg_notify\(\s*'outbox_new'\s*,/i,
    'function must call pg_catalog.pg_notify explicitly (search-path hardening, AC2)',
  );
  assert.match(
    sql,
    /SET\s+search_path\s*=\s*pg_catalog\s*,\s*public/i,
    'function must pin search_path = pg_catalog, public',
  );
  assert.match(
    sql,
    /CREATE TRIGGER\s+"outbox_events_notify_trigger"[\s\S]*?AFTER INSERT ON\s+"outbox_events"[\s\S]*?FOR EACH ROW/,
    'AFTER INSERT FOR EACH ROW trigger required (AC2)',
  );
  // ENABLE ALWAYS so session_replication_role=replica cannot bypass NOTIFY.
  assert.match(
    sql,
    /ALTER TABLE\s+"outbox_events"\s+ENABLE ALWAYS TRIGGER\s+"outbox_events_notify_trigger"/,
    'trigger must be ENABLE ALWAYS so session_replication_role=replica cannot bypass it (AC2)',
  );
});

test('Migration installs payload-shape CHECK constraints (defensive)', () => {
  const sql = readFileSync(findOutboxMigration(), 'utf8');
  assert.match(
    sql,
    /CHECK\s*\(\s*jsonb_typeof\(\s*"payload"\s*\)\s*=\s*'object'\s*\)/i,
    'payload must be a JSONB object (rejects JSON null, arrays, scalars)',
  );
  assert.match(
    sql,
    /CHECK\s*\(\s*octet_length\(\s*"payload"::text\s*\)\s*<=\s*65536\s*\)/i,
    'payload must be size-bounded to keep NOTIFY queue healthy',
  );
});

test('Migration creates the (published_at NULLS FIRST, created_at) index for relay batching (AC3)', () => {
  const sql = readFileSync(findOutboxMigration(), 'utf8');
  assert.match(
    sql,
    /CREATE INDEX[^;]*"outbox_events_published_at_created_at_idx"[^;]*ON\s+"outbox_events"\s*\(\s*"published_at"\s+ASC\s+NULLS FIRST\s*,\s*"created_at"\s+ASC\s*\)/i,
    '(published_at NULLS FIRST, created_at) index required for relay batching (AC3)',
  );
});

test('Integration test for AC4 (commit fires NOTIFY, rollback does not) exists', () => {
  const integ = resolve(root, 'tests/integration/outbox-events-notify.test.mjs');
  assert.ok(existsSync(integ), 'AC4 integration test must exist');
});
