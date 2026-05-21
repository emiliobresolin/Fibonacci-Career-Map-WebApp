// Sentry edge runtime config — loaded by @sentry/nextjs for middleware and edge
// route handlers. Same DSN as the server config; tracesSampleRate may be lower
// here because edge invocations are typically lightweight.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
});
