'use client';

// Client island of `/planista/przekazania` — see page.tsx.

import { useTranslations } from 'next-intl';

import { PlannerTransferList } from '@/components/transfers/PlannerTransferList';

export function PlanistaMyTransfersView() {
  const t = useTranslations();
  return (
    <PlannerTransferList
      mode="author"
      title={t('planista.nav.myTransfers')}
      subtitle={t('transfers.subtitle.author')}
      canRequest
      authorVariant="planista"
      className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-10 xl:px-12"
    />
  );
}

export default PlanistaMyTransfersView;
