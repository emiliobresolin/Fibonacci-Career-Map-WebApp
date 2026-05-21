// Scaffold guardrail: verifies the role-scoped audit read API surface
// defined by Story 3-5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const apiSrc = resolve(root, 'apps/api/src');

test('AuditModule + AuditController + AuditService + audit.types files exist', () => {
  for (const f of ['audit.module.ts', 'audit.controller.ts', 'audit.service.ts', 'audit.types.ts']) {
    assert.ok(existsSync(resolve(apiSrc, 'audit', f)), `apps/api/src/audit/${f} must exist`);
  }
});

test('AppModule wires AuditModule', () => {
  const src = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(src, /AuditModule/, 'AppModule must import AuditModule');
});

test('AuditController declares GET /v1/audit-events and GET /v1/audit-events/export (AC1 + AC2)', () => {
  const src = readFileSync(resolve(apiSrc, 'audit/audit.controller.ts'), 'utf8');
  assert.match(
    src,
    /@Controller\(\s*['"]v1\/audit-events['"]\s*\)/,
    "controller must mount at 'v1/audit-events' (AC1)",
  );
  // List endpoint = @Get() with no path.
  assert.match(src, /@Get\(\)\s*\n\s*async\s+list\(/, 'list endpoint must be @Get() (AC1)');
  // Export = @Get('export') streaming a CSV.
  assert.match(src, /@Get\(\s*['"]export['"]\s*\)/, 'export endpoint must be @Get("export") (AC2)');
  assert.match(src, /text\/csv/, 'export must set content-type text/csv (AC2)');
});

test('AuditService enforces cross-org isolation + per-role scope (AC3 + AC4)', () => {
  const src = readFileSync(resolve(apiSrc, 'audit/audit.service.ts'), 'utf8');
  // Every query must filter by organizationId — the non-negotiable
  // cross-org isolation invariant (AC4).
  assert.match(
    src,
    /"organization_id"\s*=\s*\$\{bind\(actor\.organizationId,\s*'uuid'\)\}/,
    'every query must filter by actor.organizationId (AC4)',
  );
  // EMPLOYEE / MANAGER self-only scope.
  assert.match(
    src,
    /actor\.role\s*===\s*'EMPLOYEE'\s*\|\|\s*actor\.role\s*===\s*'MANAGER'/,
    'EMPLOYEE and MANAGER must get the self-only scope clause (AC3)',
  );
  assert.match(
    src,
    /"actor_id"\s*=\s*\$\{sub1\}\s*OR\s*"entity_id"\s*=\s*\$\{sub2\}/,
    'self-only scope must match actor_id OR entity_id (AC3)',
  );
});

test('AuditService uses cursor-paginated query with tuple-comparison (AC1)', () => {
  const src = readFileSync(resolve(apiSrc, 'audit/audit.service.ts'), 'utf8');
  assert.match(src, /encodeCursor/, 'service must export-style encode cursor (AC1)');
  assert.match(src, /decodeCursor/, 'service must decode cursor (AC1)');
  assert.match(
    src,
    /\("occurred_at",\s*"id"\)\s*<\s*\(/,
    'cursor predicate must use tuple-comparison for monotonic paging (AC1)',
  );
});

test('AuditService.exportCsv streams via async iterable (AC2)', () => {
  const src = readFileSync(resolve(apiSrc, 'audit/audit.service.ts'), 'utf8');
  assert.match(src, /async\s*\*\s*exportCsv/, 'exportCsv must be an async generator (AC2)');
  assert.match(src, /yield\s+toCsvRow/, 'exportCsv must yield CSV rows row-by-row');
  assert.match(src, /yield\s+'id,occurred_at/, 'CSV header must include id,occurred_at,... (AC2)');
});

test('Integration test for the three role scopes exists (AC3 + AC4)', () => {
  const integ = resolve(root, 'tests/integration/audit-read-rbac.test.mjs');
  assert.ok(existsSync(integ), 'AC3/AC4 RBAC integration test must exist');
});
