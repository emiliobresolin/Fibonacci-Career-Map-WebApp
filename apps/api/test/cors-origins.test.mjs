// Pure unit test for the CORS allow-list parser used by main.ts when
// configuring `httpApp.enableCors`. Story 2-4 AC3: requests from unlisted
// origins are rejected.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseOrigins } = await import('../dist/common/env.config.js');

test('parseOrigins returns [] for undefined / empty', () => {
  assert.deepEqual(parseOrigins(undefined), []);
  assert.deepEqual(parseOrigins(''), []);
  assert.deepEqual(parseOrigins('   '), []);
});

test('parseOrigins splits on comma and trims whitespace', () => {
  assert.deepEqual(
    parseOrigins('https://a.example.com, https://b.example.com'),
    ['https://a.example.com', 'https://b.example.com'],
  );
});

test('parseOrigins strips trailing slashes so URL-form variants compare equal', () => {
  assert.deepEqual(parseOrigins('https://a.example.com/'), ['https://a.example.com']);
  assert.deepEqual(parseOrigins('https://a.example.com//'), ['https://a.example.com']);
});

test('parseOrigins drops empty entries from stray commas', () => {
  assert.deepEqual(parseOrigins('https://a.example.com,,'), ['https://a.example.com']);
  assert.deepEqual(parseOrigins(',https://a.example.com,'), ['https://a.example.com']);
});

test('parseOrigins preserves explicit ports (cross-origin localhost dev)', () => {
  assert.deepEqual(
    parseOrigins('http://localhost:3000,http://localhost:3001'),
    ['http://localhost:3000', 'http://localhost:3001'],
  );
});
