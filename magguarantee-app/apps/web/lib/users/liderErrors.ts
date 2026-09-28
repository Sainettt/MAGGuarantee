// Which leader-specific refusal (docs/28) an api error is, by its RFC 7807
// `extensions.code` — the screens map the result onto their own i18n keys.

import {
  USER_LIDER_ID_INVALID,
  USER_LIDER_REQUIRES_LIDER_ROLE,
  USER_MANAGED_BY_MAGSPACE,
} from '@magguarantee/shared';

import { problemCode, problemFields } from '@/lib/api/problemCode';

export type LiderErrorKind =
  | 'requiresLiderRole'
  | 'managedByMagspace'
  | 'liderIdInvalid';

/**
 * - `requiresLiderRole` — 422 USER_LIDER_REQUIRES_LIDER_ROLE: the pair
 *   `(role | roleOverride, lider)` breaks `lider ⇒ role ∈ LIDER_ROLES`;
 * - `managedByMagspace` — 422 USER_MANAGED_BY_MAGSPACE whose `fields` name
 *   `lider`: the flag belongs to the stanowisko mapping on this account;
 * - `liderIdInvalid` — 422 USER_LIDER_ID_INVALID (docs/29 U9): the chosen
 *   «Przełożony (lider)» is not an active planista leader other than the user
 *   (every `extensions.reason` gets the same message, under the field).
 *
 * `undefined` for anything else (other codes keep their existing handling).
 */
export function liderErrorKind(err: unknown): LiderErrorKind | undefined {
  const code = problemCode(err);
  if (code === USER_LIDER_ID_INVALID) return 'liderIdInvalid';
  if (code === USER_LIDER_REQUIRES_LIDER_ROLE) return 'requiresLiderRole';
  if (code === USER_MANAGED_BY_MAGSPACE && problemFields(err).includes('lider')) {
    return 'managedByMagspace';
  }
  return undefined;
}
