// Scaffold guardrail: verifies the audit-event contract surface
// (Story 3-4, PRD §10.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const dc = resolve(root, 'packages/domain-contracts');
const dcSrc = resolve(dc, 'src');

test('domain-contracts declares zod dependency', () => {
  const pkg = JSON.parse(readFileSync(resolve(dc, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies?.['zod'], 'zod must be a direct dep (used for AuditEventSchema)');
});

test('events/audit.ts exists and exports the 11 PRD §10.1 event variants', () => {
  const audit = resolve(dcSrc, 'events/audit.ts');
  assert.ok(existsSync(audit), 'packages/domain-contracts/src/events/audit.ts must exist');
  const src = readFileSync(audit, 'utf8');
  for (const eventType of [
    "'evidence.submitted'",
    "'evidence.approved'",
    "'evidence.rejected'",
    "'score.recalculated'",
    "'configuration.changed'",
    "'promotion.initiated'",
    "'promotion.decided'",
    "'promotion.completed'",
    "'role_assignment.changed'",
    "'visibility_rule.changed'",
    "'approval_workflow.changed'",
  ]) {
    assert.ok(src.includes(eventType), `event-type literal ${eventType} must be declared (AC1)`);
  }
  // Discriminated union keyed on eventType.
  assert.match(src, /discriminatedUnion\(\s*['"]eventType['"]/, 'must use a Zod discriminatedUnion on eventType (AC1)');
  // Required base fields enumerated in AC2.
  for (const field of ['eventId', 'occurredAt', 'actorId', 'organizationId', 'entityId']) {
    assert.match(src, new RegExp(`\\b${field}:`), `AuditBase must declare ${field} (AC2)`);
  }
  // Approval / rejection / promotion-decided reasons are required per PRD §10.1.
  assert.match(src, /reason:\s*z\.string\(\)\.min\(1\)/, 'at least one variant must require a non-empty reason (PRD §10.1)');
});

test('parseAuditEvent + safeParseAuditEvent are exported (AC3)', () => {
  const audit = readFileSync(resolve(dcSrc, 'events/audit.ts'), 'utf8');
  assert.match(audit, /export function parseAuditEvent/, 'parseAuditEvent must be exported (AC3)');
  assert.match(audit, /export function safeParseAuditEvent/, 'safeParseAuditEvent must be exported (AC3)');
});

test('OutboxRelayConsumer calls safeParseAuditEvent before persisting (AC3)', () => {
  const src = readFileSync(
    resolve(root, 'apps/api/src/outbox/outbox-relay.consumer.ts'),
    'utf8',
  );
  assert.match(src, /safeParseAuditEvent/, 'relay consumer must validate payloads before INSERT (AC3)');
  assert.match(
    src,
    /from\s+['"]@fcm\/domain-contracts['"]/,
    'relay consumer must import from @fcm/domain-contracts',
  );
});

test('Unit tests for the contract exist (AC4)', () => {
  const unit = resolve(dcSrc, 'events/audit.test.ts');
  assert.ok(existsSync(unit), 'packages/domain-contracts/src/events/audit.test.ts must exist (AC4)');
});

test('domain-contracts re-exports the events module from its barrel', () => {
  const idx = readFileSync(resolve(dcSrc, 'index.ts'), 'utf8');
  assert.match(idx, /events\/index/, "src/index.ts must re-export from './events/index.js'");
});
