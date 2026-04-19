import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJSON = (path) =>
  JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));

test('AC1: root package.json declares pnpm as packageManager', () => {
  const pkg = readJSON('package.json');
  assert.equal(pkg.private, true, 'root package must be private');
  assert.match(
    pkg.packageManager ?? '',
    /^pnpm@\d+\.\d+\.\d+/,
    'packageManager must be pinned to pnpm@<version>',
  );
});

test('AC1: pnpm-workspace.yaml lists apps/* and packages/*', () => {
  const yaml = readFileSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
  assert.match(yaml, /apps\/\*/, 'pnpm-workspace.yaml must include apps/*');
  assert.match(yaml, /packages\/\*/, 'pnpm-workspace.yaml must include packages/*');
});

test('AC1: root scripts expose dev, build, typecheck, test', () => {
  const pkg = readJSON('package.json');
  for (const script of ['dev', 'build', 'typecheck', 'test']) {
    assert.ok(pkg.scripts?.[script], `root package.json missing script: ${script}`);
  }
});
