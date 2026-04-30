import { z } from 'zod';

/**
 * Environment variables schema.
 * Validated at NestJS bootstrap via ConfigModule.forRoot({ validate }).
 *
 * Phase 1: auth slice. Two distinct JWT secrets, bcrypt rounds, mail
 * provider config. See docs/15-auth-strategy.md and docs/16-jobs-and-integrations.md.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WEB_URL: z.string().url().default('http://localhost:3000'),

  // ── JWT ────────────────────────────────────────────────
  // Two DISTINCT secrets per docs/15-auth-strategy.md#access-vs-refresh.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // ── Password hashing ───────────────────────────────────
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // ── Mail ───────────────────────────────────────────────
  // Phase 1: SMTP (Mailhog in dev). Phase 9 swaps the provider class to
  // Gmail API per docs/16-jobs-and-integrations.md.
  MAIL_PROVIDER: z.enum(['smtp']).default('smtp'),
  MAIL_SMTP_HOST: z.string().default('localhost'),
  MAIL_SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default('no-reply@magtrans.eu'),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
};
