// Story 2-7 — scrypt password hashing primitives used by bootstrap
// credentials + recovery codes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { hashPassword, verifyPassword } = await import('../dist/auth/password-hash.js');

test('hashPassword returns a scrypt-format string', async () => {
  const h = await hashPassword('correct horse battery staple');
  assert.match(h, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
});

test('hashPassword produces a different hash for the same input (random salt)', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b);
});

test('verifyPassword returns true for matching plaintext', async () => {
  const h = await hashPassword('s3cret-bootstrap');
  assert.equal(await verifyPassword('s3cret-bootstrap', h), true);
});

test('verifyPassword returns false for wrong plaintext', async () => {
  const h = await hashPassword('s3cret-bootstrap');
  assert.equal(await verifyPassword('wrong-password', h), false);
});

test('verifyPassword returns false on every malformed-hash branch (uniform failure)', async () => {
  // Empty / wrong-prefix
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'bcrypt$...'), false);
  // Wrong segment count
  assert.equal(await verifyPassword('x', 'scrypt$1$2$3$4'), false);
  // Non-numeric parameters
  assert.equal(await verifyPassword('x', 'scrypt$abc$8$1$YQ$Yg'), false);
  // Invalid base64
  assert.equal(await verifyPassword('x', 'scrypt$32768$8$1$!!!$YWFh'), false);
});

test('hashPassword rejects empty plaintext (programming-bug guard)', async () => {
  await assert.rejects(() => hashPassword(''), TypeError);
  await assert.rejects(() => hashPassword(null), TypeError);
});

test('verifyPassword rejects non-string inputs (returns false uniformly)', async () => {
  assert.equal(await verifyPassword(null, 'scrypt$32768$8$1$YQ$Yg'), false);
  assert.equal(await verifyPassword('x', null), false);
});
