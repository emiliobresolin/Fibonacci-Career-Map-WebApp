// Story 8-2 AC2: migration adds storage_etag / content_type / size_bytes
// to evidence + a non-negative CHECK on size_bytes.

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
  '20260601000000_evidence_finalize_metadata',
  'migration.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

test('AC2: migration adds storage_etag TEXT to evidence', () => {
  assert.match(sql, /ADD COLUMN\s+"storage_etag"\s+TEXT/i);
});

test('AC2: migration adds content_type TEXT to evidence', () => {
  assert.match(sql, /ADD COLUMN\s+"content_type"\s+TEXT/i);
});

test('AC2: migration adds size_bytes BIGINT (not INTEGER) to evidence', () => {
  // BIGINT (int8) so the column fits S3's 5 TiB ceiling; INT4 would
  // silently overflow at 2.1 GB and the bug would only surface in
  // production for a single weirdly large upload.
  assert.match(sql, /ADD COLUMN\s+"size_bytes"\s+BIGINT/i);
});

test('AC2: size_bytes carries a non-negative CHECK constraint', () => {
  // A negative byte count means the finalize service mis-parsed the
  // S3 HEAD response — DB-level CHECK is defense in depth.
  assert.match(
    sql,
    /CHECK\s*\(\s*"size_bytes"\s+IS\s+NULL\s+OR\s+"size_bytes"\s*>=\s*0\s*\)/i,
  );
});

test('all three new columns target the evidence table specifically', () => {
  // Defense against a future migration that accidentally aliases the
  // table name.
  assert.match(sql, /ALTER TABLE\s+"evidence"/i);
  // Single ALTER TABLE statement is fine — verify we didn't drop the
  // existing CHECK constraints from 8-1 in this migration.
  assert.doesNotMatch(sql, /DROP\s+CONSTRAINT\s+"evidence_/i);
});
