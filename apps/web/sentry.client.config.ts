// Sentry client config — loaded by @sentry/nextjs in the browser bundle.
// DSN comes from NEXT_PUBLIC_SENTRY_DSN; an unset DSN silently disables Sentry
// (Sentry SDK no-ops cleanly when init is called with an empty DSN).

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_NODE_ENV ?? 'development',
  tracesSampleRate: Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
  // Browser-only PII redaction — strip query-string params named like tokens / keys.
  beforeSend(event) {
    if (event.request?.url) {
      try {
        const u = new URL(event.request.url);
        for (const key of Array.from(u.searchParams.keys())) {
          if (/(?:token|key|secret|auth|password)/i.test(key)) {
            u.searchParams.set(key, '[redacted]');
          }
        }
        event.request.url = u.toString();
      } catch {
        // ignore URL parsing failures
      }
    }
    return event;
  },
});
