'use client';

// Phase 8 (§8.5) — accessible cursor-pagination control.
//
// Replaces the three duplicated bare-arrow («←» / «→») pagination blocks in
// the claims / delegations / audit list views. The previous markup rendered a
// glyph as the only button content, so screen readers announced "← button"
// with no meaning. Here the visible icon is `aria-hidden` and the button
// carries a descriptive `aria-label` ("Poprzednia strona" / "Następna strona").
//
// Pure presentation: the parent still owns the cursor stack and the
// prev/next callbacks (no behavioural change vs. the inlined version).

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';

export interface CursorPagerProps {
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  className?: string;
}

export function CursorPager({
  onPrev,
  onNext,
  canPrev,
  canNext,
  className,
}: CursorPagerProps) {
  const t = useTranslations('common');
  return (
    <nav
      aria-label={t('pagination')}
      className={['flex items-center justify-end gap-2 mt-4', className]
        .filter(Boolean)
        .join(' ')}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={t('prevPage')}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!canNext}
        aria-label={t('nextPage')}
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  );
}
