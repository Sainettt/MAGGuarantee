'use client';

// Phase 3 — carrier `/claims` list. Server scopes results to the
// authenticated carrier; the UI only adds in-list filters (status,
// vehicle, search by nrZgl).

import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  ClaimStatusSchema,
  type ClaimStatus,
} from '@magguarantee/shared';

import { ClaimCard } from '@/components/carrier/ClaimCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useClaims } from '@/lib/hooks/useClaims';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

export default function CarrierClaimsListPage() {
  const t = useTranslations('carrier.claims');
  const tStatus = useTranslations('carrier.claims.status');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [vehicleId, setVehicleId] = useState<string>('');

  const { data, isLoading } = useClaims({
    q: search.length >= 2 ? search : undefined,
    status: status || undefined,
    vehicleId: vehicleId || undefined,
    limit: 50,
  });

  const fleetQ = useMyFleet();

  const items = data?.items ?? [];

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Link href="/carrier/claims/new">
          <Button size="sm">
            <Plus size={14} />
            {t('newClaim')}
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="h-10 sm:max-w-xs"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="sm:max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value as ClaimStatus | '')}
          aria-label={t('filterByStatus')}
        >
          <option value="">{t('allStatuses')}</option>
          {ClaimStatusSchema.options.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
        <Select
          className="sm:max-w-xs"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          aria-label={t('filterByVehicle')}
        >
          <option value="">{t('allVehicles')}</option>
          {(fleetQ.data?.vehicles ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.plateNumber}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="bg-card rounded-lg border border-border">
          <EmptyState
            icon={FileText}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Link href="/carrier/claims/new">
                <Button size="sm">
                  <Plus size={14} />
                  {t('submit')}
                </Button>
              </Link>
            }
          />
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div>
          {items.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </section>
  );
}
