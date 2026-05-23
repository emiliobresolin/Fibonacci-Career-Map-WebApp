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

    // ─── Async jobs (Story 4-1) ─────────────────────────────────────────────────
    // BullMQ on Redis 7+. Production-required (Arch §7.1); optional in dev/test
    // so the api can boot without Redis for scaffold work.
    REDIS_URL: z.string().min(1).optional(),

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

    // ─── Auth / OIDC / JWT (Story 2-2) ──────────────────────────────────────────
    // Single redirect URI for the web origin's NextAuth callback. Multi-org
    // installations route through the same URL and disambiguate via the
    // organization slug embedded in the OIDC `state` parameter.
    OIDC_REDIRECT_URI: z.string().url().optional(),
    // Symmetric HS256 signing key. Rotated via Secrets Manager (Story 1-9). When
    // SCIM / cross-service JWT verification arrives, swap to RS256 + JWKS.
    JWT_SIGNING_SECRET: z.string().min(32).optional(),
    // Short-lived access tokens (15 min default per PRD FR-1.5 +- AC4) and longer
    // refresh tokens (24 h default; refresh lives in the NextAuth session, not
    // sent to the browser).
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),

    // ─── Internal provisioning (Story 6-1) ──────────────────────────────────────
    // Shared secret used by bootstrap tooling to authenticate POST /v1/organizations.
    // The endpoint is opaque to tenant Admins — it's called by the operator-side
    // provisioning tool, NOT by any end-user JWT. Required in production; in
    // dev/test the endpoint closed-fails (401) when unset.
    //
    // Min 32 chars matches the JWT-secret minimum; both are operator-facing
    // shared secrets with similar threat properties (theft → unauthorized
    // tenant creation).
    INTERNAL_PROVISIONING_TOKEN: z.string().min(32).optional(),

    // ─── CORS lock-down (Story 2-4) ─────────────────────────────────────────────
    // Comma-separated allow-list of web origins permitted to call the API.
    // Empty/unset means CORS is effectively closed (no cross-origin requests
    // succeed) — same-origin calls from the web container are always allowed.
    // Production env-validation below promotes this to required.
    CORS_ALLOWED_ORIGINS: z.string().optional(),

    // ─── Evidence storage (Story 8-2) ───────────────────────────────────────────
    // S3 bucket holding evidence objects. Required in production; optional in
    // dev/test so the api can boot without S3 wired. Keys land under
    // `org/{organization_id}/evidence/{employee_id}/{evidence_id}/{filename}`
    // (Arch §9.1 / AD-9). The bucket itself is provisioned by Story 1-5
    // (terraform).
    EVIDENCE_S3_BUCKET: z.string().min(1).optional(),
    // Optional override of the S3 endpoint URL — used by LocalStack / Minio
    // in dev. Leave unset in production so the SDK resolves the real AWS
    // regional endpoint.
    EVIDENCE_S3_ENDPOINT_URL: z.string().url().optional(),
    // AWS region the bucket lives in. The SDK falls back to AWS_REGION /
    // AWS_DEFAULT_REGION when unset, but pinning it here makes the
    // intended region explicit at the app layer.
    AWS_REGION: z.string().min(1).optional(),
    // Upload-slot TTL in seconds (AC1: 15 min). Tunable for tests; production
    // should leave the default.
    EVIDENCE_UPLOAD_SLOT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    // Max allowed size for a single file evidence upload (AC1
    // "content-length-range bounded"). Defaults to 25 MiB which fits typical
    // PDF / image / spreadsheet evidence without blowing the bucket's
    // per-object lifecycle cost target. Operators can raise this for orgs
    // that need to store screen recordings.
    EVIDENCE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
    // Min upload size — 1 byte by default. A non-trivial minimum (e.g. 64)
    // would block "empty file" uploads at the presigned-URL layer, but most
    // S3 clients can't enforce that without server feedback; leave the
    // minimum loose and let the requirement-type validation catch
    // empty-payload cases.
    EVIDENCE_UPLOAD_MIN_BYTES: z.coerce.number().int().nonnegative().default(1),
    // Download-slot TTL in seconds (Story 8-3 AC1: 10 min). A short
    // TTL bounds the exposure window if a presigned URL is leaked
    // (forwarded link, observed in a proxy log). Operators can tune
    // for browsers/networks where 10 min is too aggressive.
    EVIDENCE_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(600),
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
    if (!val.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required when NODE_ENV=production (BullMQ queues)',
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
    if (!val.OIDC_REDIRECT_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OIDC_REDIRECT_URI'],
        message: 'OIDC_REDIRECT_URI is required when NODE_ENV=production',
      });
    }
    if (!val.JWT_SIGNING_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SIGNING_SECRET'],
        message: 'JWT_SIGNING_SECRET (≥32 chars) is required when NODE_ENV=production',
      });
    }
    if (!val.INTERNAL_PROVISIONING_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['INTERNAL_PROVISIONING_TOKEN'],
        message:
          'INTERNAL_PROVISIONING_TOKEN (≥32 chars) is required when NODE_ENV=production (POST /v1/organizations gate)',
      });
    }
    if (!val.CORS_ALLOWED_ORIGINS || parseOrigins(val.CORS_ALLOWED_ORIGINS).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ALLOWED_ORIGINS'],
        message:
          'CORS_ALLOWED_ORIGINS must list at least one origin when NODE_ENV=production',
      });
    }
    // SENTRY_DSN and OTEL_EXPORTER_OTLP_ENDPOINT are NOT required in production —
    // they are graceful-degrade signals: if missing, the relevant subsystem
    // self-disables and logs a single warning at boot. Operators can opt out
    // intentionally for cost or per-env policy.
    // Story 8-2: evidence storage requires both bucket and region in
    // production. EVIDENCE_S3_ENDPOINT_URL stays optional (only set for
    // LocalStack/Minio dev runs).
    if (!val.EVIDENCE_S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EVIDENCE_S3_BUCKET'],
        message:
          'EVIDENCE_S3_BUCKET is required when NODE_ENV=production (evidence finalize flow)',
      });
    }
    if (!val.AWS_REGION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AWS_REGION'],
        message: 'AWS_REGION is required when NODE_ENV=production (S3 client)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Split CORS_ALLOWED_ORIGINS — a comma-separated allow-list string — into
 * normalised origin entries. Whitespace is trimmed, empties dropped, and
 * trailing slashes stripped so `https://app.example.com` and
 * `https://app.example.com/` are treated identically.
 */
export function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0);
}

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
