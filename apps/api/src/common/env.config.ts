import { z } from 'zod';

export const API_MODES = ['api', 'worker'] as const;
export type ApiMode = (typeof API_MODES)[number];

export const envSchema = z
  .object({
    API_MODE: z.enum(API_MODES),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Optional at schema level so scaffold tests (no DB) and `prisma generate` can run
    // without it. A `superRefine` below promotes it to required when NODE_ENV=production.
    DATABASE_URL: z.string().min(1).optional(),

    // ─── Observability (Story 1-7) ──────────────────────────────────────────────
    // All optional in schema; required-in-production is enforced by superRefine.

    // OTel: where to ship traces. Per Arch §11.3, the OTel collector lives outside
    // the cluster and is provider-pluggable (Datadog / Honeycomb / Tempo / etc.).
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().min(1).default('fcm-api'),

    // Sentry: per-env DSN; missing DSN disables Sentry without crashing the app.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),

    // /metrics basic-auth credentials. Materialized from the cloud secret manager
    // via the same External Secrets path as DATABASE_URL (Story 1-9).
    METRICS_BASIC_AUTH_USER: z.string().min(1).optional(),
    METRICS_BASIC_AUTH_PASS: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV !== 'production') return;
    // Production: every observability + data secret must be set.
    if (!val.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when NODE_ENV=production',
      });
    }
    if (!val.METRICS_BASIC_AUTH_USER || !val.METRICS_BASIC_AUTH_PASS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['METRICS_BASIC_AUTH_USER'],
        message:
          'METRICS_BASIC_AUTH_USER and METRICS_BASIC_AUTH_PASS are required when NODE_ENV=production (the /metrics endpoint must be auth-gated)',
      });
    }
    // SENTRY_DSN and OTEL_EXPORTER_OTLP_ENDPOINT are NOT required in production —
    // they are graceful-degrade signals: if missing, the relevant subsystem
    // self-disables and logs a single warning at boot. Operators can opt out
    // intentionally for cost or per-env policy.
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration. API_MODE must be one of: ${API_MODES.join(', ')}.\n${issues}`,
    );
  }
  return result.data;
}
