'use client';

// BugBot actions as <UserMenu> items — the below-`lg` trigger. Below `lg` the
// header bar has no reliable room for even icon-only pills (see
// <BugbotButtons>), so «Zgłoś problem» / «Zgłoś pomysł» move into the user
// dropdown, with text.
// Same handoff instance as the header pills (owned by <Header>): the menu
// closes on click and a failure shows in the shared inline error under the
// header bar.

import { useTranslations } from 'next-intl';

import type { UseBugbotHandoffResult } from '@/lib/hooks/useBugbotHandoff';
import { cn } from '@/lib/utils';

import { BUGBOT_KIND_UI } from './BugbotButtons';

interface BugbotMenuItemsProps {
  handoff: UseBugbotHandoffResult;
  /** Closes the surrounding menu. */
  onSelect: () => void;
}

export function BugbotMenuItems({ handoff, onSelect }: BugbotMenuItemsProps) {
  const t = useTranslations();
  const { kinds, pendingKind, open } = handoff;

  if (kinds.length === 0) return null;

  return (
    <div className="lg:hidden">
      {kinds.map((kind) => {
        const { icon: Icon, labelKey } = BUGBOT_KIND_UI[kind];
        return (
          <button
            key={kind}
            type="button"
            role="menuitem"
            disabled={pendingKind !== null}
            onClick={() => {
              // `open` first: it calls `window.open` synchronously, inside the
              // click gesture.
              open(kind);
              onSelect();
            }}
            className={cn(
              'w-full text-left rounded-[8px] px-3 py-2 flex items-center gap-2',
              'hover:bg-input transition-colors font-semibold',
              'disabled:opacity-60 disabled:cursor-wait',
            )}
          >
            <Icon size={14} aria-hidden />
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
