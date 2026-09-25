// Reading the RFC 7807 `extensions` bag off an api error.
//
// The api answers business-rule refusals with a stable machine code in
// `extensions.code` (and sometimes extra fields next to it, e.g. `fields` on
// USER_MANAGED_BY_MAGSPACE). The web localises by that code — never by the
// human `detail`, which is a Polish fallback for logs, not a contract.
//
// Older screens carry their own inline copy of this lookup
// (WeryfikatorDelegationsView, GoogleSignInButton, carrier/delegations/new);
// new code should use these helpers instead.

import { ApiResponseError } from './client';

/** The `extensions` object of an api error, or `undefined` for anything else. */
export function problemExtensions(
  err: unknown,
): Record<string, unknown> | undefined {
  if (!(err instanceof ApiResponseError)) return undefined;
  const extensions = err.data?.extensions;
  if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
    return undefined;
  }
  return extensions as Record<string, unknown>;
}

/** `extensions.code` of an api error, if it is a string. */
export function problemCode(err: unknown): string | undefined {
  const code = problemExtensions(err)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** `extensions.fields` of an api error — the string entries only; `[]` if absent. */
export function problemFields(err: unknown): readonly string[] {
  const fields = problemExtensions(err)?.fields;
  return Array.isArray(fields)
    ? fields.filter((f): f is string => typeof f === 'string')
    : [];
}
