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

  // ── Google Chat wyjazd-notification webhook ───────────
  // Incoming-webhook URL of the standing "wyjazdy" Chat space. When UNSET
  // the chat processor no-ops silently (completes the job, logs a skip) so
  // dev / test / Mailhog environments don't fail. Follows the optional-secret
  // pattern of the GPS vendor keys — empty in dev, populated in prod.
  // See docs/16-jobs-and-integrations.md#google-chat-notifications.
  // `.env.example` ships an empty value — coerce "" → undefined so the
  // optional URL validator treats "blank in dev" the same as "absent".
  GOOGLE_CHAT_WYJAZD_WEBHOOK_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  ),

  // ── JWT ────────────────────────────────────────────────
  // Two DISTINCT secrets per docs/15-auth-strategy.md#access-vs-refresh.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // ── Password hashing ───────────────────────────────────
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // ── Mail ───────────────────────────────────────────────
  // Dev/staging: SMTP → Mailhog (default). Production: Gmail API
  // (`MAIL_PROVIDER=gmail`) per docs/16-jobs-and-integrations.md. The provider
  // is selected at runtime in MailModule; the `GMAIL_*` secrets below are
  // required ONLY when `MAIL_PROVIDER=gmail` (enforced by superRefine).
  MAIL_PROVIDER: z.enum(['smtp', 'gmail']).default('smtp'),
  MAIL_SMTP_HOST: z.string().default('localhost'),
  MAIL_SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default('no-reply@magtrans.eu'),

  // ── Gmail API (production provider — OAuth 2.0) ─────────
  // Production sends via the Gmail API authenticated as ONE Workspace mailbox
  // through OAuth 2.0 (authorization-code + a long-lived refresh token), NOT
  // Domain-Wide Delegation — chosen for least-privilege (a leaked token can
  // send as one mailbox, not the whole domain). Empty in dev/staging `.env`
  // (Mailhog path); `""` is coerced to undefined so blank-in-dev == absent.
  // The superRefine below upgrades the OAuth trio + GMAIL_FROM to required when
  // MAIL_PROVIDER=gmail. Get GMAIL_OAUTH_REFRESH_TOKEN once via
  // `npm run gmail:token`. See docs/16-jobs-and-integrations.md.
  GMAIL_OAUTH_CLIENT_ID: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  GMAIL_OAUTH_CLIENT_SECRET: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  GMAIL_OAUTH_REFRESH_TOKEN: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  // From header shown to recipients. May be the OAuth mailbox itself or one of
  // its aliases (a valid send-as of that mailbox, e.g. magguarantee@magtrans.eu).
  GMAIL_FROM: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  // ── App URL (used for deeplinks in transactional emails) ──
  // Same value as WEB_URL today; kept as a separate key so we can later
  // point email links at a different host (e.g. a public mirror) without
  // touching the CORS-driven WEB_URL.
  APP_URL: z.string().url().default('http://localhost:3000'),

  // ── S3 / object storage (MinIO in dev) ────────────────
  // Vehicle umowa / cabotage screenshot uploads (VehicleAttachment). Per
  // docs/16-jobs-and-integrations.md#файловое-хранилище--s3.
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),

  // ── GPS tracker (Phase 2 skeleton) ────────────────────
  // Per docs/16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api.
  // Mock provider is the default until MAGTRANS supplies real credentials.
  GPS_PROVIDER: z.enum(['mock', 'vendor']).default('mock'),
  GPS_VENDOR_BASE_URL: z.string().default(''),
  GPS_VENDOR_API_KEY: z.string().default(''),
  GPS_POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(90),
  GPS_CACHE_TTL_SEC: z.coerce.number().int().positive().default(300),

  // ── Feature flags / testing ────────────────────────────
  // ALLOW_PAST_DEPARTURE — default false = ENFORCE in prod (a carrier may NOT
  // register a wyjazd whose `departureAt` is in the past). Set true ONLY in
  // dev/test/e2e to allow backdated departures (fixture dates).
  //
  // NOTE on coercion: a bare `z.coerce.boolean()` is a footgun here — it maps
  // ANY non-empty string (including the literal "false") to `true`, so
  // `ALLOW_PAST_DEPARTURE=false` in `.env` would silently ENABLE the bypass.
  // We therefore preprocess the raw string explicitly (the same `z.preprocess`
  // precedent used for the optional URL/secret keys above): only "true"/"1"
  // (case-insensitive) mean true; "", "false", "0", or an absent value mean
  // false. This keeps the literal `.env` value semantics intact.
  ALLOW_PAST_DEPARTURE: z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      return s === 'true' || s === '1';
    }
    return false;
  }, z.boolean().default(false)),
}).superRefine((env, ctx) => {
  // Gmail secrets are required only when the Gmail provider is selected — keeps
  // dev/staging `.env` (Mailhog) clean while still failing fast at boot in prod
  // if a credential is missing (rather than at first send). Mirrors the GPS
  // optional-secret precedent.
  if (env.MAIL_PROVIDER === 'gmail') {
    for (const key of [
      'GMAIL_OAUTH_CLIENT_ID',
      'GMAIL_OAUTH_CLIENT_SECRET',
      'GMAIL_OAUTH_REFRESH_TOKEN',
      'GMAIL_FROM',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when MAIL_PROVIDER=gmail`,
        });
      }
    }
  }
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
