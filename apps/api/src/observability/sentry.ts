import * as Sentry from '@sentry/node';

// IMPORTANT: like tracing.ts, this MUST be imported at the very top of main.ts
// (after tracing.ts so OTel patches load first). Sentry's auto-capture relies on
// being installed before the modules it wraps.

const dsn = process.env['SENTRY_DSN'];
const env = process.env['NODE_ENV'] ?? 'development';
const apiMode = process.env['API_MODE'] ?? 'api';
const tracesSampleRate = Number.parseFloat(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? '0.05');

if (!dsn) {
  // Self-disable when DSN is unset (dev/test default; prod via explicit operator opt-out).
  process.stdout.write(
    JSON.stringify({
      level: 30,
      msg: 'Sentry disabled — SENTRY_DSN not set',
    }) + '\n',
  );
} else {
  Sentry.init({
    dsn,
    environment: env,
    serverName: `fcm-${apiMode}`,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.05,
    // Console / breadcrumb integration tuning intentionally deferred. Sentry's
    // v8 default integration set is fine for the scaffold; revisit when log
    // volume from Sentry breadcrumbs becomes a cost concern.
    // Redact common credential shapes before sending to Sentry. Production secrets in
    // crash reports is the most common observability footgun.
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
}

export { Sentry };
