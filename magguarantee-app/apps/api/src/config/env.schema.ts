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

  // ── Reverse-proxy hop count ────────────────────────────
  // Express `trust proxy`. Says how many proxies sit between the client and
  // this process, which decides WHICH entry of `X-Forwarded-For` becomes
  // `req.ip` — and therefore the address written to the audit log and used as
  // the ThrottlerGuard bucket key.
  //
  //   1 = dev / staging: Caddy is the only proxy.
  //   2 = production: the box sits behind the MAGTRANS corporate nginx, so the
  //       chain is browser → nginx → Caddy → api.
  //
  // Set too LOW and every request is attributed to the nearest proxy: one
  // shared rate-limit bucket for all users and a useless audit trail. Set too
  // HIGH and a client can forge its own address by sending an X-Forwarded-For
  // header of its own, because the hop it injects is counted as trusted. Keep
  // it exactly equal to the real number of hops.
  //
  // Correctness also assumes each proxy in the chain OVERWRITES the header
  // rather than appending to a client-supplied one — see the nginx vhost
  // requirements in docs/23-prod-deployment-runbook.md#33-caddy.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

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
  // Optional hosted logo for the transactional-email header (docs/22-email-design.md).
  // When set, templates render it as a 170px-wide <img alt="MAGTRANS">; when
  // blank (dev/Mailhog, tests) the header falls back to a self-contained text
  // wordmark so no remote asset is fetched. Recommended prod value:
  // https://www.magtrans.eu/img/logo.png. Blank ("") is coerced to undefined so
  // "blank in dev" == "absent". The mail templates read this directly from
  // process.env (a pure presentation constant), so validation here is advisory.
  MAIL_LOGO_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional(),
  ),
  // Recipient of the Maksim over-threshold confirmation-request email
  // (auto-sent at verification when the dopłata crosses the auth threshold).
  // Default = the production director address; override on dev/staging stands so
  // test clicks don't email the real director. Phase 9 may move this to
  // AppConfig (admin-editable without redeploy) — see
  // docs/16-jobs-and-integrations.md.
  MAKSIM_EMAIL: z.string().email().default('maksim.siankevich@magtrans.eu'),

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
  // ── Google SSO + MAGSpace directory (docs/24, трек A) ──
  // Employees sign in with Google; MAGSpace answers "is this an active employee
  // and on which stanowisko"; a mapping table here turns that into a role.
  //
  // GOOGLE_OAUTH_CLIENT_ID is the *Web application* client from the company GCP
  // project — the SAME id the browser bundle is built with
  // (NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID), because it is what the `aud` claim of
  // the incoming id_token must equal. It is a public value, not a secret; there
  // is deliberately no client SECRET here, since the front-side GIS flow never
  // exchanges an authorization code (docs/24 decision #5).
  //
  // Blank == absent (same `z.preprocess` idiom as the optional keys above), and
  // absent means the Google path is simply off: `POST /auth/google` answers 503
  // and everything else — password + 2FA — keeps working. That is what makes a
  // dev or test environment able to boot without any GCP setup.
  GOOGLE_OAUTH_CLIENT_ID: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().optional(),
  ),
  // Workspace domain the `hd` claim must equal. Checking it is NOT optional
  // security theatre: without `hd` any personal @gmail.com whose address
  // happens to match an employee's would verify successfully.
  SSO_ALLOWED_HD: z.string().min(1).default('magtrans.eu'),

  // Base URL of the MAGSpace directory API, reached over the shared docker
  // network `magtrans-internal` — never through Caddy, the `/internal/*` routes
  // are not published. The path prefix (`/internal/v1`) is added by the client,
  // so this is host + port only.
  MAGSPACE_API_URL: z.string().url().default('http://magspace-api:3001'),
  // Bearer token for that API — the same value as in MAGSpace's own `.env`.
  // MAGSpace accepts a comma-separated list so a rotation is add-new → switch
  // here → remove-old; we only ever present one. Blank == absent == the
  // directory is not configured, which degrades exactly like a missing
  // GOOGLE_OAUTH_CLIENT_ID above.
  MAGSPACE_INTERNAL_TOKEN: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(32).optional(),
  ),

  // Reconcile job — pulls the full roster and re-syncs every magspace-managed
  // user. `enforce` applies the changes; `report` only e-mails the admins what
  // it WOULD do, which is the debugging mode. Default is enforce: production is
  // not live yet, so there is no legacy roster to babysit (docs/24 decision #13).
  DIRECTORY_RECONCILE_MODE: z.enum(['enforce', 'report']).default('enforce'),
  // Minutes between runs. This is the worst-case delay between "fired in
  // MAGSpace" and "cannot open MAGGuarantee"; the check at sign-in is always
  // live. Cannot be a @Cron expression — those are fixed at decoration time —
  // so the service registers a dynamic interval instead.
  DIRECTORY_RECONCILE_INTERVAL_MIN: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(15),
  // Kill-switch, same explicit-coercion pattern as GUARANTEE_WATCHDOG_ENABLED:
  // only "true"/"1" mean enabled, an empty/absent value falls through to the
  // default (on). Turning it off freezes the roster — sign-in still syncs the
  // person who signs in, but nobody gets deprovisioned in the background.
  DIRECTORY_RECONCILE_ENABLED: z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === '') return undefined; // fall through to default(true)
      return s === 'true' || s === '1';
    }
    return undefined;
  }, z.boolean().default(true)),

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

  // ── Guarantee Watchdog (plan §6) ───────────────────────
  // Daily cron (07:10 Warsaw) that reminds carriers/opiekuni to report a wyjazd
  // within N Polish working days of a guaranteed vehicle's last return and
  // records violations. Numbers may change per договор — env is cheaper than a
  // migration.
  //
  // GUARANTEE_WATCHDOG_ENABLED — kill-switch. Same explicit-coercion pattern as
  // `ALLOW_PAST_DEPARTURE`: a bare `z.coerce.boolean()` maps the literal string
  // "false" to `true`, so we preprocess by hand — only "true"/"1" mean enabled;
  // "", "false", "0", or absent mean... enabled too, because the DEFAULT is on.
  // The coercion here only distinguishes an explicit falsy value from a truthy
  // one; the `.default(true)` handles the absent case.
  GUARANTEE_WATCHDOG_ENABLED: z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === '') return undefined; // fall through to default(true)
      return s === 'true' || s === '1';
    }
    return undefined;
  }, z.boolean().default(true)),

  // Working days from the anchor (last return / agreement-enable) to the wyjazd
  // deadline. Default 10 (plan §1).
  GUARANTEE_DEADLINE_WORKING_DAYS: z.coerce.number().int().min(1).max(60).default(10),

  // Reminder offsets (working days before the deadline), as a CSV string.
  // Default "3,1" → remind at D-3 and D-1 (plan §1/§5). Parsed + validated to a
  // sorted, positive, de-duplicated `number[]`. An empty/blank value yields the
  // default offsets.
  GUARANTEE_REMINDER_OFFSETS: z.preprocess(
    (v) => {
      if (Array.isArray(v)) return v;
      if (typeof v !== 'string' || v.trim() === '') return [3, 1];
      return v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s));
    },
    z
      .array(z.number().int().positive())
      .min(1)
      .transform((arr) => Array.from(new Set(arr)).sort((a, b) => b - a)),
  ),

  // ── Vehicle-removal alert (vehicle-status rework, Step B) ──
  // Daily cron (07:20 Europe/Warsaw, staggered after the watchdog's 07:10) that
  // emails ALL active admins the list of LIVE vehicles whose derived lifecycle
  // status is `do_usuniecia` (idle ≥29 calendar days — the threshold itself is a
  // SHARED constant, NOT env). Re-sends every N days until the vehicle leaves
  // that bucket.
  //
  // VEHICLE_REMOVAL_ALERT_ENABLED — kill-switch. Same explicit-coercion pattern
  // as `GUARANTEE_WATCHDOG_ENABLED`: a bare `z.coerce.boolean()` maps the literal
  // "false" to `true`, so we preprocess by hand — only "true"/"1" mean enabled;
  // "", "false", "0", or absent fall through to the `.default(true)`.
  VEHICLE_REMOVAL_ALERT_ENABLED: z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === '') return undefined; // fall through to default(true)
      return s === 'true' || s === '1';
    }
    return undefined;
  }, z.boolean().default(true)),

  // Calendar days between repeated admin digests for a still-`do_usuniecia`
  // vehicle. Default 3 (email all admins every 3 days).
  VEHICLE_REMOVAL_ALERT_REPEAT_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .default(3),
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
