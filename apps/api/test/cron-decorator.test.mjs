// Story 4-4 — @Cron decorator + HeartbeatCron metadata contract.
//
// .mjs cannot use decorator syntax directly (Node doesn't parse TS
// decorators). We apply the decorator imperatively via the standard
// "decorator as higher-order function" form — semantically identical
// to `@Cron(...)` on a class method.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';

const { Cron, CRON_METADATA_KEY } = await import('../dist/jobs/cron.decorator.js');
const { HeartbeatCron } = await import('../dist/jobs/heartbeat-cron.js');

function applyCron(target, propertyKey, pattern, queueName, options) {
  const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
  Cron(pattern, queueName, options)(target, propertyKey, descriptor);
  Object.defineProperty(target, propertyKey, descriptor);
}

test('Cron decorator stamps pattern + queue + options metadata on the method', () => {
  class Demo {
    daily() {
      return { jobName: 'noop', data: {} };
    }
  }
  applyCron(Demo.prototype, 'daily', '0 0 * * *', '__smoke', { timezone: 'America/Sao_Paulo' });
  const meta = Reflect.getMetadata(CRON_METADATA_KEY, Demo.prototype.daily);
  assert.deepEqual(meta, {
    pattern: '0 0 * * *',
    queueName: '__smoke',
    options: { timezone: 'America/Sao_Paulo' },
  });
});

test('Cron decorator defaults timezone to undefined (registrar applies UTC fallback)', () => {
  class Demo {
    everyFive() {
      return { jobName: 'noop', data: {} };
    }
  }
  applyCron(Demo.prototype, 'everyFive', '*/5 * * * *', '__smoke');
  const meta = Reflect.getMetadata(CRON_METADATA_KEY, Demo.prototype.everyFive);
  assert.equal(meta.pattern, '*/5 * * * *');
  assert.equal(meta.options.timezone, undefined);
});

test('HeartbeatCron registers @Cron metadata on the heartbeat method', () => {
  const meta = Reflect.getMetadata(CRON_METADATA_KEY, HeartbeatCron.prototype.heartbeat);
  assert.ok(meta, 'HeartbeatCron.heartbeat should carry cron metadata');
  assert.equal(meta.pattern, '* * * * *');
  assert.equal(meta.queueName, '__smoke');
});

test('HeartbeatCron.heartbeat returns the BullMQ job spec (jobName + data)', () => {
  const instance = new HeartbeatCron();
  const spec = instance.heartbeat();
  assert.equal(spec.jobName, 'noop');
  assert.deepEqual(spec.data, { echo: 'heartbeat' });
});

test('Cron decorator on non-method targets throws at module-load time', () => {
  assert.throws(() => {
    Cron('* * * * *', '__smoke')({}, 'prop', { value: 'not a function' });
  }, /@Cron can only decorate methods/);
});
