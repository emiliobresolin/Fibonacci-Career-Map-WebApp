import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const REQUIRED_DIRS = [
  'apps/web',
  'apps/api',
  'packages/domain-contracts',
  'packages/scoring-core',
  'infra/k8s',
  'infra/terraform',
  'infra/grafana',
  'docs',
];

const REQUIRED_FILES = [
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'README.md',
  '.gitignore',
  'apps/web/package.json',
  'apps/web/tsconfig.json',
  'apps/api/package.json',
  'apps/api/tsconfig.json',
  'packages/domain-contracts/package.json',
  'packages/domain-contracts/tsconfig.json',
  'packages/scoring-core/package.json',
  'packages/scoring-core/tsconfig.json',
];

test('AC1: all architecture §18 directories exist', () => {
  for (const dir of REQUIRED_DIRS) {
    const full = resolve(REPO_ROOT, dir);
    assert.ok(existsSync(full), `missing directory: ${dir}`);
    assert.ok(statSync(full).isDirectory(), `not a directory: ${dir}`);
  }
});

test('AC1: required manifests and config files exist', () => {
  for (const file of REQUIRED_FILES) {
    const full = resolve(REPO_ROOT, file);
    assert.ok(existsSync(full), `missing file: ${file}`);
    assert.ok(statSync(full).isFile(), `not a file: ${file}`);
  }
});
