// Scaffold guardrail: verifies the NestJS API source layout for Story 1-2.
// Pure file-system assertions — no compilation or spawning required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const apiSrc = resolve(root, 'apps/api/src');

test('main.ts exists as the single bootstrap entrypoint', () => {
  assert.ok(existsSync(resolve(apiSrc, 'main.ts')), 'apps/api/src/main.ts must exist');
});

test('main.ts switches on API_MODE and invokes BOTH Nest factory variants', () => {
  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  assert.match(main, /API_MODE/, 'main.ts must reference API_MODE');
  assert.match(main, /AppModule/, 'main.ts must reference AppModule');
  assert.match(
    main,
    /NestFactory\.create(?:<[^>]+>)?\s*\(/,
    'main.ts must call NestFactory.create for HTTP mode (AC1)',
  );
  assert.match(
    main,
    /NestFactory\.createApplicationContext(?:<[^>]+>)?\s*\(/,
    'main.ts must call NestFactory.createApplicationContext for worker mode (AC2 — no HTTP binding)',
  );
});

test('main.ts uses validateEnv exactly once, not a hand-rolled API_MODE check', () => {
  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  assert.match(main, /validateEnv\s*\(/, 'main.ts must call validateEnv (single validation path)');
  const validateCalls = (main.match(/validateEnv\s*\(/g) ?? []).length;
  assert.equal(validateCalls, 1, `main.ts must call validateEnv exactly once; found ${validateCalls}`);
});

test('main.ts installs shared enableShutdownHooks for both modes', () => {
  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  assert.match(
    main,
    /enableShutdownHooks\s*\(/,
    'main.ts must call enableShutdownHooks so onModuleDestroy / pino-flush fire on SIGTERM (both modes)',
  );
});

test('AppModule imports CommonModule', () => {
  const appModule = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(appModule, /CommonModule/, 'AppModule must import CommonModule (AC3)');
});

test('CommonModule wires pino logger and config from environment', () => {
  const file = resolve(apiSrc, 'common/common.module.ts');
  assert.ok(existsSync(file), 'apps/api/src/common/common.module.ts must exist');
  const src = readFileSync(file, 'utf8');
  assert.match(src, /@Global\(\)/, 'CommonModule must be @Global() so logger+config inject everywhere (AC3)');
  assert.match(src, /ConfigModule/, 'CommonModule must wire @nestjs/config ConfigModule (AC3)');
  assert.match(src, /LoggerModule/, 'CommonModule must wire nestjs-pino LoggerModule (AC3)');
  assert.match(
    src,
    /validate:\s*validateEnv/,
    'CommonModule must use validateEnv as the ConfigModule validator (same Zod schema main.ts uses)',
  );
});

test('Health controller exposes GET /healthz returning the {status:"ok"} literal', () => {
  const file = resolve(apiSrc, 'health/health.controller.ts');
  assert.ok(existsSync(file), 'apps/api/src/health/health.controller.ts must exist');
  const src = readFileSync(file, 'utf8');
  assert.match(
    src,
    /@Controller\(\s*['"]?healthz['"]?\s*\)|@Controller\(\s*['"]?\/?healthz['"]?\s*\)/,
    'HealthController must be mounted at /healthz',
  );
  assert.match(src, /@Get\(/, 'HealthController must declare a GET handler');
  assert.match(src, /status['"]?\s*:\s*['"]ok['"]/, 'HealthController must return {status:"ok"} (AC1)');
});

test('Env config schema validates API_MODE as a strict Zod enum of api|worker', () => {
  const file = resolve(apiSrc, 'common/env.config.ts');
  assert.ok(existsSync(file), 'apps/api/src/common/env.config.ts must exist');
  const src = readFileSync(file, 'utf8');
  assert.match(src, /z\.enum\(API_MODES\)/, 'API_MODE must be validated via z.enum(API_MODES)');
  assert.match(src, /['"]api['"]/, 'env config must list quoted "api" as a valid mode literal');
  assert.match(src, /['"]worker['"]/, 'env config must list quoted "worker" as a valid mode literal');
});
