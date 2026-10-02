// Typed wrapper for `GET /api/v1/integrations/bugbot/handoff` — the one-time
// sign-in URL for the BugBot «Zgłoś problem» / «Zgłoś pomysł» forms. Contract:
// `@magguarantee/shared` → `schemas/integrations/bugbot.ts`.
//
// Why a fetch and not a plain `<a href>` to the API: the access token lives 15
// minutes and is refreshed only by `apiJson` (or the middleware on navigation),
// so a bare link opened after a long idle would land on a 401 page.
//
// The returned URL carries a token (60 s, single use). It must never be logged,
// cached (`cache: 'no-store'` keeps it out of the HTTP cache; callers keep it
// out of TanStack Query and React state) or persisted — fetch it, navigate.

import type {
  BugbotHandoffKind,
  BugbotHandoffLocale,
  BugbotHandoffResponse,
} from '@magguarantee/shared';

import { apiJson } from './client';

/**
 * Asks the API to sign a BugBot handoff for the current user. Errors are the
 * usual `ApiResponseError`: 404 integration not configured, 403 `idea` for a
 * non-admin, 400 bad params, 429 rate limit (10/min).
 */
export async function getBugbotHandoffUrl(
  kind: BugbotHandoffKind,
  locale: BugbotHandoffLocale,
): Promise<string> {
  const query = new URLSearchParams({ kind, locale });
  const body = await apiJson<BugbotHandoffResponse>(
    `/integrations/bugbot/handoff?${query.toString()}`,
    { method: 'GET', cache: 'no-store' },
  );
  return body.url;
}
