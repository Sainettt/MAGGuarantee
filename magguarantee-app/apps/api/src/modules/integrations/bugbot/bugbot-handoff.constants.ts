// BugBot handoff token — fixed values of the contract.
// Source of truth: MAGGuaranteeBugBot docs/06-contracts.md §1.3–§1.8 (mirrored
// by its packages/shared/src/handoff/claims.ts). Only BUGBOT_URL, the slug, the
// kid and the key are deployment-specific; they come from env.

/** `alg` header. BugBot pins it and refuses anything else, `none`/`HS256` included. */
export const BUGBOT_HANDOFF_ALGORITHM = 'ES256';

/** `aud` claim BugBot requires. */
export const BUGBOT_HANDOFF_AUDIENCE = 'bugbot';

/**
 * Token lifetime, seconds (`exp = iat + 60`). BugBot also refuses an `iat`
 * older than this, with 30 s of clock skew either way.
 */
export const BUGBOT_HANDOFF_TTL_SEC = 60;

/** Longest `email` BugBot accepts; a longer one would make the WHOLE token invalid. */
export const BUGBOT_HANDOFF_EMAIL_MAX = 254;

/** Longest `name` BugBot accepts (UTF-16 code units, after trimming). */
export const BUGBOT_HANDOFF_NAME_MAX = 200;

/**
 * Per-USER rate limit of `GET /integrations/bugbot/handoff` — every call is one
 * signature here and one replay row in BugBot (contract §1.8). Keyed by user id,
 * not IP: the office sits behind one NAT and must not share a 10/min bucket.
 * Same test-env bump as the VIES limit so suites never trip it by accident.
 */
export const BUGBOT_HANDOFF_RATE_LIMIT = {
  limit: process.env.NODE_ENV === 'test' ? 1_000 : 10,
  ttl: 60_000,
} as const;

/**
 * Name of the per-user throttler. Distinct from the global `default` one so the
 * two buckets never mix; it also suffixes the response headers
 * (`X-RateLimit-Limit-bugbot-handoff`, `Retry-After-bugbot-handoff`).
 */
export const BUGBOT_HANDOFF_THROTTLER_NAME = 'bugbot-handoff';
