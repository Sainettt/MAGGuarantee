'use client';

// Phase 3 — new delegation form. Carrier picks vehicle (required) +
// optional driver / trailer / planned return / countries / comment.

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
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
  departureCountry: undefined,
  departurePostalCode: undefined,
  plannedReturnAt: undefined,
  returnCountry: undefined,
  returnPostalCode: undefined,
  comment: undefined,
};

export default function NewDelegationPage() {
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
      toast.success('Wyjazd zarejestrowany');
      router.push('/carrier/delegations');
    },
    onError: (err) => {
      const msg =
        err instanceof Error ? err.message : 'Nie udało się zapisać wyjazdu';
      toast.error(msg);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
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
  });

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
          Wróć do listy
        </Link>
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight text-text mb-6">
        Nowy wyjazd
      </h1>

      <form onSubmit={onSubmit}>
        <div className="bg-card rounded-lg border border-border p-5 space-y-6">
          <FormSection title="Pojazd i kierowca">
            <FormField
              label="Pojazd"
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
                label="Kierowca"
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
                label="Naczepa"
                error={errs.trailerId?.message}
                htmlFor="del-trailerId"
              >
                <Select id="del-trailerId" {...form.register('trailerId')}>
                  <option value="">—</option>
                  {trailers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.plateNumber}
                      {t.trailerTypeName ? ` (${t.trailerTypeName})` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Wyjazd">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label="Data i godzina wyjazdu"
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
                label="Kraj wyjazdu"
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
                label="Kod pocztowy wyjazdu"
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

          <FormSection title="Powrót">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label="Planowany powrót"
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
                label="Kraj powrotu"
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
                label="Kod pocztowy powrotu"
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
            label="Komentarz"
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
            Wyczyść
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Zapisywanie…' : 'Zarejestruj wyjazd'}
          </Button>
        </div>
      </form>
    </section>
  );
}
