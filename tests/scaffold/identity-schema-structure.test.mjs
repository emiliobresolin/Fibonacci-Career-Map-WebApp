// Scaffold guardrail: verifies the identity schema for Story 2-1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const prismaDir = resolve(root, 'apps/api/prisma');
const schemaPath = resolve(prismaDir, 'schema.prisma');

// ---------- Schema (AC1) ----------

test('schema declares Organization model with required fields', () => {
  const src = readFileSync(schemaPath, 'utf8');
  assert.match(src, /model\s+Organization\s+\{/, 'Organization model must exist (AC1)');
  // Fields per AC1
  assert.match(src, /slug\s+String/, 'Organization must have slug field');
  assert.match(src, /name\s+String/, 'Organization must have name field');
  assert.match(src, /oidcConfig\s+Json\?|oidc_config\s+Json\?/, 'Organization must have nullable oidc_config (Json?) field');
  assert.match(src, /visibilityDefault|visibility_default/, 'Organization must have visibility_default field');
  assert.match(src, /approvalWorkflowDefault|approval_workflow_default/, 'Organization must have approval_workflow_default field');
  assert.match(src, /promotionMode\s+PromotionMode|promotion_mode\s+PromotionMode/, 'Organization.promotion_mode must use the PromotionMode enum');
  assert.match(src, /promotionModeChangedAt|promotion_mode_changed_at/, 'Organization must have promotion_mode_changed_at field');
  assert.match(src, /promotionModeChangedBy|promotion_mode_changed_by/, 'Organization must have promotion_mode_changed_by field');
});

test('schema declares PromotionMode enum with CALIBRATION + ACTIVE', () => {
  const src = readFileSync(schemaPath, 'utf8');
  assert.match(src, /enum\s+PromotionMode\s+\{[\s\S]*?CALIBRATION[\s\S]*?ACTIVE/, 'PromotionMode enum must have CALIBRATION and ACTIVE values (AC1)');
});

test('schema declares Role enum with EMPLOYEE/MANAGER/ADMIN', () => {
  const src = readFileSync(schemaPath, 'utf8');
  assert.match(
    src,
    /enum\s+Role\s+\{[\s\S]*?EMPLOYEE[\s\S]*?MANAGER[\s\S]*?ADMIN/,
    'Role enum must have EMPLOYEE / MANAGER / ADMIN (AC1)',
  );
});

test('schema declares User model with email + display_name + organization FK', () => {
  const src = readFileSync(schemaPath, 'utf8');
  assert.match(src, /model\s+User\s+\{/, 'User model must exist (AC1)');
  assert.match(src, /email\s+String/, 'User must have email field');
  assert.match(src, /displayName\s+String|display_name\s+String/, 'User must have display_name field');
  assert.match(src, /organizationId\s+String|organization_id\s+String/, 'User must have organization_id FK (AC2)');
});

test('schema declares RoleAssignment model with composite unique on (user_id, organization_id, role)', () => {
  const src = readFileSync(schemaPath, 'utf8');
  assert.match(src, /model\s+RoleAssignment\s+\{/, 'RoleAssignment model must exist (AC1)');
  assert.match(src, /role\s+Role/, 'RoleAssignment.role must use the Role enum (AC1)');
  // The composite unique can be expressed as @@unique([userId, organizationId, role]) or via @@map
  assert.match(
    src,
    /@@unique\(\s*\[\s*(?:userId|user_id)\s*,\s*(?:organizationId|organization_id)\s*,\s*role\s*\]/,
    'RoleAssignment must declare a composite unique on (user_id, organization_id, role) (AC1)',
  );
});

test('User and RoleAssignment have indexes on organization_id (AC2)', () => {
  const src = readFileSync(schemaPath, 'utf8');
  // Each tenant-scoped table must be indexed on organization_id per AC2.
  // Prisma syntax: @@index([organizationId]) inside the model.
  const userBlock = src.match(/model\s+User\s+\{[\s\S]*?\n\}/);
  assert.ok(userBlock, 'cannot find User model block');
  assert.match(userBlock[0], /@@index\(\s*\[\s*(?:organizationId|organization_id)\s*\]/, 'User must be indexed on organization_id (AC2)');

  const raBlock = src.match(/model\s+RoleAssignment\s+\{[\s\S]*?\n\}/);
  assert.ok(raBlock, 'cannot find RoleAssignment model block');
  assert.match(raBlock[0], /@@index\(\s*\[\s*(?:organizationId|organization_id)\s*\]/, 'RoleAssignment must be indexed on organization_id (AC2)');
});

// ---------- Migration (AC1, AC2) ----------

test('Identity-schema migration directory exists and drops the placeholder + creates the three tables', () => {
  const migrationsDir = resolve(prismaDir, 'migrations');
  const entries = readdirSync(migrationsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const identityDir = entries.find((e) => /identity|users|organizations/i.test(e.name));
  assert.ok(identityDir, 'a migration directory matching identity|users|organizations must exist (AC1)');

  const sqlPath = resolve(migrationsDir, identityDir.name, 'migration.sql');
  assert.ok(existsSync(sqlPath), `migration.sql must exist at ${sqlPath}`);
  const sql = readFileSync(sqlPath, 'utf8');

  // The init migration (story 1-4) said the _MigrationProbe table is dropped by
  // the first real-domain migration — this is that migration.
  assert.match(sql, /DROP TABLE[\s\S]*"_MigrationProbe"/, 'identity migration must drop the _MigrationProbe placeholder (story 1-4 contract)');

  // Three core tables.
  assert.match(sql, /CREATE TABLE[\s\S]*"organizations"/, 'must CREATE TABLE "organizations"');
  assert.match(sql, /CREATE TABLE[\s\S]*"users"/, 'must CREATE TABLE "users"');
  assert.match(sql, /CREATE TABLE[\s\S]*"role_assignments"/, 'must CREATE TABLE "role_assignments"');

  // Enums.
  assert.match(sql, /CREATE TYPE[\s\S]*"PromotionMode"[\s\S]*'CALIBRATION'[\s\S]*'ACTIVE'/, 'must CREATE TYPE PromotionMode');
  assert.match(sql, /CREATE TYPE[\s\S]*"Role"[\s\S]*'EMPLOYEE'[\s\S]*'MANAGER'[\s\S]*'ADMIN'/, 'must CREATE TYPE Role');

  // Composite unique on role_assignments.
  assert.match(sql, /UNIQUE[\s\S]*"role_assignments"|role_assignments_user_id_organization_id_role_key/, 'role_assignments must enforce composite unique on (user_id, organization_id, role) (AC1)');

  // Indexes on organization_id (AC2).
  assert.match(sql, /CREATE INDEX[\s\S]*"users"[\s\S]*"organization_id"/, 'users must be indexed on organization_id (AC2)');
  assert.match(sql, /CREATE INDEX[\s\S]*"role_assignments"[\s\S]*"organization_id"/, 'role_assignments must be indexed on organization_id (AC2)');

  // organization_id NOT NULL where applicable (AC2).
  assert.match(sql, /"users"\s*\([\s\S]*"organization_id"\s+UUID\s+NOT NULL/, 'users.organization_id must be NOT NULL (AC2)');
  assert.match(sql, /"role_assignments"\s*\([\s\S]*"organization_id"\s+UUID\s+NOT NULL/, 'role_assignments.organization_id must be NOT NULL (AC2)');
});

// ---------- Seed (AC3) ----------

test('Seed script exists and creates one organization + one ADMIN + one EMPLOYEE', () => {
  // Prisma seed can be at apps/api/prisma/seed.ts or apps/api/prisma/seed.mjs
  const candidates = ['seed.ts', 'seed.mts', 'seed.mjs', 'seed.js'].map((f) => resolve(prismaDir, f));
  const seedPath = candidates.find((p) => existsSync(p));
  assert.ok(seedPath, 'apps/api/prisma/seed.{ts|mts|mjs|js} must exist (AC3)');

  const src = readFileSync(seedPath, 'utf8');
  assert.match(src, /organization|Organization/, 'seed must create an organization (AC3)');
  assert.match(src, /ADMIN/, 'seed must reference the ADMIN role (AC3)');
  assert.match(src, /EMPLOYEE/, 'seed must reference the EMPLOYEE role (AC3)');
});

test('package.json declares prisma.seed config and a prisma:seed script', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'apps/api/package.json'), 'utf8'));
  assert.ok(pkg.prisma?.seed, 'apps/api/package.json must declare prisma.seed (AC3 — prisma migrate dev auto-runs this)');
  assert.match(pkg.scripts?.['prisma:seed'] ?? '', /seed|prisma\s+db\s+seed/, 'apps/api must expose a `prisma:seed` script (AC3)');
});
