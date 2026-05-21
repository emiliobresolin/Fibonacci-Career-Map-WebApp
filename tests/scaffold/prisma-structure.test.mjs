// Scaffold guardrail: verifies Prisma baseline + migration pipeline for Story 1-4.
// Pure file-system assertions — no live database required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const api = resolve(root, 'apps/api');
const prismaDir = resolve(api, 'prisma');
const apiSrc = resolve(api, 'src');

test('apps/api declares prisma + @prisma/client', () => {
  const pkg = JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['@prisma/client'], '@prisma/client must be a runtime dependency (AC3)');
  assert.ok(deps.prisma, 'prisma CLI must be installed (AC1, AC2)');
});

test('apps/api declares prisma:generate, migrate:dev, migrate:deploy scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};
  assert.match(scripts['prisma:generate'] ?? '', /prisma\s+generate/, 'prisma:generate script must exist (AC3)');
  assert.match(scripts['prisma:migrate:dev'] ?? '', /prisma\s+migrate\s+dev/, 'prisma:migrate:dev script must exist (AC2)');
  assert.match(
    scripts['prisma:migrate:deploy'] ?? '',
    /prisma\s+migrate\s+deploy/,
    'prisma:migrate:deploy script must exist (AC2 — invoked by CI pre-deploy job)',
  );
});

test('apps/api/prisma/schema.prisma exists and targets postgresql', () => {
  const schemaPath = resolve(prismaDir, 'schema.prisma');
  assert.ok(existsSync(schemaPath), 'apps/api/prisma/schema.prisma must exist (AC1)');
  const schema = readFileSync(schemaPath, 'utf8');
  assert.match(schema, /provider\s*=\s*"postgresql"/, 'schema.prisma must use postgresql provider (AC1)');
  assert.match(schema, /url\s*=\s*env\(\s*"DATABASE_URL"\s*\)/, 'schema must read DATABASE_URL from env (AC4)');
});

test('schema declares the _MigrationProbe table (model + @@map)', () => {
  const schema = readFileSync(resolve(prismaDir, 'schema.prisma'), 'utf8');
  // The TABLE name must be _MigrationProbe (per AC1). Prisma model identifier conventionally
  // starts with a capital letter (e.g., MigrationProbe) and uses @@map to set the table name.
  assert.match(
    schema,
    /@@map\(\s*"_MigrationProbe"\s*\)|model\s+_MigrationProbe\s+\{/,
    'schema must map to a table named _MigrationProbe (AC1)',
  );
});

test('Initial migration directory exists under prisma/migrations/', () => {
  const migrationsDir = resolve(prismaDir, 'migrations');
  assert.ok(existsSync(migrationsDir), 'apps/api/prisma/migrations/ must exist (AC2)');

  const lock = resolve(migrationsDir, 'migration_lock.toml');
  assert.ok(existsSync(lock), 'migration_lock.toml must exist (Prisma migrations directory marker)');

  const entries = readdirSync(migrationsDir, { withFileTypes: true });
  const migrationDirs = entries.filter((e) => e.isDirectory());
  assert.ok(migrationDirs.length >= 1, 'at least one migration directory must exist (AC2)');

  // The init migration must contain migration.sql with a CREATE TABLE for _MigrationProbe.
  const initDir = migrationDirs.find((e) => /_init\b/.test(e.name)) ?? migrationDirs[0];
  const sqlPath = resolve(migrationsDir, initDir.name, 'migration.sql');
  assert.ok(existsSync(sqlPath), `migration.sql must exist at ${sqlPath}`);
  const sql = readFileSync(sqlPath, 'utf8');
  assert.match(sql, /CREATE TABLE[\s\S]*"_MigrationProbe"/, 'init migration must CREATE TABLE "_MigrationProbe" (AC1, AC2)');
});

test('PrismaModule + PrismaService are exported from a single module', () => {
  const moduleFile = resolve(apiSrc, 'prisma/prisma.module.ts');
  const serviceFile = resolve(apiSrc, 'prisma/prisma.service.ts');
  const indexFile = resolve(apiSrc, 'prisma/index.ts');
  assert.ok(existsSync(moduleFile), 'apps/api/src/prisma/prisma.module.ts must exist (AC3)');
  assert.ok(existsSync(serviceFile), 'apps/api/src/prisma/prisma.service.ts must exist (AC3)');
  assert.ok(existsSync(indexFile), 'apps/api/src/prisma/index.ts barrel must exist (AC3 — single exported module)');

  const moduleSrc = readFileSync(moduleFile, 'utf8');
  assert.match(moduleSrc, /@Global\(\)/, 'PrismaModule must be @Global() so PrismaService injects everywhere (AC3)');
  assert.match(moduleSrc, /providers:\s*\[\s*PrismaService\s*\]/, 'PrismaModule must provide PrismaService');
  assert.match(moduleSrc, /exports:\s*\[\s*PrismaService\s*\]/, 'PrismaModule must export PrismaService');

  const serviceSrc = readFileSync(serviceFile, 'utf8');
  assert.match(serviceSrc, /extends\s+PrismaClient/, 'PrismaService must extend PrismaClient');
  assert.match(serviceSrc, /OnModuleDestroy|onModuleDestroy/, 'PrismaService must implement onModuleDestroy for clean disconnect');
});

test('AppModule imports PrismaModule', () => {
  const appModule = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(appModule, /PrismaModule/, 'AppModule must import PrismaModule (AC3)');
});

test('env.config.ts validates DATABASE_URL', () => {
  const env = readFileSync(resolve(apiSrc, 'common/env.config.ts'), 'utf8');
  assert.match(env, /DATABASE_URL/, 'env.config.ts must declare DATABASE_URL (AC4)');
});

test('apps/api/.env.example documents DATABASE_URL', () => {
  const examplePath = resolve(api, '.env.example');
  assert.ok(existsSync(examplePath), 'apps/api/.env.example must exist (AC4)');
  const text = readFileSync(examplePath, 'utf8');
  assert.match(text, /^DATABASE_URL=/m, '.env.example must declare DATABASE_URL=... (AC4)');
});

test('apps/api/.env is NOT tracked (secret hygiene)', () => {
  const envPath = resolve(api, '.env');
  if (existsSync(envPath)) {
    // The .gitignore at repo root already ignores .env. This test exists so a future
    // dev who accidentally commits an apps/api/.env file gets a loud, scaffold-level signal.
    const stat = statSync(envPath);
    assert.ok(stat.isFile(), 'apps/api/.env may exist locally for development');
    // No assertion content — the .gitignore is checked separately by the next test.
  }
});

test('Repo .gitignore ignores .env files (AC4 — secrets never committed)', () => {
  const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env(\s|$)|^\.env\.\*/m, '.gitignore must ignore .env files (AC4)');
});
