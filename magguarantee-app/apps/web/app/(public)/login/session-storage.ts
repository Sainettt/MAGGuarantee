// Tiny helper that the login wizard uses to stash its `sessionToken` +
// `maskedEmail` between step 1 (`/login`) and step 2 (`/login/verify`).
//
// Both values are *public* tokens (they don't grant access on their own —
// the verify step still needs the email-delivered code), so sessionStorage
// is appropriate. We never put them in cookies (would clutter every API
// request) and we don't put them in the URL (so refreshing /login/verify
// keeps the user in flow without exposing the token via Referer headers).

export const LOGIN_SESSION_KEY = 'mt_login_session';

export interface LoginSessionState {
  sessionToken: string;
  maskedEmail: string;
  /** ms epoch — used to expire the wizard if the user idles past 10 min. */
  createdAt: number;
}

const TEN_MIN_MS = 10 * 60 * 1000;

export function readLoginSession(): LoginSessionState | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(LOGIN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LoginSessionState;
    if (
      typeof parsed?.sessionToken === 'string' &&
      typeof parsed?.maskedEmail === 'string' &&
      typeof parsed?.createdAt === 'number'
    ) {
      if (Date.now() - parsed.createdAt > TEN_MIN_MS) {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
        return null;
      }
      return parsed;
    }
  } catch {
    // fall through
  }
  sessionStorage.removeItem(LOGIN_SESSION_KEY);
  return null;
}

export function clearLoginSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(LOGIN_SESSION_KEY);
}
