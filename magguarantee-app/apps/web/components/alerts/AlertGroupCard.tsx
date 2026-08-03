'use client';

// One category zone («Przewoźnicy» / «Pojazdy» / «Kierowcy»): a card with a
// header (icon + title + count) over a list of alert rows, already sorted
// most-urgent-first by the API.

import { Building2, Truck, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AlertGroup } from '@magguarantee/shared';

import { AlertRow } from './AlertRow';

const CATEGORY_ICON: Record<AlertGroup['category'], LucideIcon> = {
  carrier: Building2,
  vehicle: Truck,
  driver: Users,
};

export function AlertGroupCard({ group }: { group: AlertGroup }) {
  const t = useTranslations('alerts');
  const Icon = CATEGORY_ICON[group.category];

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={18} aria-hidden className="text-text-sub" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-text">
          {t(`category.${group.category}`)}
        </h2>
        <span className="ml-auto inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-input px-2 py-0.5 text-xs font-bold tabular-nums text-text-sub">
          {group.total}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-3">
        {group.items.map((item) => (
          <AlertRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
