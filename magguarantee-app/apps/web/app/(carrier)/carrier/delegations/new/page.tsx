'use client';

// Phase 3 — new delegation form. Carrier picks vehicle (required) +
// optional driver / trailer / planned return / countries / comment.

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  SubmitDelegationSchema,
  type SubmitDelegationDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FormSection } from '@/components/forms/Form';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useSubmitDelegation } from '@/lib/hooks/useDelegations';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

const DRAFT_KEY = 'draft:carrier:newDelegation';

type FormValues = SubmitDelegationDto;

const EMPTY_DEFAULTS: FormValues = {
  vehicleId: '' as unknown as string,
  trailerId: undefined,
  driverId: undefined,
  departureAt: '',
  // Country / postal / plannedReturn are NOT NULL since phase3_blocks; empty
  // strings keep inputs controlled and Zod surfaces errors on submit.
  departureCountry: '',
  departurePostalCode: '',
  plannedReturnAt: '',
  returnCountry: '',
  returnPostalCode: '',
  comment: undefined,
};

export default function NewDelegationPage() {
  const t = useTranslations('carrier.delegations');
  const tForm = useTranslations('carrier.delegations.form');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const fleetQ = useMyFleet();

  const form = useForm<FormValues>({
    resolver: zodResolver(SubmitDelegationSchema),
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  const draft = useFormDraft(form, DRAFT_KEY, { enabled: true });

  useEffect(() => {
    form.reset({ ...EMPTY_DEFAULTS });
    draft.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitM = useSubmitDelegation({
    onSuccess: () => {
      draft.clear();
      toast.success(t('registeredToast'));
      router.push('/carrier/delegations');
    },
    onError: (err) => {
      const msg =
        err instanceof Error ? err.message : t('registerErrorToast');
      toast.error(msg);
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined;
      submitM.mutate({ body: cleaned as SubmitDelegationDto, idempotencyKey });
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = submitM.isPending;
  const errs = form.formState.errors;
  const vehicles = fleetQ.data?.vehicles ?? [];
  const drivers = fleetQ.data?.drivers ?? [];
  const trailers = fleetQ.data?.trailers ?? [];

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          href="/carrier/delegations"
          className="inline-flex items-center gap-1 text-sm text-text-sub hover:text-text"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight text-text mb-6">
        {t('newDelegation')}
      </h1>

      <form onSubmit={onSubmit}>
        <div className="bg-card rounded-lg border border-border p-5 space-y-6">
          <FormSection title={tForm('sectionVehicleAndDriver')}>
            <FormField
              label={tForm('vehicle')}
              required
              error={errs.vehicleId?.message}
              htmlFor="del-vehicleId"
            >
              <Select
                id="del-vehicleId"
                {...form.register('vehicleId')}
              >
                <option value="">—</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                    {v.brand || v.model
                      ? ` — ${[v.brand, v.model].filter(Boolean).join(' ')}`
                      : ''}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label={tForm('driver')}
                error={errs.driverId?.message}
                htmlFor="del-driverId"
              >
                <Select id="del-driverId" {...form.register('driverId')}>
                  <option value="">—</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label={tForm('trailer')}
                error={errs.trailerId?.message}
                htmlFor="del-trailerId"
              >
                <Select id="del-trailerId" {...form.register('trailerId')}>
                  <option value="">—</option>
                  {trailers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.plateNumber}
                      {tr.trailerTypeName ? ` (${tr.trailerTypeName})` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </FormSection>

          <FormSection title={tForm('sectionDeparture')}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label={tForm('departureAt')}
                required
                error={errs.departureAt?.message}
                htmlFor="del-departureAt"
                className="md:col-span-1"
              >
                <Input
                  id="del-departureAt"
                  type="datetime-local"
                  className="h-10"
                  {...form.register('departureAt', {
                    setValueAs: (v) => {
                      if (!v) return '';
                      // Browser <input type="datetime-local"> emits "YYYY-MM-DDThh:mm".
                      // The backend wants a full ISO datetime.
                      return new Date(v as string).toISOString();
                    },
                  })}
                />
              </FormField>
              <FormField
                label={tForm('departureCountry')}
                required
                error={errs.departureCountry?.message}
                htmlFor="del-departureCountry"
              >
                <Input
                  id="del-departureCountry"
                  className="h-10"
                  placeholder="PL"
                  {...form.register('departureCountry')}
                />
              </FormField>
              <FormField
                label={tForm('departurePostalCode')}
                required
                error={errs.departurePostalCode?.message}
                htmlFor="del-departurePostalCode"
              >
                <Input
                  id="del-departurePostalCode"
                  className="h-10"
                  {...form.register('departurePostalCode')}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title={tForm('sectionReturn')}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label={tForm('plannedReturnAt')}
                error={errs.plannedReturnAt?.message}
                htmlFor="del-plannedReturnAt"
              >
                <Input
                  id="del-plannedReturnAt"
                  type="datetime-local"
                  className="h-10"
                  {...form.register('plannedReturnAt', {
                    setValueAs: (v) => {
                      if (!v) return undefined;
                      return new Date(v as string).toISOString();
                    },
                  })}
                />
              </FormField>
              <FormField
                label={tForm('returnCountry')}
                error={errs.returnCountry?.message}
                htmlFor="del-returnCountry"
              >
                <Input
                  id="del-returnCountry"
                  className="h-10"
                  {...form.register('returnCountry')}
                />
              </FormField>
              <FormField
                label={tForm('returnPostalCode')}
                error={errs.returnPostalCode?.message}
                htmlFor="del-returnPostalCode"
              >
                <Input
                  id="del-returnPostalCode"
                  className="h-10"
                  {...form.register('returnPostalCode')}
                />
              </FormField>
            </div>
          </FormSection>

          <FormField
            label={tForm('comment')}
            error={errs.comment?.message}
            htmlFor="del-comment"
          >
            <Textarea
              id="del-comment"
              rows={3}
              {...form.register('comment')}
            />
          </FormField>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              draft.clear();
              form.reset({ ...EMPTY_DEFAULTS });
            }}
            disabled={submitting}
          >
            {tCommon('clear')}
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? t('saving') : t('registerSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
