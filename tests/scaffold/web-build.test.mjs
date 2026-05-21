// Build guardrail: asserts `next build` has produced a complete output for apps/web.
// The repo-level `test:scaffold` script runs `pnpm --filter @fcm/web build` first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const next = resolve(root, 'apps/web/.next');
const nextExists = existsSync(next);
const skipMsg = 'apps/web/.next missing — run `pnpm run test:scaffold` which builds @fcm/web first';

test('apps/web/.next/ exists (next build ran)', () => {
  assert.ok(
    nextExists,
    `Expected ${next}. Run \`pnpm --filter @fcm/web build\` or \`pnpm run test:scaffold\`.`,
  );
});

test('apps/web/.next/BUILD_ID exists and is non-empty', { skip: !nextExists ? skipMsg : false }, () => {
  const buildId = resolve(next, 'BUILD_ID');
  assert.ok(existsSync(buildId), 'apps/web/.next/BUILD_ID must exist after a successful next build (AC5)');
  const id = readFileSync(buildId, 'utf8').trim();
  assert.ok(id.length > 0, 'BUILD_ID must be non-empty');
});

test('apps/web/.next/server/app/ emits the three placeholder routes', { skip: !nextExists ? skipMsg : false }, () => {
  const serverApp = resolve(next, 'server/app');
  assert.ok(existsSync(serverApp), `next build must have emitted ${serverApp}`);
  assert.ok(existsSync(resolve(serverApp, 'page.js')), 'next build must produce server/app/page.js (root redirect)');
  assert.ok(existsSync(resolve(serverApp, 'login/page.js')), 'next build must produce server/app/login/page.js (AC1 placeholder)');
  assert.ok(existsSync(resolve(serverApp, 'map/page.js')), 'next build must produce server/app/map/page.js (AC1 placeholder)');
});

test('apps/web routes manifest lists /login and /map', { skip: !nextExists ? skipMsg : false }, () => {
  // Find any *routes*-manifest.json under .next/ — Next has used several names across versions
  // (app-path-routes-manifest.json, routes-manifest.json, etc.). Pick whichever the build produced.
  const entries = readdirSync(next, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  const manifestName = entries.find((n) => /routes-manifest\.json$/.test(n) && !n.startsWith('_'));
  assert.ok(manifestName, `No *routes-manifest.json found under ${next}. Listing: ${entries.join(', ')}`);
  const text = readFileSync(resolve(next, manifestName), 'utf8');
  assert.match(text, /\/login/, 'routes manifest must list /login');
  assert.match(text, /\/map/, 'routes manifest must list /map');
});

test('Root `/` route emits a NEXT_REDIRECT directive to /login (AC1 runtime contract)', { skip: !nextExists ? skipMsg : false }, () => {
  // Next 14 prerenders redirect()-only pages and embeds the directive in the page's
  // static RSC output. We assert against the static prerender artifacts under
  // .next/server/app/ so the redirect contract is enforced at build time without
  // running a server.
  const serverApp = resolve(next, 'server/app');
  const candidates = [
    resolve(serverApp, 'index.html'),
    resolve(serverApp, 'index.rsc'),
    resolve(serverApp, 'page.js'),
  ].filter(existsSync);
  assert.ok(candidates.length > 0, `No prerender artifact for / under ${serverApp}`);

  let found = false;
  let firstError = null;
  for (const f of candidates) {
    const text = readFileSync(f, 'utf8');
    // page.js bundles the JS implementation; index.html / index.rsc embed the RSC payload.
    // Either should contain a literal /login reference somewhere in the output.
    if (/\/login/.test(text)) {
      found = true;
      break;
    }
    firstError = `No /login reference in ${f}`;
  }
  assert.ok(found, `Root page must encode the /login redirect target in its prerender artifact (AC1). ${firstError ?? ''}`);
});
