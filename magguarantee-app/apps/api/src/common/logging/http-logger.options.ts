// pino-http configuration for `LoggerModule.forRoot` (app.module.ts).
//
// Lives outside app.module.ts so it can be unit-tested without importing the
// whole application graph (ConfigModule validates the env at import time).
//
// PII policy per docs/16-jobs-and-integrations.md#логирование and the
// 2026-09-14 logging audit (items 2, 16):
//
//   * The request is logged as method + path WITHOUT query string (masked, see
//     `request-path.ts`), plus the client IP and a short allow-list of headers.
//     `query` and `params` are never logged raw — pino's default request
//     serializer dumps both, which is how `?nip=…&account=…` reached the logs.
//   * The "request completed" line additionally carries `route`, the matched
//     route template (`/api/v1/claims/:nrZgl`). It is only known once routing
//     ran, so it cannot be part of the request binding, which pino-http
//     serializes when the request arrives.
//   * `redact` covers secret-named keys at the top level and two levels deep —
//     pino's `*.key` wildcard alone only reaches one level.

import type { DestinationStream } from 'pino';
import type { Params } from 'nestjs-pino';

import { clientIp } from '../utils/client-ip';
import { routeForLog, sanitizePath, stripQuery } from './request-path';

type PinoHttpOptions = Exclude<
  NonNullable<Params['pinoHttp']>,
  DestinationStream | readonly unknown[]
>;

/** Shape pino-std-serializers hands to a custom `req` serializer. */
interface WrappedRequest {
  id?: unknown;
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  /** The original request object (non-enumerable on the wrapper). */
  raw?: { ip?: string };
}

/** Request headers worth a log line. Everything else is dropped. */
const LOGGED_HEADERS = ['user-agent', 'content-type', 'content-length'] as const;

/**
 * Keys redacted at every depth we cover (top level, `*.key`, `*.*.key`).
 * Exact names — pino's redaction (fast-redact) matches paths, not patterns.
 */
export const LOG_REDACT_KEYS = [
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'oldPassword',
  'temporaryPassword',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'idToken',
  'googleIdToken',
  'sessionToken',
  'resetCode',
  'otp',
  'otpCode',
  'verificationCode',
  'twoFactorCode',
  'secret',
  'clientSecret',
  'apiKey',
  'privateKey',
  'credentials',
  'authorization',
  'cookie',
] as const;

/**
 * Keys redacted only when nested. A bare top-level `code` in an app log line
 * is almost always an error code (`P2002`, `ECONNREFUSED`, a business
 * `CLAIM_NOT_VERIFIED`) and worth keeping; nested inside a payload / body it
 * is the 2FA or reset code.
 */
const LOG_REDACT_NESTED_ONLY_KEYS = ['code'] as const;

export const LOG_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.code',
  'req.body.sessionToken',
  ...LOG_REDACT_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
  ...LOG_REDACT_NESTED_ONLY_KEYS.flatMap((k) => [`*.${k}`, `*.*.${k}`]),
];

export const LOG_CENSOR = '***';

/** Health probes hit every few seconds; logging them is pure noise. */
const UNLOGGED_PATHS = new Set(['/health', '/ready']);

export function serializeRequest(req: WrappedRequest): Record<string, unknown> {
  const headers: Record<string, unknown> = {};
  for (const name of LOGGED_HEADERS) {
    const value = req.headers?.[name];
    if (value !== undefined) headers[name] = value;
  }
  return {
    id: req.id,
    method: req.method,
    url: sanitizePath(req.url ?? ''),
    ip: req.raw ? clientIp(req.raw) : undefined,
    headers,
  };
}

export function buildHttpLoggerOptions(
  env: NodeJS.ProcessEnv = process.env,
): PinoHttpOptions {
  return {
    level: env.LOG_LEVEL ?? 'info',
    transport:
      env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
    serializers: { req: serializeRequest },
    redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_CENSOR },
    customSuccessObject: (req, _res, val: Record<string, unknown>) => ({
      ...val,
      route: routeForLog(req),
    }),
    customErrorObject: (req, _res, _err, val: Record<string, unknown>) => ({
      ...val,
      route: routeForLog(req),
    }),
    autoLogging: {
      ignore: (req) => UNLOGGED_PATHS.has(stripQuery(req.url ?? '')),
    },
  };
}
