import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJSON = (path) =>
  JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));

const WORKSPACE_TSCONFIGS = [
  'apps/web/tsconfig.json',
  'apps/api/tsconfig.json',
  'packages/domain-contracts/tsconfig.json',
  'packages/scoring-core/tsconfig.json',
];

test('AC2: tsconfig.base.json enables strict mode', () => {
  const base = readJSON('tsconfig.base.json');
  assert.equal(
    base.compilerOptions?.strict,
    true,
    'tsconfig.base.json must set compilerOptions.strict = true',
  );
});

test('AC2: every workspace tsconfig extends ../../tsconfig.base.json', () => {
  for (const path of WORKSPACE_TSCONFIGS) {
    const cfg = readJSON(path);
    assert.equal(
      cfg.extends,
      '../../tsconfig.base.json',
      `${path} must extend ../../tsconfig.base.json`,
    );
  }
});
