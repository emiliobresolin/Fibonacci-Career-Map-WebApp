// Story 2-6 review-fix verification — the RlsContextInterceptor must
// forward the entire downstream Observable (so multi-emit / streaming
// responses keep working) AND keep the ALS scope active across
// awaited continuations triggered by the handler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from 'rxjs';

const { RlsContextInterceptor } = await import('../dist/prisma/rls-context.interceptor.js');
const { RlsScope } = await import('../dist/prisma/rls.helpers.js');

const ORG_ID = '11111111-1111-1111-1111-111111111111';

function makeContext({ user }) {
  const req = { headers: {}, user };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  };
}

function makeNext(observable) {
  return { handle: () => observable };
}

test('interceptor forwards a multi-emit observable (streaming-safe)', async () => {
  const interceptor = new RlsContextInterceptor();
  const upstream = new Observable((sub) => {
    sub.next(1);
    sub.next(2);
    sub.next(3);
    sub.complete();
  });
  const ctx = makeContext({ user: { organization_id: ORG_ID, user_id: 'u', role: 'EMPLOYEE', display_name: 'U' } });
  const out = interceptor.intercept(ctx, makeNext(upstream));
  const values = await new Promise((resolve, reject) => {
    const acc = [];
    out.subscribe({ next: (v) => acc.push(v), error: reject, complete: () => resolve(acc) });
  });
  assert.deepEqual(values, [1, 2, 3]);
});

test('interceptor activates RlsScope.run inside the handler subscription', async () => {
  const interceptor = new RlsContextInterceptor();
  let scopeObservedDuringSubscribe;
  let scopeObservedDuringAsyncContinuation;
  const upstream = new Observable((sub) => {
    scopeObservedDuringSubscribe = RlsScope.current();
    // Schedule an async continuation; AsyncLocalStorage should propagate
    // through setImmediate.
    setImmediate(() => {
      scopeObservedDuringAsyncContinuation = RlsScope.current();
      sub.next('payload');
      sub.complete();
    });
  });
  const ctx = makeContext({ user: { organization_id: ORG_ID, user_id: 'u', role: 'EMPLOYEE', display_name: 'U' } });
  const out = interceptor.intercept(ctx, makeNext(upstream));
  await new Promise((resolve, reject) => {
    out.subscribe({ next: () => {}, error: reject, complete: resolve });
  });
  assert.equal(scopeObservedDuringSubscribe, ORG_ID);
  assert.equal(scopeObservedDuringAsyncContinuation, ORG_ID);
});

test('interceptor short-circuits on non-http transports', () => {
  const interceptor = new RlsContextInterceptor();
  const upstream = new Observable((sub) => {
    sub.next('rpc-payload');
    sub.complete();
  });
  const ctx = { getType: () => 'rpc' };
  const out = interceptor.intercept(ctx, makeNext(upstream));
  assert.equal(out, upstream, 'should return the downstream observable unwrapped');
});

test('interceptor short-circuits when req.user is missing (@Public() route)', () => {
  const interceptor = new RlsContextInterceptor();
  const upstream = new Observable((sub) => {
    sub.next('public-payload');
    sub.complete();
  });
  const ctx = makeContext({ user: undefined });
  const out = interceptor.intercept(ctx, makeNext(upstream));
  assert.equal(out, upstream);
});

test('interceptor short-circuits when req.user.organization_id is not a UUID', () => {
  const interceptor = new RlsContextInterceptor();
  const upstream = new Observable((sub) => {
    sub.complete();
  });
  const ctx = makeContext({ user: { organization_id: 'not-a-uuid', user_id: 'u', role: 'EMPLOYEE', display_name: 'U' } });
  const out = interceptor.intercept(ctx, makeNext(upstream));
  assert.equal(out, upstream);
});

test('interceptor propagates errors emitted by the downstream observable', async () => {
  const interceptor = new RlsContextInterceptor();
  const upstream = new Observable((sub) => {
    sub.error(new Error('handler boom'));
  });
  const ctx = makeContext({ user: { organization_id: ORG_ID, user_id: 'u', role: 'EMPLOYEE', display_name: 'U' } });
  const out = interceptor.intercept(ctx, makeNext(upstream));
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      out.subscribe({ next: () => {}, error: reject, complete: resolve });
    }),
    /handler boom/,
  );
});
