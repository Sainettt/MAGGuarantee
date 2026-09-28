'use client';

// Client island of `/planista/zatwierdzenia` — see page.tsx. The lider check
// is the CURRENT `/auth/me` flag (U10: a leader who lost the flag no longer
// decides); the api re-checks it on every request anyway.

import { useTranslations } from 'next-intl';

import {
  NotLiderNotice,
  PlannerTransferList,
} from '@/components/transfers/PlannerTransferList';
import { useAuth } from '@/lib/hooks/useAuth';

const CONTAINER = 'mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-10 xl:px-12';

export function PlanistaApprovalsView() {
  const t = useTranslations();
  const { user } = useAuth();

  // <SessionGate> renders this only with a user; the guard is for types.
  if (!user || user.role !== 'planista' || !user.lider) {
    return <NotLiderNotice className={CONTAINER} />;
  }

  return (
    <PlannerTransferList
      mode="decider"
      title={t('planista.nav.approvals')}
      subtitle={t('transfers.subtitle.lider')}
      className={CONTAINER}
    />
  );
}

export default PlanistaApprovalsView;
