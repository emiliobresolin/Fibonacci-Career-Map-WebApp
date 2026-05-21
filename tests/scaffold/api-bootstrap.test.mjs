// Integration scaffold test: spawns the built API in both modes and asserts behavior.
// Run via `pnpm run test:scaffold` — the script builds @fcm/api first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import net from 'node:net';

const root = resolve(import.meta.dirname, '../..');
const distMain = resolve(root, 'apps/api/dist/main.js');
const distExists = existsSync(distMain);
const skipIfNoDist = { skip: distExists ? false : 'compiled main.js missing — run `pnpm run test:scaffold` which builds first' };

async function getFreePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

// Waits for stdout to satisfy `predicate`. Rejects fast on child exit or stream error
// instead of dangling until the timeout — early failures surface as actionable diffs.
async function waitForLine(child, predicate, timeoutMs = 15000) {
  return new Promise((res, rej) => {
    const buf = [];
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onErr);
      fn(value);
    };
    const t = setTimeout(
      () => settle(rej, new Error(`Timeout waiting for predicate. stdout captured:\n${buf.join('')}`)),
      timeoutMs,
    );
    const onData = (chunk) => {
      buf.push(chunk.toString());
      if (predicate(buf.join(''))) settle(res, buf.join(''));
    };
    const onExit = (code) =>
      settle(rej, new Error(`Child exited (code=${code}) before predicate matched. stdout captured:\n${buf.join('')}`));
    const onErr = (err) => settle(rej, err);
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onErr);
  });
}

function spawnApi(env) {
  return spawn(process.execPath, [distMain], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('compiled main.js exists', () => {
  assert.ok(
    distExists,
    `Expected ${distMain}. Run \`pnpm run test:scaffold\` (builds first) or \`pnpm --filter @fcm/api build\`.`,
  );
});

test('API_MODE=api boots HTTP server and GET /healthz returns {status:"ok"}', skipIfNoDist, async () => {
  const port = await getFreePort();
  const child = spawnApi({ API_MODE: 'api', PORT: String(port), NODE_ENV: 'test' });
  let exitCode = null;
  child.on('exit', (c) => {
    exitCode = c;
  });

  try {
    await waitForLine(child, (s) => /api-mode ready/i.test(s));
    // small grace period to let Express finish binding
    await sleep(150);

    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200, 'GET /healthz must return 200');
    assert.match(
      res.headers.get('content-type') ?? '',
      /application\/json/,
      'GET /healthz must respond with application/json (AC1)',
    );
    const body = await res.json();
    assert.deepEqual(body, { status: 'ok' }, 'GET /healthz must return {status:"ok"} (AC1)');
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    if (exitCode === null) child.kill('SIGKILL');
  }
});

test('API_MODE=worker boots without HTTP and logs "worker-mode ready"', skipIfNoDist, async () => {
  // Positive proof: probe the configured PORT — fetch must fail with a network error
  // because the worker branch never calls .listen(). A regression that accidentally
  // re-introduces HTTP binding under worker mode would make this fetch succeed.
  const port = await getFreePort();
  const child = spawnApi({ API_MODE: 'worker', PORT: String(port), NODE_ENV: 'test' });
  let exitCode = null;
  child.on('exit', (c) => {
    exitCode = c;
  });

  try {
    const stdout = await waitForLine(child, (s) => /worker-mode ready/i.test(s));
    assert.match(stdout, /worker-mode ready/i, 'worker mode must log "worker-mode ready" (AC2)');

    // Race window: by the time we got the log line, any listen() would also have completed.
    // Hit /healthz and assert it fails with a connect-type error, not a successful response.
    let fetchSucceeded = false;
    let fetchError = null;
    try {
      await fetch(`http://127.0.0.1:${port}/healthz`);
      fetchSucceeded = true;
    } catch (err) {
      fetchError = err;
    }
    assert.equal(fetchSucceeded, false, 'worker mode must NOT serve HTTP — fetch should fail (AC2)');
    assert.ok(fetchError, 'fetch must have raised an error');
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    if (exitCode === null) child.kill('SIGKILL');
  }
});

test('API_MODE=unknown exits non-zero and stderr names the offending value', skipIfNoDist, async () => {
  const child = spawnApi({ API_MODE: 'banana', NODE_ENV: 'test' });
  let stderrBuf = '';
  child.stderr.on('data', (c) => {
    stderrBuf += c.toString();
  });

  const code = await new Promise((res) => child.on('exit', res));
  assert.notEqual(code, 0, 'unknown API_MODE must exit non-zero');
  assert.match(stderrBuf, /API_MODE/, 'stderr must mention API_MODE');
  assert.match(stderrBuf, /banana/, 'stderr must surface the offending value (helps operators debug)');
});
