// Scaffold guardrail: verifies the Next.js 14 App Router layout for Story 1-3.
// Pure file-system assertions — no build or runtime required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const web = resolve(root, 'apps/web');
const src = resolve(web, 'src');

test('apps/web declares next + react in dependencies', () => {
  const pkg = JSON.parse(readFileSync(resolve(web, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies?.next, 'next must be a runtime dependency (AC5)');
  assert.ok(pkg.dependencies?.react, 'react must be a runtime dependency');
  assert.ok(pkg.dependencies?.['react-dom'], 'react-dom must be a runtime dependency');
});

test('apps/web declares @tanstack/react-query and zustand', () => {
  const pkg = JSON.parse(readFileSync(resolve(web, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies?.['@tanstack/react-query'], '@tanstack/react-query must be a dependency (AC4)');
  assert.ok(pkg.dependencies?.zustand, 'zustand must be a dependency (AC4)');
});

test('apps/web declares tailwindcss + postcss + autoprefixer + tailwindcss-animate', () => {
  const pkg = JSON.parse(readFileSync(resolve(web, 'package.json'), 'utf8'));
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(allDeps.tailwindcss, 'tailwindcss must be installed (AC2)');
  assert.ok(allDeps.postcss, 'postcss must be installed (AC2)');
  assert.ok(allDeps.autoprefixer, 'autoprefixer must be installed (AC2)');
  assert.ok(
    allDeps['tailwindcss-animate'],
    'tailwindcss-animate must be installed (Dialog motion classes rely on it — AC3)',
  );
});

test('Next.js config and Tailwind config files exist', () => {
  assert.ok(existsSync(resolve(web, 'next.config.mjs')), 'apps/web/next.config.mjs must exist');
  assert.ok(existsSync(resolve(web, 'postcss.config.mjs')), 'apps/web/postcss.config.mjs must exist');
  const tailwindTs = existsSync(resolve(web, 'tailwind.config.ts'));
  const tailwindJs = existsSync(resolve(web, 'tailwind.config.js'));
  assert.ok(tailwindTs || tailwindJs, 'apps/web/tailwind.config.{ts,js} must exist (AC2)');
});

test('Tailwind config registers tailwindcss-animate plugin', () => {
  const tsPath = resolve(web, 'tailwind.config.ts');
  const jsPath = resolve(web, 'tailwind.config.js');
  const cfg = readFileSync(existsSync(tsPath) ? tsPath : jsPath, 'utf8');
  assert.match(cfg, /tailwindcss-animate/, 'tailwind config must register tailwindcss-animate so Dialog motion classes generate (AC3)');
});

test('App Router layout and root page exist', () => {
  assert.ok(existsSync(resolve(src, 'app/layout.tsx')), 'apps/web/src/app/layout.tsx must exist');
  assert.ok(existsSync(resolve(src, 'app/page.tsx')), 'apps/web/src/app/page.tsx must exist (AC1)');
});

test('Placeholder /login and /map routes exist', () => {
  assert.ok(existsSync(resolve(src, 'app/login/page.tsx')), '/login placeholder must exist (AC1)');
  assert.ok(existsSync(resolve(src, 'app/map/page.tsx')), '/map placeholder must exist (AC1)');
});

test('Root page redirects via next/navigation based on a session check', () => {
  const page = readFileSync(resolve(src, 'app/page.tsx'), 'utf8');
  assert.match(page, /from\s+['"]next\/navigation['"]/, 'root page must import from next/navigation (AC1)');
  assert.match(page, /redirect\(/, 'root page must call redirect()');
  assert.match(page, /['"]\/login['"]/, 'root page must reference the /login redirect target (AC1)');
  assert.match(page, /['"]\/map['"]/, 'root page must reference the /map redirect target (AC1)');
  assert.match(page, /getStubSession\(/, 'root page must use the swappable stub session reader (AC1)');
});

test('Root layout sets dark mode and imports QueryProvider', () => {
  const layout = readFileSync(resolve(src, 'app/layout.tsx'), 'utf8');
  assert.match(
    layout,
    /className=['"][^'"]*\bdark\b/,
    'root layout must apply the "dark" class for dark-first theme (AC2)',
  );
  assert.match(
    layout,
    /from\s+['"]@\/components\/providers\/query-provider['"]/,
    'root layout must import QueryProvider from @/components/providers/query-provider (AC4)',
  );
  assert.match(layout, /<QueryProvider[\s>]/, 'root layout must mount <QueryProvider> in JSX (AC4)');
});

test('Tailwind config enables dark-mode class strategy and reads CSS variables', () => {
  const tsPath = resolve(web, 'tailwind.config.ts');
  const jsPath = resolve(web, 'tailwind.config.js');
  const cfg = readFileSync(existsSync(tsPath) ? tsPath : jsPath, 'utf8');
  assert.match(
    cfg,
    /darkMode\s*:\s*\[?['"]class['"]\]?|darkMode\s*:\s*['"]class['"]/,
    'tailwind config must use class-based dark mode (AC2)',
  );
  assert.match(cfg, /hsl\(var\(--/, 'tailwind config must reference CSS variables for color tokens (AC2)');
});

test('Global stylesheet defines :root light + .dark dark CSS variable palettes', () => {
  const css = readFileSync(resolve(src, 'app/globals.css'), 'utf8');
  assert.match(css, /:root\s*\{[\s\S]*?--background[\s\S]*?\}/, 'globals.css must define a :root palette with --background (AC2)');
  assert.match(css, /\.dark\s*\{[\s\S]*?--background[\s\S]*?\}/, 'globals.css must define a .dark palette with --background (AC2)');
  assert.match(css, /@tailwind\s+base/, 'globals.css must include @tailwind base layer (AC2)');
  assert.match(css, /@tailwind\s+components/, 'globals.css must include @tailwind components layer (AC2)');
  assert.match(css, /@tailwind\s+utilities/, 'globals.css must include @tailwind utilities layer (AC2)');
});

test('shadcn-style UI primitives Button, Dialog, Input exist', () => {
  assert.ok(existsSync(resolve(src, 'components/ui/button.tsx')), 'Button primitive must exist (AC3)');
  assert.ok(existsSync(resolve(src, 'components/ui/dialog.tsx')), 'Dialog primitive must exist (AC3)');
  assert.ok(existsSync(resolve(src, 'components/ui/input.tsx')), 'Input primitive must exist (AC3)');
});

test('components.json marker file exists (shadcn convention)', () => {
  assert.ok(existsSync(resolve(web, 'components.json')), 'apps/web/components.json (shadcn config) must exist (AC3)');
});

test('cn() helper exists at src/lib/utils', () => {
  const file = resolve(src, 'lib/utils.ts');
  assert.ok(existsSync(file), 'apps/web/src/lib/utils.ts must exist (cn helper for shadcn primitives)');
  const utils = readFileSync(file, 'utf8');
  assert.match(utils, /export\s+function\s+cn\b|export\s+const\s+cn\b/, 'utils.ts must export a cn() helper');
});

test('Zustand store module exports useUIStore', () => {
  const file = resolve(src, 'stores/ui-store.ts');
  assert.ok(existsSync(file), 'apps/web/src/stores/ui-store.ts must exist (AC4 — Zustand store mount point)');
  const store = readFileSync(file, 'utf8');
  assert.match(store, /from\s+['"]zustand['"]/, 'ui-store must import from zustand');
  assert.match(store, /export\s+const\s+useUIStore\b/, 'ui-store must export useUIStore (AC4)');
});
