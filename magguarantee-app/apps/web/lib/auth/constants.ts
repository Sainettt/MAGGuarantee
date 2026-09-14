// Auth constants shared by the edge middleware and the Node-side server
// helpers. Kept in a dependency-free module: `middleware.ts` must not import
// `lib/auth/server.ts` (it pulls `next/headers` / `next/navigation`).

export const ACCESS_COOKIE = 'mt_access';
export const REFRESH_COOKIE = 'mt_refresh';

/**
 * Request header the middleware sets when its silent `/auth/refresh` call
 * could not REACH the API (network failure — not a rejected refresh). Lets
 * `getServerUser()` tell "no access cookie because the refresh couldn't run"
 * apart from "no session", and render "service unavailable" instead of
 * redirecting to /login. The middleware strips any client-supplied copy.
 */
export const AUTH_UNAVAILABLE_HEADER = 'x-mt-auth-unavailable';
