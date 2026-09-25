// The «Lider» checkbox in the admin UserSheet (docs/28 §2, §3.4) — pure rules,
// kept out of the component so they can be tested without rendering.
//
// Ownership mirrors `role`:
//   - create / `local` account → the admin owns the flag;
//   - `magspace` account without a hand-granted role → the stanowisko mapping
//     owns it (read-only here, like `role`);
//   - `magspace` account with `roleOverride` → the admin owns it, but the api
//     judges the pair against the CURRENT `role` too (variant A): an override
//     only lands in `role` at the next sign-in / reconcile, so until then a
//     leader flag next to a non-leader `role` is a 422.

import { isLiderRole, type Role } from '@magguarantee/shared';

export type LiderCheckboxState =
  | { mode: 'hidden' }
  | { mode: 'enabled' }
  | {
      mode: 'disabled';
      /**
       * `managed` — the stanowisko mapping owns the flag (same hint as `role`);
       * `pendingSync` — the chosen override may carry it, the current role
       * may not; available after the next sign-in / sync.
       */
      reason: 'managed' | 'pendingSync';
    };

export interface LiderCheckboxInput {
  /** `false` = create form. */
  isEdit: boolean;
  /** The `managedBy` select as it stands in the form (create is always `local`). */
  managedBy: 'local' | 'magspace';
  /**
   * The role select. On a `magspace` account the select is locked, so this is
   * the account's current role — the one the api checks the pair against.
   */
  role: Role;
  /** The hand-granted role select; `''` = none (the mapping decides). */
  roleOverride: Role | '';
}

const HIDDEN: LiderCheckboxState = { mode: 'hidden' };
const ENABLED: LiderCheckboxState = { mode: 'enabled' };

export function liderCheckboxState({
  isEdit,
  managedBy,
  role,
  roleOverride,
}: LiderCheckboxInput): LiderCheckboxState {
  if (!isEdit || managedBy === 'local') {
    return isLiderRole(role) ? ENABLED : HIDDEN;
  }
  if (roleOverride === '') {
    // Mapping-owned: show what the mapping gave, read-only.
    return isLiderRole(role) ? { mode: 'disabled', reason: 'managed' } : HIDDEN;
  }
  if (!isLiderRole(roleOverride)) return HIDDEN;
  return isLiderRole(role)
    ? ENABLED
    : { mode: 'disabled', reason: 'pendingSync' };
}

/**
 * The form value after the `roleOverride` select changes. Any role change
 * clears the flag — except clearing the override, which hands the flag back to
 * the mapping: the checkbox goes read-only again and shows the stored value
 * (writing `false` there would be refused as a change to a mapping-owned
 * field). A change of the `role` select always resets to `false`.
 */
export function liderAfterRoleOverrideChange(
  nextOverride: string,
  storedLider: boolean,
): boolean {
  return nextOverride === '' ? storedLider : false;
}

/**
 * `lider` for `PATCH /users/:id`: the value to send, or `undefined` to leave
 * it out. Only a CHANGE is sent — an unchanged flag on a mapping-owned account
 * would otherwise risk a 422 on an unrelated edit (e.g. the name).
 *
 *  - `enabled` → whatever the admin ticked;
 *  - `hidden`  → `false`: the chosen role / override cannot carry the flag, so
 *    a stored `true` must be cleared in the same request or the api refuses
 *    the pair;
 *  - `disabled: managed` → never sent (read-only, mapping-owned);
 *  - `disabled: pendingSync` → `false` (the current role cannot carry it).
 */
export function liderPatchValue(
  state: LiderCheckboxState,
  formLider: boolean,
  storedLider: boolean,
): boolean | undefined {
  let effective: boolean;
  switch (state.mode) {
    case 'enabled':
      effective = formLider;
      break;
    case 'hidden':
      effective = false;
      break;
    case 'disabled':
      effective = state.reason === 'managed' ? storedLider : false;
      break;
  }
  return effective === storedLider ? undefined : effective;
}

/** `lider` for `POST /users`: the ticked value when the checkbox is usable, else `false`. */
export function liderCreateValue(
  state: LiderCheckboxState,
  formLider: boolean,
): boolean {
  return state.mode === 'enabled' ? formLider : false;
}
