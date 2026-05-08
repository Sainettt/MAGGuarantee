'use client';

// Phase 3 — new-claim form. Two-column layout per docs/14: RHF form on the
// left, <LivePreviewPanel> on the right. The preview is debounced 400ms
// after any field change and fired against POST /claims/preview. Submit
// button is disabled while the preview is loading or returned an error.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  SubmitClaimSchema,
  type PreviewClaimDto,
  type SubmitClaimDto,
} from '@magguarantee/shared';

import { LivePreviewPanel } from '@/components/carrier/LivePreviewPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FormSection } from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useClaimPreview, useSubmitClaim } from '@/lib/hooks/useClaims';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

const DRAFT_KEY = 'draft:carrier:newClaim';

type FormValues = SubmitClaimDto;

function getDefaults(): FormValues {
  return {
    vehicleId: '' as unknown as string,
    trailerId: undefined,
    driverId: undefined,
    dateStart: '',
    dateEnd: '',
    // timeFrom / timeTo are NOT NULL since phase3_blocks. Empty string keeps
    // the <input type="time"> controlled; HhMmSchema rejects "" on submit.
    timeFrom: '',
    timeTo: '',
    mileage: 0,
    amountRequested: 0,
    hoursAdjusted: 0,
    comment: undefined,
    // orderNumber / orderDate are intentionally NOT in the carrier submit
    // DTO (phase3_blocks): they're MAGTRANS-internal and assigned by the
    // verifier when transitioning to ZAAKCEPTOWANO.
    attachmentIds: undefined,
  };
}

export default function NewClaimPage() {
  const t = useTranslations('carrier.claims');
  const tForm = useTranslations('carrier.claims.form');
  const tCommon = useTranslations('common');
  const router = useRouter();
  // Include deactivated vehicles in the dropdown — a wniosek can legitimately
  // reference a vehicle that worked the period and was deactivated afterwards.
  // Inactive rows are tagged "(nieaktywny)" in the option label below.
  const fleetQ = useMyFleet({ includeInactive: true });

  const form = useForm<FormValues>({
    resolver: zodResolver(SubmitClaimSchema),
    defaultValues: getDefaults(),
  });

  const draft = useFormDraft(form, DRAFT_KEY, { enabled: true });

  useEffect(() => {
    draft.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watched = form.watch();

  // Build a preview body when the form has the bare minimum filled. Server
  // is the source of truth — we don't compute anything locally.
  const previewBody: PreviewClaimDto | null = useMemo(() => {
    if (
      !watched.vehicleId ||
      !watched.dateStart ||
      !watched.dateEnd ||
      typeof watched.mileage !== 'number' ||
      Number.isNaN(watched.mileage) ||
      watched.dateStart > watched.dateEnd
    ) {
      return null;
    }
    return {
      vehicleId: watched.vehicleId,
      dateStart: watched.dateStart,
      dateEnd: watched.dateEnd,
      timeFrom: watched.timeFrom || undefined,
      timeTo: watched.timeTo || undefined,
      mileage: watched.mileage,
      hoursAdjusted: watched.hoursAdjusted ?? 0,
    };
  }, [
    watched.vehicleId,
    watched.dateStart,
    watched.dateEnd,
    watched.mileage,
    watched.timeFrom,
    watched.timeTo,
    watched.hoursAdjusted,
  ]);

  // Debounce 400ms before firing the preview request.
  const debouncedPreviewBody = useDebouncedValue(previewBody, 400);
  const previewQ = useClaimPreview(debouncedPreviewBody, {
    enabled: !!debouncedPreviewBody,
  });

  // Server-side business-rule violations from the 422 envelope (rendered as
  // a sticky banner above the form). Cleared on every fresh submit attempt
  // so the user only sees current issues.
  const [violations, setViolations] = useState<string[]>([]);
  const violationsRef = useRef<HTMLDivElement | null>(null);

  const submitM = useSubmitClaim({
    onSuccess: (claim) => {
      setViolations([]);
      draft.clear();
      toast.success(t('submittedToast', { nrZgl: claim.nrZgl }));
      router.push(`/carrier/claims/${encodeURIComponent(claim.nrZgl)}`);
    },
    onError: (err) => {
      const list = extractViolations(err);
      if (list.length > 0) {
        setViolations(list);
        // Scroll to banner so the user sees it even with a long form.
        requestAnimationFrame(() =>
          violationsRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          }),
        );
        toast.error(t('violationsToast'));
        return;
      }
      const msg = err instanceof Error ? err.message : t('submitErrorToast');
      toast.error(msg);
    },
  });

  const submitting = submitM.isPending;
  const previewBlocked =
    previewQ.isLoading || (previewQ.isError && !previewQ.data);

  const onSubmit = form.handleSubmit(
    (values) => {
      setViolations([]); // hide stale banner before the new round trip
      // Strip empty strings so optional fields go through Zod cleanly.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
      // Use a fresh idempotency key so refresh + resubmit doesn't double-insert.
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined;
      submitM.mutate({ body: cleaned as SubmitClaimDto, idempotencyKey });
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const errs = form.formState.errors;
  const vehicles = fleetQ.data?.vehicles ?? [];
  const drivers = fleetQ.data?.drivers ?? [];
  const trailers = fleetQ.data?.trailers ?? [];

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-text mb-6">
        {t('newClaim')}
      </h1>

      {violations.length > 0 && (
        <div
          ref={violationsRef}
          role="alert"
          className="mb-6 rounded-lg border border-danger/40 bg-danger-bg dark:bg-danger/10 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              className="mt-0.5 flex-none text-danger"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-danger-dark dark:text-danger">
                {violations.length === 1
                  ? t('violationsHeadingOne')
                  : t('violationsHeadingMany', { count: violations.length })}
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm text-text">
                {violations.map((v, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-danger">•</span>
                    <span className="flex-1">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setViolations([])}
              aria-label={tCommon('clear')}
              className="flex-none rounded-md p-1 text-text-sub hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-danger/40"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
          {/* Left — RHF form */}
          <div className="space-y-6">
            <div className="bg-card rounded-lg border border-border p-5 space-y-6">
              <FormSection title={tForm('sectionVehicleAndDriver')}>
                <FormField
                  label={tForm('vehicle')}
                  required
                  error={errs.vehicleId?.message}
                  htmlFor="claim-vehicleId"
                >
                  <Select
                    id="claim-vehicleId"
                    {...form.register('vehicleId')}
                  >
                    <option value="">—</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber}
                        {v.brand || v.model
                          ? ` — ${[v.brand, v.model].filter(Boolean).join(' ')}`
                          : ''}
                        {!v.active ? ` ${tCommon('inactiveSuffix')}` : ''}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={tForm('driver')}
                    error={errs.driverId?.message}
                    htmlFor="claim-driverId"
                  >
                    <Select
                      id="claim-driverId"
                      {...form.register('driverId')}
                    >
                      <option value="">—</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}
                          {!d.active ? ` ${tCommon('inactiveSuffix')}` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField
                    label={tForm('trailer')}
                    error={errs.trailerId?.message}
                    htmlFor="claim-trailerId"
                  >
                    <Select
                      id="claim-trailerId"
                      {...form.register('trailerId')}
                    >
                      <option value="">—</option>
                      {trailers.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.plateNumber}
                          {tr.trailerTypeName ? ` (${tr.trailerTypeName})` : ''}
                          {!tr.active ? ` ${tCommon('inactiveSuffix')}` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={tForm('sectionPeriod')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={tForm('dateStart')}
                    required
                    error={errs.dateStart?.message}
                    htmlFor="claim-dateStart"
                  >
                    <Input
                      id="claim-dateStart"
                      type="date"
                      className="h-10"
                      {...form.register('dateStart')}
                    />
                  </FormField>
                  <FormField
                    label={tForm('dateEnd')}
                    required
                    error={errs.dateEnd?.message}
                    htmlFor="claim-dateEnd"
                  >
                    <Input
                      id="claim-dateEnd"
                      type="date"
                      className="h-10"
                      {...form.register('dateEnd')}
                    />
                  </FormField>
                  <FormField
                    label={tForm('timeFrom')}
                    required
                    error={errs.timeFrom?.message}
                    htmlFor="claim-timeFrom"
                  >
                    <Input
                      id="claim-timeFrom"
                      type="time"
                      className="h-10"
                      {...form.register('timeFrom')}
                    />
                  </FormField>
                  <FormField
                    label={tForm('timeTo')}
                    required
                    error={errs.timeTo?.message}
                    htmlFor="claim-timeTo"
                  >
                    <Input
                      id="claim-timeTo"
                      type="time"
                      className="h-10"
                      {...form.register('timeTo')}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={tForm('sectionValues')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={tForm('mileage')}
                    required
                    error={errs.mileage?.message}
                    htmlFor="claim-mileage"
                  >
                    <Input
                      id="claim-mileage"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('mileage', {
                        setValueAs: (v) =>
                          v === '' || v === null ? 0 : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={tForm('amountRequested')}
                    required
                    error={errs.amountRequested?.message}
                    htmlFor="claim-amount"
                  >
                    <Input
                      id="claim-amount"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('amountRequested', {
                        setValueAs: (v) =>
                          v === '' || v === null ? 0 : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={tForm('hoursAdjusted')}
                    error={errs.hoursAdjusted?.message}
                    htmlFor="claim-hours"
                    description={tForm('hoursAdjustedHint')}
                  >
                    <Input
                      id="claim-hours"
                      type="number"
                      step="0.5"
                      min={0}
                      className="h-10"
                      {...form.register('hoursAdjusted', {
                        setValueAs: (v) =>
                          v === '' || v === null ? 0 : Number(v),
                      })}
                    />
                  </FormField>
                </div>
              </FormSection>

              {/*
                orderNumber / orderDate were removed from the carrier submit
                DTO in phase3_blocks — they are MAGTRANS-internal and filled
                in by the verifier on PATCH /claims/:nrZgl when transitioning
                to ZAAKCEPTOWANO. The carrier-side form keeps just the
                comment field.
              */}
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-text-sub hover:text-text">
                  {tForm('addComment')}
                </summary>
                <div className="mt-4 space-y-4">
                  <FormField
                    label={tForm('comment')}
                    error={errs.comment?.message}
                    htmlFor="claim-comment"
                  >
                    <Textarea
                      id="claim-comment"
                      rows={3}
                      {...form.register('comment')}
                    />
                  </FormField>
                </div>
              </details>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  draft.clear();
                  form.reset(getDefaults());
                }}
                disabled={submitting}
              >
                {tCommon('clear')}
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={submitting || previewBlocked}
              >
                {submitting ? t('submitting') : t('submit')}
              </Button>
            </div>
          </div>

          {/* Right — Live preview */}
          <div>
            <LivePreviewPanel
              data={previewQ.data}
              isLoading={previewQ.isFetching}
              isError={previewQ.isError}
              isEmpty={!previewBody}
            />
          </div>
        </div>
      </form>
    </section>
  );
}

/**
 * Parse the `violations: string[]` array out of a 422 envelope. Falls back
 * to an empty list if the error doesn't carry the multi-violation shape
 * (e.g. plain 500 / 401 / network error).
 */
function extractViolations(err: unknown): string[] {
  if (!(err instanceof ApiResponseError)) return [];
  if (err.status !== 422) return [];
  const v = err.data?.violations;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
