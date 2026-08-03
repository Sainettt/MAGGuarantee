'use client';

// One expiring/expired document, rendered as a link to the owning entity's
// list page so the user can jump straight to fixing it. Shows the severity
// countdown chip, the document type, the entity it belongs to, the owning
// carrier (when it adds context), and the expiry date.

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { AlertItem } from '@magguarantee/shared';

import { formatDateShort } from '@/lib/format/numbers';
import { cn } from '@/lib/utils';
import { AlertCountdownBadge } from './AlertCountdownBadge';

/** Entity kind → the list page where the user can open + edit it. */
const ENTITY_HREF: Record<AlertItem['entityKind'], string> = {
  carrier: '/employee/carriers',
  vehicle: '/employee/vehicles',
  driver: '/employee/drivers',
};

export function AlertRow({ item }: { item: AlertItem }) {
  const t = useTranslations('alerts');

  // For carrier documents `entityLabel` IS the firm, so the carrier line would
  // be a duplicate — only show it when it adds information (vehicle / driver).
  const showCarrier =
    item.entityKind !== 'carrier' &&
    item.carrierName != null &&
    item.carrierName !== item.entityLabel;

  return (
    <Link
      href={ENTITY_HREF[item.entityKind]}
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5',
        'bg-card transition-colors hover:bg-input',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
      )}
    >
      <AlertCountdownBadge
        severity={item.severity}
        daysToExpiry={item.daysToExpiry}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text">
          {t(`docType.${item.docType}`)}
          <span className="text-text-sub"> · {item.entityLabel}</span>
        </div>
        <div className="truncate text-xs text-text-sub">
          {showCarrier && <span>{item.carrierName} · </span>}
          {t('expiresOn', { date: formatDateShort(item.expiryDate) })}
        </div>
      </div>
      <ChevronRight
        size={16}
        aria-hidden
        className="shrink-0 text-text-sub transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
