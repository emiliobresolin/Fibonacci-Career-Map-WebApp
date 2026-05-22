// Story 6-2 AC1 + AC2: assert the configuration-tables migration ships
// the load-bearing schema invariants.
//
// We don't have a live DB in the unit-test bar (rls-integration.test.mjs
// is the gated suite). What we CAN do without a DB is verify the
// migration SQL contains the constraints the AC literally names:
//
//   AC1 — five tables created (career_tracks, levels, layers,
//         requirements, promotion_rules) AND the non-overlapping band
//         exclusion constraint on `levels`.
//   AC2 — every one of the five tables has the Story-2-6 RLS sweep
//         (ENABLE + FORCE + tenant_isolation_<table> policy).
//
// String-shape testing on SQL is normally fragile, but the constraints
// the AC pins ARE the strings we care about. A future migration that
// renames `tenant_isolation_levels` to `levels_rls` or drops the
// EXCLUDE clause MUST fail this test loudly.
//
// We do NOT verify the EXCLUDE constraint's behavior — that's the
// gated rls-integration.test.mjs equivalent for the band-overlap
// invariant, which lands when DATABASE_URL is wired into CI
// (deferred follow-up alongside the existing skip).

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
  '20260528000000_configuration_tables',
  'migration.sql',
);

const sql = await readFile(MIGRATION, 'utf8');

const TABLES = ['career_tracks', 'levels', 'layers', 'requirements', 'promotion_rules'];

// ── AC1: tables ─────────────────────────────────────────────────────

for (const table of TABLES) {
  test(`AC1: migration creates ${table} table`, () => {
    const re = new RegExp(`CREATE TABLE\\s+"${table}"`, 'i');
    assert.match(sql, re, `expected CREATE TABLE "${table}"`);
  });

  test(`AC1: ${table} has organization_id NOT NULL`, () => {
    // The CREATE TABLE block must declare organization_id UUID NOT NULL.
    // Without this, the RLS policy would compare NULL to current_setting
    // and silently match everything.
    const blockMatch = sql.match(new RegExp(`CREATE TABLE\\s+"${table}"([\\s\\S]*?);`, 'i'));
    assert.ok(blockMatch, `could not locate CREATE TABLE block for ${table}`);
    const block = blockMatch[1];
    assert.match(
      block,
      /"organization_id"\s+UUID\s+NOT\s+NULL/i,
      `${table} must declare organization_id UUID NOT NULL`,
    );
  });
}

test('AC1: levels carries the non-overlapping band EXCLUDE constraint', () => {
  // The constraint is the central invariant of PRD §8.2. Two halves
  // must both be present: the GiST USING clause AND the int4range
  // overlap operator on the band columns AND the WHERE (active = true)
  // partial scope.
  assert.match(
    sql,
    /EXCLUDE\s+USING\s+GIST\s*\(\s*"career_track_id"\s+WITH\s+=\s*,\s*int4range\(\s*"score_band_start"\s*,\s*"score_band_end"\s*,\s*'\[\]'\s*\)\s+WITH\s+&&/i,
    'expected EXCLUDE USING GIST (career_track_id WITH =, int4range(start, end, [ ]) WITH &&)',
  );
  assert.match(
    sql,
    /\)\s+WHERE\s*\(\s*"active"\s*=\s*true\s*\)/i,
    'EXCLUDE must scope to active = true so deactivated levels can keep their bounds',
  );
});

test('AC1: levels has score_band CHECK constraints (non-negative start, end > start)', () => {
  assert.match(sql, /CHECK\s*\(\s*"score_band_start"\s*>=\s*0\s*\)/i);
  assert.match(sql, /CHECK\s*\(\s*"score_band_end"\s*>\s*"score_band_start"\s*\)/i);
});

test('AC1: requirements weight CHECK (>0) and expiry_months CHECK (>0 OR NULL)', () => {
  assert.match(sql, /CHECK\s*\(\s*"weight"\s*>\s*0\s*\)/i);
  assert.match(
    sql,
    /CHECK\s*\(\s*"expiry_months"\s+IS\s+NULL\s+OR\s+"expiry_months"\s*>\s*0\s*\)/i,
  );
});

test('AC1: promotion_rules has unique(level_id) — exactly one rule per level', () => {
  assert.match(
    sql,
    /CREATE\s+UNIQUE\s+INDEX\s+"promotion_rules_level_id_unique"\s+ON\s+"promotion_rules"\("level_id"\)/i,
  );
});

test('AC1: career_tracks has unique (organization_id, slug)', () => {
  assert.match(
    sql,
    /CREATE\s+UNIQUE\s+INDEX\s+"career_tracks_org_slug_unique"\s+ON\s+"career_tracks"\("organization_id",\s*"slug"\)/i,
  );
});

test('AC1: btree_gist extension is requested (powers the UUID-equality GiST EXCLUDE)', () => {
  // The EXCLUDE clause's `career_track_id WITH =` requires btree_gist;
  // without this CREATE EXTENSION, the migration fails on a fresh DB.
  assert.match(sql, /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+btree_gist/i);
});

// ── AC2: RLS sweep on all five tables ───────────────────────────────

for (const table of TABLES) {
  test(`AC2: ${table} has ENABLE + FORCE row-level security`, () => {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE\\s+"${table}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`ALTER TABLE\\s+"${table}"\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
    );
  });

  test(`AC2: ${table} has tenant_isolation_${table} policy on app.current_org_id`, () => {
    // The policy MUST use current_setting('app.current_org_id', true)
    // — the `true` arg makes missing-GUC return NULL → row excluded
    // (closed-fail). A migration that drops the second arg would
    // silently fail-open in dev (the GUC raises an exception there
    // instead of returning NULL).
    const policyRe = new RegExp(
      `CREATE POLICY\\s+"tenant_isolation_${table}"\\s+ON\\s+"${table}"`,
      'i',
    );
    assert.match(sql, policyRe);
    // Both USING and WITH CHECK arms must carry the closed-fail predicate.
    const block = sql.match(
      new RegExp(`CREATE POLICY\\s+"tenant_isolation_${table}"[\\s\\S]*?;`, 'i'),
    );
    assert.ok(block, `could not locate policy block for ${table}`);
    assert.match(block[0], /USING\s*\(/i, `${table} policy missing USING clause`);
    assert.match(block[0], /WITH\s+CHECK\s*\(/i, `${table} policy missing WITH CHECK clause`);
    assert.match(
      block[0],
      /current_setting\(\s*'app\.current_org_id'\s*,\s*true\s*\)::uuid/gi,
      `${table} policy must read current_setting('app.current_org_id', true)::uuid (closed-fail)`,
    );
  });
}
