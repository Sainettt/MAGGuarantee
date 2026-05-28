// Browser-side API client. Wraps `fetch` with:
//   * `credentials: 'include'` so HttpOnly cookies (`mt_access`, `mt_refresh`)
//     ride along on every call.
//   * Auto-refresh on 401: try `POST /api/v1/auth/refresh` once, retry the
//     original request if the refresh succeeded; otherwise bubble the 401.
//
// Server-side calls (Server Components, Route Handlers) should use
// `serverApiUrl()` and pass cookies explicitly — that flow is rare in Phase 1
// and not implemented here.

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const API_PREFIX = '/api/v1';
const AUTH_REFRESH_PATH = `${API_PREFIX}/auth/refresh`;

export type ApiError = {
  status: number;
  /** Backend's logging-only message; do not show to users. */
  message?: string;
  /** Extra error fields (`attemptsLeft`, `lockedForSec`, `cooldownSec`). */
  data?: Record<string, unknown>;
};

export class ApiResponseError extends Error implements ApiError {
  readonly status: number;
  readonly data: Record<string, unknown> | undefined;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const apiPath = path.startsWith('/api/') ? path : `${API_PREFIX}${path}`;
  return `${PUBLIC_API_URL}${apiPath}`;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(buildUrl(path), { ...init, credentials: 'include' });
}

// Single-flight для /auth/refresh. Если несколько запросов одновременно
// получили 401, они должны разделить ОДИН вызов /auth/refresh — иначе
// первый ротирует refresh-токен, а второй приходит с уже-revoked токеном,
// сервер считает это reuse-attack и ревокает все сессии юзера.
//
// Храним true/false, а не Response: ответ /auth/refresh нельзя честно
// "размножить" между несколькими await'ами (body — single-use stream), да
// и нам нужно от него только «получилось / нет».
let inflightRefresh: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = rawFetch(AUTH_REFRESH_PATH, { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

/**
 * Issue an authenticated request. On a 401 from a non-refresh endpoint, try
 * one refresh call and replay the original request. If that refresh also
 * returns 401, throw — callers (e.g. `useAuth`) treat that as anonymous.
 *
 * Параллельные 401-ответы делят ОДИН вызов `/auth/refresh` через
 * `refreshOnce()` — см. комментарий у `inflightRefresh` выше.
 */
export async function fetchWithRefresh(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let res = await rawFetch(path, init);
  if (res.status !== 401 || path.includes('/auth/refresh') || path.includes('/auth/login') || path.includes('/auth/verify-code')) {
    return res;
  }
  const refreshed = await refreshOnce();
  if (!refreshed) return res;
  res = await rawFetch(path, init);
  return res;
}

/** Decodes a response body, throwing `ApiResponseError` on non-2xx. */
async function decodeResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!res.ok) {
    const data = (body ?? {}) as Record<string, unknown>;
    // Backend wraps every error in an RFC 7807 envelope (ProblemDetailsFilter),
    // so the human-readable text lives in `detail`. We keep `message` as a
    // fallback for the rare path where Nest skips the filter (Phase 1 didn't
    // have it everywhere) and end with the generic `HTTP <status>` last resort.
    const detail = typeof data.detail === 'string' ? data.detail : undefined;
    const message =
      typeof data.message === 'string' ? data.message : undefined;
    const errorMessage = detail ?? message ?? `HTTP ${res.status}`;
    throw new ApiResponseError(res.status, errorMessage, data);
  }
  return body as T;
}

/**
 * JSON wrapper around `fetchWithRefresh`. Decodes the response, throws an
 * `ApiResponseError` with status + body data on non-2xx so callers can
 * branch on `err.status` (401 / 423 / 429 etc.) without re-parsing.
 */
export async function apiJson<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const finalInit: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  };
  const res = await fetchWithRefresh(path, finalInit);
  return decodeResponse<T>(res);
}

/**
 * `multipart/form-data` wrapper around `fetchWithRefresh`. Used by endpoints
 * that mix scalar fields with file uploads (e.g. vehicle create/edit).
 *
 * IMPORTANT: we deliberately do NOT set `Content-Type` — the browser must
 * generate it itself so the multipart boundary is included. Setting it
 * manually breaks the request. Only `Accept` is set.
 */
export async function apiForm<T>(
  path: string,
  body: FormData,
  init: Omit<RequestInit, 'body'> = {},
): Promise<T> {
  const { headers, ...rest } = init;
  const finalInit: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    body,
  };
  const res = await fetchWithRefresh(path, finalInit);
  return decodeResponse<T>(res);
}

/**
 * Fetches an authenticated binary resource (e.g. an attachment download) and
 * returns it as a `Blob`. The download endpoint is NOT a public URL — it sits
 * behind the same auth/refresh flow as every other API call, so we route it
 * through `fetchWithRefresh` rather than dropping the path into an `<a href>`.
 */
export async function apiBlob(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  const res = await fetchWithRefresh(path, init);
  if (!res.ok) {
    await decodeResponse<unknown>(res);
  }
  return res.blob();
}
