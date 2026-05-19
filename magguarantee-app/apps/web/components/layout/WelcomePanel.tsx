'use client';

// Phase 1 placeholder content rendered inside every role landing page. Real
// per-role panels arrive in Phases 4–8.

import { useTranslations } from 'next-intl';
import type { Role } from '@magguarantee/shared';

import { useAuth } from '@/lib/hooks/useAuth';

export function WelcomePanel() {
  const t = useTranslations();
  const { user } = useAuth();
  if (!user) return null;
  const role = user.role as Role;
  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-12">
      <div className="rounded-xl bg-card border border-border shadow-card p-8">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text">
          {t('landing.welcome', { name: user.name })}
        </h1>
        <p className="mt-1 text-[14px] text-text-sub">
          {t('landing.yourRole', { role: t(`roles.${role}`) })}
        </p>
        <p className="mt-6 text-[13px] text-text-sub">
          {t('landing.phasePlaceholder')}
        </p>
      </div>
    </section>
  );
}
