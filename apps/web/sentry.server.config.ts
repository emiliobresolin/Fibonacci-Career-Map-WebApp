// Sentry server config — loaded by @sentry/nextjs for the Node.js runtime
// (Server Components, route handlers, edge middleware fallback). DSN comes from
// SENTRY_DSN (server-only; never NEXT_PUBLIC_*).

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
  // Sentry's v8 default integration set is fine for the scaffold; breadcrumb /
  // console-capture tuning deferred until volume becomes a cost concern.
  beforeSend(event) {
    if (event.request?.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (/authorization|cookie|set-cookie|x-api-key/i.test(key)) {
          event.request.headers[key] = '[redacted]';
        }
      }
    }
    return event;
  },
});
