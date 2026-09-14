// Log-safe rendering of "which endpoint was this request for".
//
// One helper shared by the pino-http serializer, the RFC 7807 error filter and
// the audit interceptor, so the three places that write a route into a log line
// or an `audit_log.metadata` row agree on the rules (2026-09-14 logging audit,
// item 2):
//
//   1. Never the query string. Query strings are where lookups put personal
//      data (`?nip=…&account=…`, `?email=…`), and nothing downstream of the
//      request needs them to identify the endpoint.
//   2. Prefer the matched route TEMPLATE (`/api/v1/claims/:nrZgl`) over the
//      concrete path — it is what an operator greps for, and it carries no
//      parameter values at all.
//   3. When no route matched (404s, anything logged before routing ran) the
//      concrete path is all there is. Its segments are passed through a
//      masker that replaces values shaped like personal data (e-mail, long
//      digit runs such as NIP / PESEL / bank account, EU VAT ids, opaque
//      tokens) with a placeholder. None of our own route params look like
//      that, so in practice only hand-crafted / probing URLs get masked.

/**
 * Structural subset of an Express request. Kept structural (not
 * `express.Request`) so unit tests and the raw `IncomingMessage` handed to
 * pino-http callbacks both fit without casts.
 */
export interface RoutableRequest {
  url?: string;
  /** Express: the URL before any router mount-point stripping. */
  originalUrl?: string;
  /** Express: the mount path of the router that matched (usually `''`). */
  baseUrl?: string;
  /** Express: the matched `Route` (`{ path, … }`), set once routing ran. */
  route?: unknown;
}

/** Hard cap so a garbage 10 kB URL cannot bloat every log line it touches. */
const MAX_PATH_LENGTH = 512;

const MASK_EMAIL = ':email';
const MASK_NUMBER = ':number';
const MASK_VAT = ':vat';
const MASK_TOKEN = ':token';

/** `/a/b?x=1#frag` → `/a/b`. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/u);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Concrete path without query string, with personal-data-shaped segments
 * masked and the result length-capped.
 */
export function sanitizePath(url: string): string {
  const path = stripQuery(url)
    .split('/')
    .map(maskSegment)
    .join('/');
  return path.length > MAX_PATH_LENGTH
    ? `${path.slice(0, MAX_PATH_LENGTH)}…`
    : path;
}

/**
 * The matched Express route template including its mount path, or `undefined`
 * when routing has not matched anything (yet).
 */
export function routeTemplate(req: RoutableRequest): string | undefined {
  const route = req.route;
  if (!route || typeof route !== 'object' || !('path' in route)) {
    return undefined;
  }
  const path = (route as { path: unknown }).path;
  if (typeof path !== 'string') return undefined;
  return `${req.baseUrl ?? ''}${path}`;
}

/** Route template when known, otherwise the sanitised concrete path. */
export function routeForLog(req: RoutableRequest): string {
  return routeTemplate(req) ?? sanitizePath(req.originalUrl ?? req.url ?? '');
}

function maskSegment(segment: string): string {
  if (segment === '') return segment;
  const decoded = safeDecode(segment);
  if (decoded.includes('@')) return MASK_EMAIL;
  // NIP (10), REGON (9/14), PESEL (11), bank account (26), phone numbers —
  // optionally with a leading `+` and spaces/dashes as typed into forms.
  if (/^\+?\d[\d\s-]{7,}\d$/u.test(decoded) && countDigits(decoded) >= 9) {
    return MASK_NUMBER;
  }
  // EU VAT id: country prefix + 8–12 digits (`PL1234567890`, `DE123456789`).
  if (/^[A-Za-z]{2}\d{8,12}$/u.test(decoded)) return MASK_VAT;
  // Opaque credentials (JWTs, reset tokens, API keys): long, no separators a
  // human-readable id would have. UUIDs are 36 chars and stay untouched.
  if (/^[A-Za-z0-9._~+=-]{40,}$/u.test(decoded)) return MASK_TOKEN;
  return segment;
}

function countDigits(value: string): number {
  let n = 0;
  for (const ch of value) if (ch >= '0' && ch <= '9') n++;
  return n;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding — mask decisions fall back to the raw text.
    return segment;
  }
}
