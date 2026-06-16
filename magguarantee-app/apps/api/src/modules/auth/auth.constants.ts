/**
 * Phase 1 auth constants. Values that are tunable at runtime (TTLs, max
 * attempts) live in the AppConfig table — see TwoFactorService for how they
 * are resolved with safe fallbacks.
 *
 * Constants here are structural — cookie names, Redis-key prefixes, header
 * extractor names — and never change at runtime.
 */

// ── Cookies ──────────────────────────────────────────────
export const COOKIE_ACCESS = 'mt_access';
export const COOKIE_REFRESH = 'mt_refresh';

// Refresh cookie is scoped to root ('/') so the browser sends it on web-route
// navigations (full reload / typed URL), letting the Next.js edge middleware
// read `mt_refresh` and perform a server-side silent refresh when the access
// cookie has expired — without this, hard navigations log the user out after
// the 15-min access TTL despite a 30-day refresh token. Exposure stays bounded:
// in prod web+API share one origin (Caddy path-based routing — see
// infra/caddy/Caddyfile) and the cookie remains HttpOnly + Secure + SameSite=Strict.
export const REFRESH_COOKIE_PATH = '/';

// ── Redis key prefixes (docs/15-auth-strategy.md#2fa) ───
export const REDIS_KEY = {
  code: (sessionToken: string) => `2fa:code:${sessionToken}`,
  attempts: (sessionToken: string) => `2fa:attempts:${sessionToken}`,
  lockout: (sessionToken: string) => `2fa:lockout:${sessionToken}`,
  resend: (sessionToken: string) => `2fa:resend:${sessionToken}`,
  session: (sessionToken: string) => `2fa:session:${sessionToken}`,
} as const;

// ── Password-reset Redis key prefixes (own namespace) ───
// Same attempts/lockout/cooldown semantics as the 2FA flow, but a distinct
// `pwreset:*` namespace so a reset code can never satisfy a login verify and
// vice-versa. The code is keyed by `sessionToken` (64-char hex) issued by
// /auth/forgot-password.
export const PWRESET_REDIS_KEY = {
  code: (sessionToken: string) => `pwreset:code:${sessionToken}`,
  attempts: (sessionToken: string) => `pwreset:attempts:${sessionToken}`,
  lockout: (sessionToken: string) => `pwreset:lockout:${sessionToken}`,
  resend: (sessionToken: string) => `pwreset:resend:${sessionToken}`,
  session: (sessionToken: string) => `pwreset:session:${sessionToken}`,
} as const;

// ── 2FA tuning (defaults — overridden by AppConfig at runtime) ──
export const DEFAULT_CODE_TTL_SECONDS = 600;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_LOCKOUT_SECONDS = 300;
export const RESEND_COOLDOWN_SECONDS = 60;

// ── AppConfig keys ───────────────────────────────────────
export const APP_CONFIG_KEY = {
  passwordRequired: 'password_required',
  loginCodeTtlSeconds: 'login_code_ttl_seconds',
  loginMaxAttempts: 'login_max_attempts',
  loginLockoutSeconds: 'login_lockout_seconds',
} as const;

// ── Metadata keys for guards ────────────────────────────
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_METADATA_KEY = 'roles';

// Dummy hash used for constant-time bcrypt compare on unknown logins. Per
// docs/15-auth-strategy.md#account-enumeration, the response shape AND the
// timing must be indistinguishable from a real user with a wrong password.
// This is `bcrypt.hash('not-a-real-password', 12)`. Hard-coded so we don't
// pay 12 rounds at startup.
export const DUMMY_BCRYPT_HASH =
  '$2b$12$1xR5KJwzuvuQUtQwrJtLSerKiJHTYDLzVvjTpwQz1iJzSkNSXdW8K';
