'use client';

// Header «Zgłoś problem» / «Zgłoś pomysł» — hands the signed-in user over to
// BugBot (MAGTRANS's bug & idea intake) through a one-time sign-in URL from
// `GET /integrations/bugbot/handoff`. «Zgłoś problem» is for every role,
// «Zgłoś pomysł» for admins only; nothing renders unless the build-time flag
// `NEXT_PUBLIC_BUGBOT_ENABLED=true` (see useBugbotHandoff, which <Header> owns
// and passes in — the <UserMenu> items share the same instance).
//
// Layout (docs/14 «Deviations — BugBot header actions»), measured against the
// real header:
//   * < lg — no pills. On phones the bar is already full (the logo starts to
//     shrink at 360px before anything is added); at md…lg a pill leaves only
//     ~35px for the user's name. The actions live in the <UserMenu> dropdown
//     instead (<BugbotMenuItems>).
//   * lg+ — pills styled like <LanguageToggle>/<ThemeToggle>. One button:
//     icon + text. Two buttons (admin): icon-only with aria-label + title,
//     icon + text from xl.
//
// The inline error is rendered here for BOTH triggers, absolutely positioned
// against the header's right-hand block (<Header> marks it
// `relative self-stretch`): it hangs just below the header bar, right-aligned
// with the content edge, and never changes the bar's height. Inline rather
// than a toast — product decision.

import {
  AlertCircle,
  Bug,
  Lightbulb,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BugbotHandoffKind } from '@magguarantee/shared';

import type { UseBugbotHandoffResult } from '@/lib/hooks/useBugbotHandoff';
import { cn } from '@/lib/utils';

/** Icon + label per form — shared with <BugbotMenuItems>. */
export const BUGBOT_KIND_UI: Record<
  BugbotHandoffKind,
  { icon: LucideIcon; labelKey: 'bugbot.report' | 'bugbot.idea' }
> = {
  bug: { icon: Bug, labelKey: 'bugbot.report' },
  idea: { icon: Lightbulb, labelKey: 'bugbot.idea' },
};

interface BugbotButtonsProps {
  handoff: UseBugbotHandoffResult;
}

export function BugbotButtons({ handoff }: BugbotButtonsProps) {
  const t = useTranslations();
  const { kinds, pendingKind, failed, open, dismissError } = handoff;

  if (kinds.length === 0) return null;

  const busy = pendingKind !== null;
  const single = kinds.length === 1;

  return (
    <>
      <div className="hidden lg:flex items-center gap-2">
        {kinds.map((kind) => {
          const { icon: Icon, labelKey } = BUGBOT_KIND_UI[kind];
          const label = t(labelKey);
          const isPending = pendingKind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => open(kind)}
              disabled={busy}
              aria-busy={isPending || undefined}
              aria-label={label}
              title={label}
              className={cn(
                'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card/80 backdrop-blur',
                'text-[13px] font-semibold text-text hover:bg-input transition-colors',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
                'disabled:opacity-60 disabled:cursor-wait',
                // Full literal class names — Tailwind only picks up whole strings.
                single ? 'px-3' : 'w-9 xl:w-auto xl:px-3',
              )}
            >
              {isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Icon size={16} aria-hidden />
              )}
              <span
                className={cn(
                  'whitespace-nowrap',
                  !single && 'hidden xl:inline',
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {failed && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 flex w-max items-start gap-2',
            'max-w-[calc(100vw-2rem)] sm:max-w-sm',
            'rounded-[10px] border border-danger/50 bg-card py-2 pl-3 pr-2 shadow-toast',
          )}
        >
          <AlertCircle
            size={16}
            className="mt-0.5 shrink-0 text-danger"
            aria-hidden
          />
          <p
            role="alert"
            className="min-w-0 text-[13px] font-semibold text-text"
          >
            {t('bugbot.error')}
          </p>
          <button
            type="button"
            onClick={dismissError}
            aria-label={t('common.close')}
            title={t('common.close')}
            className={cn(
              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
              'text-text-sub hover:bg-input hover:text-text transition-colors',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
            )}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
