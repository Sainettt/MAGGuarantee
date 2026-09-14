'use client';

// Phase 3 — carrier `/claims` list. Server scopes results to the
// authenticated carrier; the UI only adds in-list filters (status,
// vehicle, search by nrZgl).

import { FileText, Plus, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  ClaimStatusSchema,
  type ClaimStatus,
} from '@magguarantee/shared';

import { ClaimCard } from '@/components/carrier/ClaimCard';
import { GuaranteeReminderBanner } from '@/components/carrier/GuaranteeReminderBanner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useClaims } from '@/lib/hooks/useClaims';
import { useMyFleet } from '@/lib/hooks/useMyFleet';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

export default function CarrierClaimsListPage() {
  const t = useTranslations('carrier.claims');
  const tStatus = useTranslations('carrier.claims.status');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [vehicleId, setVehicleId] = useState<string>('');

  const claimsQ = useClaims({
    q: search.length >= 2 ? search : undefined,
    status: status || undefined,
    vehicleId: vehicleId || undefined,
    limit: 50,
  });
  const { data, isLoading } = claimsQ;
  // Load failure is its own state — never the "no claims yet" empty.
  const showError = !isLoading && claimsQ.isError && !data;

  // Include deactivated vehicles in the filter dropdown — old claims may
  // still reference a vehicle that was sold / deactivated afterwards.
  const fleetQ = useMyFleet({ includeInactive: true });

  const items = data?.items ?? [];
  const hasActiveFilters = Boolean(
    search.length >= 2 || status || vehicleId,
  );
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setVehicleId('');
  };

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Phase 12 — guarantee-watchdog reminder banner (§12.2). Renders only
          when a guaranteed vehicle is owed a zgłoszenie-wyjazdu; silent
          otherwise. Mounts above the title as the carrier's first read. */}
      <GuaranteeReminderBanner />

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
              {!v.active ? ` ${tCommon('inactiveSuffix')}` : ''}
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

      {showError && (
        <div className="bg-card rounded-lg border border-border">
          <ErrorState {...queryErrorProps(claimsQ)} />
        </div>
      )}

      {!isLoading && !showError && items.length === 0 && hasActiveFilters && (
        <div className="bg-card rounded-lg border border-border">
          <EmptyState
            icon={SearchX}
            title={t('emptyFiltered.title')}
            message={t('emptyFiltered.message')}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                {tCommon('clearFilters')}
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && !showError && items.length === 0 && !hasActiveFilters && (
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
          {claimsQ.isError && (
            <ErrorState
              variant="banner"
              className="mb-3"
              {...queryErrorProps(claimsQ)}
            />
          )}
          {items.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </section>
  );
}
