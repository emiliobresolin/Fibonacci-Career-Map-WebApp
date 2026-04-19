import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readJSON = (path) =>
  JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));

test('AC3: apps/web declares @fcm/domain-contracts via workspace:*', () => {
  const pkg = readJSON('apps/web/package.json');
  assert.equal(
    pkg.dependencies?.['@fcm/domain-contracts'],
    'workspace:*',
    'apps/web must depend on @fcm/domain-contracts with "workspace:*"',
  );
});

test('AC3: apps/api declares both internal packages via workspace:*', () => {
  const pkg = readJSON('apps/api/package.json');
  assert.equal(
    pkg.dependencies?.['@fcm/domain-contracts'],
    'workspace:*',
    'apps/api must depend on @fcm/domain-contracts with "workspace:*"',
  );
  assert.equal(
    pkg.dependencies?.['@fcm/scoring-core'],
    'workspace:*',
    'apps/api must depend on @fcm/scoring-core with "workspace:*"',
  );
});

test('AC3: pnpm install links internal packages to their workspace source', () => {
  const expectations = [
    {
      linkFrom: 'apps/web/node_modules/@fcm/domain-contracts',
      linkTo: 'packages/domain-contracts',
    },
    {
      linkFrom: 'apps/api/node_modules/@fcm/domain-contracts',
      linkTo: 'packages/domain-contracts',
    },
    {
      linkFrom: 'apps/api/node_modules/@fcm/scoring-core',
      linkTo: 'packages/scoring-core',
    },
  ];

  for (const { linkFrom, linkTo } of expectations) {
    const linkPath = resolve(REPO_ROOT, linkFrom);
    assert.ok(
      existsSync(linkPath),
      `expected workspace link at ${linkFrom} — did pnpm install run?`,
    );
    const resolved = realpathSync(linkPath);
    const expected = realpathSync(resolve(REPO_ROOT, linkTo));
    assert.equal(
      resolved,
      expected,
      `${linkFrom} should resolve to ${linkTo}, got ${resolved}`,
    );
  }
});
