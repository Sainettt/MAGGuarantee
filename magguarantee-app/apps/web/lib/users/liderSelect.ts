// The «Przełożony (lider)» select of the admin UserSheet (docs/29 U9/U10,
// docs/14 §17.7) — pure rules, kept out of the component for tests.
//
//   * visible only when the EFFECTIVE role is `planista` — `roleOverride` wins
//     over `role` (a MAGSpace account's role may come from the override);
//   * options: active planista leaders (the `/lookups/planisci/liders` picker)
//     minus the edited user himself, by name;
//   * a STALE stored link (its target lost the flag or is inactive — U10: the
//     link is not cleared) stays an option, marked, so a native <select> does
//     not silently show «brak» and the next «Zapisz» does not erase the link;
//   * PATCH sends `liderId` only when it changed.

import type {
  LookupUserDto,
  Role,
  UserLiderMiniDto,
} from '@magguarantee/shared';

/** The role that decides whether the field exists: the override wins. */
export function effectiveRole(role: Role, roleOverride: Role | ''): Role {
  return roleOverride === '' ? role : roleOverride;
}

export function showsLiderField(role: Role, roleOverride: Role | ''): boolean {
  return effectiveRole(role, roleOverride) === 'planista';
}

export type LiderStaleness = 'inactive' | 'notLider' | null;

export interface LiderOption {
  id: string;
  /** `name ?? login` — the label before any stale suffix. */
  name: string;
  stale: LiderStaleness;
}

export interface LiderSelectModel {
  options: LiderOption[];
  /** At least one ACTIVE leader to choose from (else: `liderIdNoOptions`). */
  hasActiveLiders: boolean;
}

function displayName(u: { name: string | null; login: string }): string {
  const name = u.name?.trim();
  return name ? name : u.login;
}

export function liderStaleness(stored: UserLiderMiniDto | null): LiderStaleness {
  if (!stored) return null;
  if (!stored.active) return 'inactive';
  if (!stored.lider) return 'notLider';
  return null;
}

export function liderSelectModel({
  liders,
  selfId,
  stored,
}: {
  liders: readonly LookupUserDto[];
  /** The edited user (edit form) — a planista cannot be his own leader. */
  selfId?: string;
  /** `UserDto.liderUser` of the edited user — the saved link, maybe stale. */
  stored: UserLiderMiniDto | null;
}): LiderSelectModel {
  const active = liders
    .filter((l) => l.id !== selfId)
    .map<LiderOption>((l) => ({ id: l.id, name: displayName(l), stale: null }));
  const options = [...active];
  if (stored && stored.id !== selfId && !options.some((o) => o.id === stored.id)) {
    // The saved leader is missing from the active picker (stale — or simply
    // not loaded): keep it selectable so the form round-trips the value.
    options.push({
      id: stored.id,
      name: displayName(stored),
      stale: liderStaleness(stored),
    });
  }
  options.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return { options, hasActiveLiders: active.length > 0 };
}

/**
 * `liderId` for `PATCH /users/:id`: the value to send, or `undefined` to leave
 * it out. Only a change is sent, and never next to a non-planista effective
 * role (the api clears the link itself there, and an explicit one is a 422).
 */
export function liderIdPatchValue({
  formValue,
  storedValue,
  isPlanista,
}: {
  formValue: string;
  storedValue: string | null;
  isPlanista: boolean;
}): string | null | undefined {
  if (!isPlanista) return undefined;
  const next = formValue === '' ? null : formValue;
  return next === storedValue ? undefined : next;
}

/** `liderId` for `POST /users`: only a chosen leader on a planista. */
export function liderIdCreateValue({
  formValue,
  isPlanista,
}: {
  formValue: string;
  isPlanista: boolean;
}): string | undefined {
  return isPlanista && formValue !== '' ? formValue : undefined;
}
