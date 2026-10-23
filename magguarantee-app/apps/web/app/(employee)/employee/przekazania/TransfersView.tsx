'use client';

// Client island of `/employee/przekazania` — see page.tsx. The mode comes from
// the server-resolved role (admin → decider + his own requests on the third
// tab «Moje wnioski», opiekun → author).

import { useTranslations } from 'next-intl';

import { PlannerTransferList } from '@/components/transfers/PlannerTransferList';

export function TransfersView({ mode }: { mode: 'decider' | 'author' }) {
  const t = useTranslations('transfers');
  return (
    <PlannerTransferList
      mode={mode}
      title={t('title')}
      subtitle={mode === 'decider' ? t('subtitle.admin') : t('subtitle.author')}
      authorVariant="opiekun"
      showLeader={mode === 'decider'}
      withMineTab={mode === 'decider'}
      className="px-4 py-8 sm:px-6 lg:px-10 xl:px-12"
    />
  );
}

export default TransfersView;
