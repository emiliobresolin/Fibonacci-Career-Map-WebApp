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
    // without it. A `superRefine` below promotes it to required when NODE_ENV=production
    // so a misconfigured prod pod fails at boot, not at first query.
    DATABASE_URL: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production' && !val.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when NODE_ENV=production',
      });
    }
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
