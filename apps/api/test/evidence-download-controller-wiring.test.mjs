// Story 8-3 — EvidenceDownloadController wiring.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { EvidenceDownloadController } = await import('../dist/evidence/evidence-download.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

test('controller is mounted at v1/evidence', () => {
  assert.equal(Reflect.getMetadata('path', EvidenceDownloadController), 'v1/evidence');
});

test('download handler is GET :id/download', () => {
  const handler = EvidenceDownloadController.prototype.download;
  assert.ok(handler);
  assert.equal(Reflect.getMetadata('path', handler), ':id/download');
  // method 0 = GET in Nest's RequestMethod enum
  assert.equal(Reflect.getMetadata('method', handler), 0);
});

test('download handler is not @Public()', () => {
  const handler = EvidenceDownloadController.prototype.download;
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
});

test('download handler is NOT @Roles-gated — row-level authz lives in the service', () => {
  // A blanket @Roles guard would either over-restrict (MANAGER-only
  // would block employee self-download) or under-restrict (no gate
  // would skip the manager-edge check). The service runs the per-row
  // authorize() pass instead.
  const handler = EvidenceDownloadController.prototype.download;
  assert.equal(Reflect.getMetadata(ROLES_KEY, handler), undefined);
});

test('download handler emits Cache-Control: no-store so intermediate caches do not re-serve the URL', () => {
  // The response body carries a presigned URL tied to one
  // authorization decision. A misconfigured CDN / browser cache
  // could re-serve it to another viewer within the 10-min TTL —
  // defense-in-depth via the response header.
  const handler = EvidenceDownloadController.prototype.download;
  // @nestjs/common stores @Header() metadata under '__headers__'
  const headers = Reflect.getMetadata('__headers__', handler);
  assert.ok(Array.isArray(headers), 'expected @Header() metadata');
  const cacheControl = headers.find((h) => h.name === 'Cache-Control');
  assert.ok(cacheControl, 'Cache-Control header missing');
  assert.equal(cacheControl.value, 'no-store');
});
