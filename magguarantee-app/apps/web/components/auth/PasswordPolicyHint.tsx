'use client';

// Phase 9 §9.0 — live inline password-policy checklist.
//
// Renders below the new-password field. Three rules, each with a live
// pass/fail icon driven by the shared `PASSWORD_RULES` predicates (imported,
// never re-encoded — single source of truth in @magguarantee/shared via
// `lib/auth/password-policy`).
//
//   * Unmet rule  → hollow <Circle> + neutral `text-text-sub` (NOT red — red is
//     reserved for genuine post-submit validation errors; live-typing should
//     feel like progress, not scolding).
//   * Met rule    → <Check> + `text-success` (the only colour in the hint).
//   * No `aria-live` on the list (would spam SR on every keystroke). The
//     inline <FormMessage> announces the specific failure on a failed submit.

import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PASSWORD_RULES } from '@/lib/auth/password-policy';
import { cn } from '@/lib/utils';

interface PasswordPolicyHintProps {
  /** Current value of the new-password field. */
  value: string;
  className?: string;
}

export function PasswordPolicyHint({
  value,
  className,
}: PasswordPolicyHintProps) {
  const t = useTranslations('passwordPolicy');

  return (
    <ul
      role="list"
      aria-label={t('label')}
      className={cn('mt-2 space-y-1 text-xs text-text-sub', className)}
    >
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.key} className="flex items-center gap-1.5">
            {met ? (
              <Check size={14} className="text-success shrink-0" aria-hidden />
            ) : (
              <Circle size={14} className="shrink-0" aria-hidden />
            )}
            <span className={cn(met && 'text-success')}>{t(rule.key)}</span>
          </li>
        );
      })}
    </ul>
  );
}
