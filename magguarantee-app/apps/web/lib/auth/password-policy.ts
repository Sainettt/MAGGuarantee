// Phase 9 — client-side password-policy predicates.
//
// The policy itself is owned by `PasswordSchema` in @magguarantee/shared
// (≥10 chars · ≥1 letter · ≥1 digit). We do NOT re-encode the rules here; the
// `passwordSatisfiesPolicy` predicate parses against the shared schema so the
// "submit-gate" matches the backend exactly.
//
// `PASSWORD_RULES` only exists to drive the live <PasswordPolicyHint> checklist
// — three independent per-rule checks so each row can flip its icon as the user
// types. These must stay in lockstep with the shared schema's three rules; if
// the schema gains a fourth rule, add it here (and to the i18n hint copy).

import { PasswordSchema } from '@magguarantee/shared';

export type PasswordRuleKey = 'minLen' | 'letter' | 'digit';

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Per-rule predicates for the live checklist. Each mirrors one clause of the
 * shared `PasswordSchema` (kept in sync deliberately — see file header).
 */
export const PASSWORD_RULES: ReadonlyArray<{
  key: PasswordRuleKey;
  test: (value: string) => boolean;
}> = [
  { key: 'minLen', test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { key: 'letter', test: (v) => /[A-Za-z]/.test(v) },
  { key: 'digit', test: (v) => /[0-9]/.test(v) },
];

/**
 * True when `value` passes the full shared policy. Used to gate submit buttons.
 * Delegates to the shared Zod schema so there is a single source of truth.
 */
export function passwordSatisfiesPolicy(value: string): boolean {
  return PasswordSchema.safeParse(value).success;
}
