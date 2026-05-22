// Story 6-5: confirm the bulk-import endpoint is ADMIN-only and not
// accidentally @Public(). A regression that drops @Roles('ADMIN') would
// open employee creation to any authenticated MANAGER or EMPLOYEE —
// a privilege-escalation incident.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { EmployeeImportController } = await import(
  '../dist/identity/employee-import.controller.js'
);
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

test('bulkImport handler is gated by @Roles("ADMIN")', () => {
  const handler = EmployeeImportController.prototype.bulkImport;
  assert.ok(handler, 'expected method bulkImport on EmployeeImportController');
  const roles = Reflect.getMetadata(ROLES_KEY, handler);
  assert.deepEqual(
    roles,
    ['ADMIN'],
    'bulkImport must be @Roles("ADMIN") — anything else is a privilege-escalation surface',
  );
});

test('bulkImport handler is NOT @Public()', () => {
  const handler = EmployeeImportController.prototype.bulkImport;
  const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
  assert.notEqual(isPublic, true, 'bulkImport must require a tenant JWT');
});

test('EmployeeImportController is NOT class-level @Public()', () => {
  const classLevelPublic = Reflect.getMetadata(IS_PUBLIC_KEY, EmployeeImportController);
  assert.notEqual(classLevelPublic, true);
});
