'use client';

// Phase 4.5 — admin diagnostics view. Three tabs (Mails / Claims / DB)
// parity with the claim verification modal UX. Each tab is a thin client
// section that consumes its own TanStack hook.

import { useTranslations } from 'next-intl';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

import { ClaimsHealthSection } from './sections/ClaimsHealthSection';
import { DbHealthSection } from './sections/DbHealthSection';
import { MailsSection } from './sections/MailsSection';

export function DiagnosticsView() {
  const t = useTranslations('diagnostics');
  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>
      <Tabs defaultValue="mails">
        <TabsList className="mb-4">
          <TabsTrigger value="mails">{t('tabs.mails')}</TabsTrigger>
          <TabsTrigger value="claims">{t('tabs.claims')}</TabsTrigger>
          <TabsTrigger value="db">{t('tabs.db')}</TabsTrigger>
        </TabsList>
        <TabsContent value="mails">
          <MailsSection />
        </TabsContent>
        <TabsContent value="claims">
          <ClaimsHealthSection />
        </TabsContent>
        <TabsContent value="db">
          <DbHealthSection />
        </TabsContent>
      </Tabs>
    </section>
  );
}
