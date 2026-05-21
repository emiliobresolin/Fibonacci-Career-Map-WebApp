// Scaffold guardrail: verifies the Redis-backed session store + forced
// logout surface defined by Story 2-3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const apiSrc = resolve(root, 'apps/api/src');

test('SessionsModule + SessionStoreService + SessionsController files exist', () => {
  for (const f of ['session-store.service.ts', 'sessions.controller.ts', 'sessions.module.ts']) {
    assert.ok(existsSync(resolve(apiSrc, 'sessions', f)), `apps/api/src/sessions/${f} must exist`);
  }
});

test('AuthModule imports SessionsModule + registers SessionsController', () => {
  const src = readFileSync(resolve(apiSrc, 'auth/auth.module.ts'), 'utf8');
  assert.match(src, /SessionsModule/, 'AuthModule must import SessionsModule (AC1)');
  assert.match(src, /SessionsController/, 'AuthModule must register the admin SessionsController (AC2)');
});

test('SessionStoreService indexes sessions by (orgId, userId, jti) (AC1)', () => {
  const src = readFileSync(resolve(apiSrc, 'sessions/session-store.service.ts'), 'utf8');
  assert.match(src, /`session:\$\{orgId\}:\$\{userId\}:\$\{jti\}`/, 'key pattern must include orgId, userId, jti (AC1)');
  assert.match(src, /async\s+register\(/, 'register() must exist');
  assert.match(src, /async\s+isActive\(/, 'isActive() must exist');
  assert.match(src, /async\s+revokeAll\(/, 'revokeAll() must exist');
  // SCAN + DEL not KEYS — KEYS blocks the Redis main thread.
  assert.match(src, /scan\(cursor/i, 'revokeAll must use SCAN cursor pagination, not KEYS');
});

test('SessionsController exposes POST :userId/revoke + ADMIN role gate (AC2)', () => {
  const src = readFileSync(resolve(apiSrc, 'sessions/sessions.controller.ts'), 'utf8');
  assert.match(src, /@Controller\(\s*['"]auth\/sessions['"]\s*\)/, 'mounted at /auth/sessions (AC2)');
  assert.match(src, /@Post\(\s*['"]:userId\/revoke['"]\s*\)/, 'POST /auth/sessions/:userId/revoke (AC2)');
  assert.match(src, /role\s*!==\s*['"]ADMIN['"]/, 'must reject non-ADMIN actors (AC2)');
  assert.match(src, /target\.organizationId\s*!==\s*actor\.organizationId/, 'cross-org revoke must be blocked');
});

test('SessionsController emits a session.revoked outbox event (AC4)', () => {
  const src = readFileSync(resolve(apiSrc, 'sessions/sessions.controller.ts'), 'utf8');
  assert.match(src, /outboxEvent\.create/, 'revoke must insert into outbox_events (AC4)');
  assert.match(src, /eventType:\s*['"]session\.revoked['"]/, 'event type must be session.revoked (AC4)');
});

test('JwtService threads jti through sign + verify (AC1 + AC3)', () => {
  const src = readFileSync(resolve(apiSrc, 'auth/jwt.service.ts'), 'utf8');
  // setJti is the jose-canonical way; we also pass jti in the payload.
  assert.match(src, /setJti\(payload\.jti\)/, 'signAccess must set jti as the JWT jti claim (AC1)');
  assert.match(src, /jti:\s*payload\.jti/, 'jti must round-trip through payload + verify');
});

test('AuthController registers + rotates jti on login + refresh (AC1)', () => {
  const src = readFileSync(resolve(apiSrc, 'auth/auth.controller.ts'), 'utf8');
  assert.match(src, /this\.sessions\.register\(/, 'login + refresh must register the session jti');
  // randomUUID minted in both callback and refresh paths.
  const occurrences = (src.match(/randomUUID\(\)/g) ?? []).length;
  assert.ok(occurrences >= 2, 'jti must be minted on both login (callback) and refresh (got ' + occurrences + ' randomUUID() calls)');
});

test('AuditController checks session-validity on every authenticated request (AC2 enforcement)', () => {
  const src = readFileSync(resolve(apiSrc, 'audit/audit.controller.ts'), 'utf8');
  assert.match(src, /this\.sessions\.isActive\(/, 'requireActor must check the Redis session store (AC2)');
  assert.match(src, /Session revoked/, 'revoked sessions must produce a clear 401 message');
});

test('AuditEvent taxonomy includes session.revoked variant (AC4)', () => {
  const audit = readFileSync(resolve(root, 'packages/domain-contracts/src/events/audit.ts'), 'utf8');
  assert.match(audit, /SessionRevokedSchema/, 'session.revoked schema must exist (AC4)');
  assert.match(audit, /'session\.revoked'/, "session.revoked literal must be in the taxonomy (AC4)");
});

test('Integration test for the revoke flow exists', () => {
  const integ = resolve(root, 'tests/integration/session-revoke.test.mjs');
  assert.ok(existsSync(integ), 'AC2 + AC3 + AC4 revoke integration test must exist');
});
