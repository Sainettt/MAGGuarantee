// Typed API wrappers for /api/v1/sso/* — the Google-SSO admin surface
// (docs/24 §A2/§A5). Admin-only on the server; the route group guards the UI.

import type {
  AssignableRole,
  GrantSsoAccessDto,
  SsoAccessDenialListDto,
  SsoAccessGrantResultDto,
  StanowiskoRoleDto,
  StanowiskoRoleListDto,
} from '@magguarantee/shared';

import { apiJson } from './client';

/**
 * Every stanowisko MAGSpace publishes, merged with what we have mapped. The
 * envelope also carries `magspaceOk` and `lastReconcileAt`, so the screen can
 * say whether the list it is showing is complete.
 */
export function listStanowiskoRoles(): Promise<StanowiskoRoleListDto> {
  return apiJson<StanowiskoRoleListDto>('/sso/stanowisko-roles', {
    method: 'GET',
  });
}

/**
 * Idempotent: the stanowisko code is the identity, so re-pointing is the same call.
 *
 * `lider` (docs/28 §2) is sent only when given: omitted means "keep the stored
 * flag". Moving a leader row to another role must pass `lider: false`
 * explicitly, otherwise a role outside `LIDER_ROLES` is a 422
 * `USER_LIDER_REQUIRES_LIDER_ROLE`.
 */
export function setStanowiskoRole(
  code: string,
  role: AssignableRole,
  lider?: boolean,
): Promise<StanowiskoRoleDto> {
  return apiJson<StanowiskoRoleDto>(
    `/sso/stanowisko-roles/${encodeURIComponent(code)}`,
    {
      method: 'PUT',
      json: lider === undefined ? { role } : { role, lider },
    },
  );
}

/** Removes the mapping — holders lose access at their next sign-in / reconcile. */
export function deleteStanowiskoRole(code: string): Promise<void> {
  return apiJson<void>(`/sso/stanowisko-roles/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

/** Recent sign-ins refused for want of a role, read from the audit log. */
export function listSsoAccessDenials(): Promise<SsoAccessDenialListDto> {
  return apiJson<SsoAccessDenialListDto>('/sso/access-denials', {
    method: 'GET',
  });
}

/**
 * One-step «Nadaj dostęp» (docs/24 §10): creates, reactivates or updates a
 * MAGSpace-managed account whose hand-granted role is `role`. 409/422/503 carry
 * a Polish `detail` meant for the toast.
 */
export function grantSsoAccess(
  body: GrantSsoAccessDto,
): Promise<SsoAccessGrantResultDto> {
  return apiJson<SsoAccessGrantResultDto>('/sso/access-grants', {
    method: 'POST',
    json: body,
  });
}
