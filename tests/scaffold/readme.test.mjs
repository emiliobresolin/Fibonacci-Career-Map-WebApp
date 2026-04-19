import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const README = readFileSync(resolve(REPO_ROOT, 'README.md'), 'utf8');

test('AC4: README documents workspace layout', () => {
  assert.match(README, /Workspace Layout/i, 'README must document Workspace Layout');
  for (const path of ['apps/web', 'apps/api', 'packages/domain-contracts', 'packages/scoring-core', 'infra/', 'docs/']) {
    assert.ok(
      README.includes(path),
      `README must reference workspace path: ${path}`,
    );
  }
});

test('AC4: README documents dev/build commands', () => {
  assert.match(README, /pnpm install/, 'README must document install command');
  assert.match(README, /pnpm dev/, 'README must document dev command');
  assert.match(README, /pnpm build/, 'README must document build command');
  assert.match(README, /pnpm typecheck/, 'README must document typecheck command');
});
