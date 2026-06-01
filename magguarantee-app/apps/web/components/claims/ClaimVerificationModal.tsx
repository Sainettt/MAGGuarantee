'use client';

// Phase 4 — verification modal for admin / pracownik.
// `<Sheet side="right" size="xl">` (720px) with 3 tabs:
//   - Edit         : main RHF form, decision picker + conditional fields,
//                    live recalc badge (debounced `/preview`).
//   - Historia     : read-only diff of `origData` vs current (only when
//                    the claim has been through reklamacja).
//   - Autoryzacja  : "Wymaga autoryzacji" flow OR Maksim amount entry,
//                    NO screenshot upload (explicitly removed in 4.x).
//
// The form is driven by `UpdateClaimSchema` (discriminated union by
// `targetStatus`); the schema only validates the fields relevant to the
// chosen transition. The shape of the form's actual `useForm<…>()`
// generic is a union of all variants so RHF lets us swap which fields
// are registered based on the picker without re-mounting the form.

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import {
  Controller,
  useForm,
  type FieldErrors,
  type Resolver,
  type SubmitHandler,
} from 'react-hook-form';
import { toast } from 'sonner';
import {
  RequestAuthorizationSchema,
  UpdateClaimSchema,
  type ClaimDto,
  type PreviewClaimDto,
  type RequestAuthorizationDto,
  type UpdateClaimDto,
} from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { HoursReadout } from '@/components/claims/HoursReadout';
import { RecalcBadge } from '@/components/claims/RecalcBadge';
import {
  decisionTargetsFor,
  type ClaimDecisionTarget,
} from '@/components/claims/claim-transitions';
import { FormDescription, FormField, FormGrid } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { ApiResponseError } from '@/lib/api/client';
import { formatDateFull, formatEur } from '@/lib/format/numbers';
import {
  useClaim,
  useClaimPreviewExisting,
  useRequestAuthorization,
  useUpdateClaim,
} from '@/lib/hooks/useClaims';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

// ────────────────────────────────────────────────────────────────────
// Form values shape — superset of every variant in `UpdateClaimSchema`.
// RHF expects a single registered-field set; we register everything and
// let the zodResolver discriminate on `targetStatus`. Strings for date /
// number fields keep them controllable in plain inputs; `setValueAs`
// coerces back when needed.
// ────────────────────────────────────────────────────────────────────
interface FormValues {
  targetStatus: ClaimDecisionTarget | '';
  // Corrections (optional on every variant)
  dateStart: string;
  dateEnd: string;
  timeFrom: string;
  timeTo: string;
  mileage: number | undefined;
  hoursAdjusted: number | undefined;
  // ZAAKCEPTOWANO
  orderNumber: string;
  orderDate: string;
  amountApproved: number | undefined;
  amountMaximum: number | undefined;
  // ZAAKCEPTOWANO / REKLAMACJA_ZAAKCEPTOWANO / OCZEKUJE_NA_AUTORYZACJE / ODRZUCONO
  comment: string;
  // OCZEKUJE_NA_AUTORYZACJE
  margin: number | undefined;
  authorizationDescription: string;
  // REKLAMACJA_ZAAKCEPTOWANO
  reklamacjaAmount: number | undefined;
}

interface ClaimVerificationModalProps {
  open: boolean;
  nrZgl: string | null;
  onClose: () => void;
}

function buildPreviewBody(
  claim: ClaimDto,
  v: Partial<FormValues>,
): PreviewClaimDto | null {
  if (!claim.vehicleId) return null;
  const dateStart = v.dateStart || claim.dateStart.slice(0, 10);
  const dateEnd = v.dateEnd || claim.dateEnd.slice(0, 10);
  const mileage =
    v.mileage !== undefined && Number.isFinite(v.mileage)
      ? Number(v.mileage)
      : claim.mileage;
  const hoursAdjusted =
    v.hoursAdjusted !== undefined && Number.isFinite(v.hoursAdjusted)
      ? Number(v.hoursAdjusted)
      : 0;
  return {
    vehicleId: claim.vehicleId,
    dateStart,
    dateEnd,
    timeFrom: v.timeFrom || claim.timeFrom,
    timeTo: v.timeTo || claim.timeTo,
    mileage,
    hoursAdjusted,
  };
}

// Custom RHF resolver. The wire schema (`UpdateClaimSchema`) is a strict
// discriminated union, but our form registers the *superset* of all variants
// so the user can switch `targetStatus` without re-mounting fields. Passing
// the raw form values straight to Zod fails because the strict variants reject
// keys from sibling variants (e.g. `authorizationDescription` is not allowed
// on the ZAAKCEPTOWANO variant). We strip the irrelevant keys via
// `cleanUpdatePayload` first, then validate the cleaned payload.
const updateClaimResolver: Resolver<FormValues> = async (values) => {
  if (!values.targetStatus) {
    return {
      values: {},
      errors: {
        targetStatus: {
          type: 'required',
          message: 'required',
        },
      } as FieldErrors<FormValues>,
    };
  }
  const cleaned = cleanUpdatePayload(values);
  const result = UpdateClaimSchema.safeParse(cleaned);
  if (result.success) {
    return { values, errors: {} };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || 'targetStatus';
    if (!errors[path]) {
      errors[path] = { type: issue.code, message: issue.message };
    }
  }
  return {
    values: {},
    errors: errors as FieldErrors<FormValues>,
  };
};

/** Drop empty / undefined values so Zod's `.strict()` doesn't choke. */
function cleanUpdatePayload(values: FormValues): UpdateClaimDto {
  const out: Record<string, unknown> = { targetStatus: values.targetStatus };
  const include = (k: string, v: unknown) => {
    if (v === '' || v === undefined || v === null) return;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    out[k] = v;
  };
  // Corrections — accepted on every variant except ODRZUCONO / REKLAMACJA_ODRZUCONO
  if (
    values.targetStatus !== 'ODRZUCONO' &&
    values.targetStatus !== 'REKLAMACJA_ODRZUCONO'
  ) {
    include('dateStart', values.dateStart);
    include('dateEnd', values.dateEnd);
    include('timeFrom', values.timeFrom);
    include('timeTo', values.timeTo);
    include('mileage', values.mileage);
    include('hoursAdjusted', values.hoursAdjusted);
  }
  // Per-variant required / optional fields
  switch (values.targetStatus) {
    case 'ZAAKCEPTOWANO':
      include('orderNumber', values.orderNumber);
      include('orderDate', values.orderDate);
      include('amountApproved', values.amountApproved);
      include('amountMaximum', values.amountMaximum);
      include('comment', values.comment);
      break;
    case 'ODRZUCONO':
      include('comment', values.comment);
      break;
    case 'OCZEKUJE_NA_AUTORYZACJE':
      include('margin', values.margin);
      include('authorizationDescription', values.authorizationDescription);
      break;
    case 'REKLAMACJA_ZAAKCEPTOWANO':
      include('comment', values.comment);
      include('reklamacjaAmount', values.reklamacjaAmount);
      break;
    case 'REKLAMACJA_ODRZUCONO':
      include('comment', values.comment);
      break;
  }
  return out as UpdateClaimDto;
}

export function ClaimVerificationModal({
  open,
  nrZgl,
  onClose,
}: ClaimVerificationModalProps) {
  const t = useTranslations('employee.claims.modal');
  const tStatus = useTranslations('employee.claims.modal.targetStatus');

  const claimQ = useClaim(open ? nrZgl : null);
  const claim = claimQ.data ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {claim ? t('title', { nrZgl: claim.nrZgl }) : nrZgl ?? ''}
          </SheetTitle>
          <SheetDescription>
            {claim ? (
              <span className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-text-sub">
                  {t('carrierAndPlate', {
                    carrier:
                      claim.carrier?.name ??
                      claim.carrier?.login ??
                      claim.carrierId,
                    plate: claim.vehiclePlateSnapshot,
                  })}
                </span>
                <StatusBadge status={claim.status} />
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {claimQ.isLoading || !claim ? (
          <SheetBody>
            <div className="space-y-3">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </SheetBody>
        ) : (
          <ModalBody claim={claim} onClose={onClose} t={t} tStatus={tStatus} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// Internal body — splits from the parent so the form / hooks only mount
// after the claim is loaded.
interface ModalBodyProps {
  claim: ClaimDto;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'employee.claims.modal'>>;
  tStatus: ReturnType<typeof useTranslations<'employee.claims.modal.targetStatus'>>;
}

function ModalBody({ claim, onClose, t, tStatus }: ModalBodyProps) {
  const tCommon = useTranslations('common');
  const tEdit = useTranslations('employee.claims.modal.edit');

  const targets = useMemo(() => decisionTargetsFor(claim.status), [claim.status]);

  const form = useForm<FormValues>({
    // Custom resolver strips sibling-variant fields before validating against
    // the strict discriminated union — see `updateClaimResolver` above.
    resolver: updateClaimResolver,
    defaultValues: getDefaults(claim, targets[0] ?? ''),
  });

  // Re-seed when a new claim opens (the parent keeps the modal mounted across
  // selections).
  useEffect(() => {
    form.reset(getDefaults(claim, targets[0] ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim.id]);

  const targetStatus = form.watch('targetStatus');

  // ── Live preview (debounced 300ms) ────────────────────────────────
  const watchedPreviewInputs = form.watch([
    'dateStart',
    'dateEnd',
    'timeFrom',
    'timeTo',
    'mileage',
    'hoursAdjusted',
  ]);
  // Pull each watched value out into its own const so the useMemo dep
  // list below is a plain array of primitives (eslint-plugin-react-hooks
  // can statically verify each).
  const wDateStart = watchedPreviewInputs[0];
  const wDateEnd = watchedPreviewInputs[1];
  const wTimeFrom = watchedPreviewInputs[2];
  const wTimeTo = watchedPreviewInputs[3];
  const wMileage = watchedPreviewInputs[4];
  const wHoursAdjusted = watchedPreviewInputs[5];
  const previewBodyImmediate = useMemo<PreviewClaimDto | null>(() => {
    // Only worth previewing when the verifier is touching values that
    // affect the calc (mileage / corrections) — skip for ODRZUCONO.
    if (targetStatus === 'ODRZUCONO' || targetStatus === 'REKLAMACJA_ODRZUCONO') {
      return null;
    }
    return buildPreviewBody(claim, {
      dateStart: wDateStart,
      dateEnd: wDateEnd,
      timeFrom: wTimeFrom,
      timeTo: wTimeTo,
      mileage: wMileage,
      hoursAdjusted: wHoursAdjusted,
    });
  }, [
    claim,
    targetStatus,
    wDateStart,
    wDateEnd,
    wTimeFrom,
    wTimeTo,
    wMileage,
    wHoursAdjusted,
  ]);

  const debouncedPreviewBody = useDebouncedValue(previewBodyImmediate, 300);

  const previewQ = useClaimPreviewExisting(claim.nrZgl, debouncedPreviewBody, {
    enabled: debouncedPreviewBody !== null,
  });
  // Treat the debounce-window (raw differs from debounced) as still "loading"
  // so the badge stays in the pulsing state while the user keeps typing.
  const inDebounce =
    previewBodyImmediate !== debouncedPreviewBody &&
    previewBodyImmediate !== null;
  const recalcState: 'idle' | 'loading' | 'success' | 'error' =
    previewBodyImmediate === null
      ? 'idle'
      : inDebounce || previewQ.isFetching
        ? 'loading'
        : previewQ.isError
          ? 'error'
          : 'success';

  // Auto-populate `amountApproved` to the previewed doplata when the
  // verifier picks ZAAKCEPTOWANO and hasn't manually entered one yet.
  // We mirror the recommendation: server-calculated value wins by default,
  // verifier can override.
  useEffect(() => {
    if (targetStatus !== 'ZAAKCEPTOWANO') return;
    if (form.formState.dirtyFields.amountApproved) return;
    const previewed = previewQ.data?.paymentEur;
    const current = previewed ?? claim.paymentEur;
    if (typeof current === 'number') {
      form.setValue('amountApproved', current, { shouldDirty: false });
    }
  }, [targetStatus, previewQ.data?.paymentEur, claim.paymentEur, form]);

  const updateM = useUpdateClaim({
    onSuccess: () => {
      toast.success(tEdit('savedToast'));
      onClose();
    },
    onError: (err) => {
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tEdit('errorToast');
      toast.error(msg);
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    if (!values.targetStatus) return;
    const payload = cleanUpdatePayload(values);
    updateM.mutate({ nrZgl: claim.nrZgl, body: payload });
  };

  const submitDisabled =
    !targetStatus ||
    targets.length === 0 ||
    updateM.isPending ||
    recalcState === 'loading';

  // Best-effort error message — RHF resolves the union per-variant so the
  // top-level path can be either `targetStatus` (when union mismatch) or
  // a per-field path; we expose them via plain string read below.
  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  const hasHistory =
    claim.origDateStart !== null ||
    claim.origDateEnd !== null ||
    claim.origMileage !== null ||
    // `origHoursAdjusted` is set on every new submit, so by itself it isn't a
    // signal of "history". Treat it as relevant only when the verifier has
    // actually overridden it (i.e. it diverges from the currently applied
    // value) — otherwise non-reklamacja claims would always render the tab.
    (claim.origHoursAdjusted !== null &&
      claim.origHoursAdjusted !== claim.hoursAdjustedValue) ||
    claim.decidedById !== null;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <SheetBody>
        <Tabs defaultValue="edit" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="edit">{t('tabs.edit')}</TabsTrigger>
            <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
            <TabsTrigger value="authorization">
              {t('tabs.authorization')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-text-sub">
                {t('submittedAt', { date: formatDateFull(claim.createdAt) })}
              </p>
              <RecalcBadge
                state={recalcState}
                baseAmount={claim.paymentEur}
                previewAmount={previewQ.data?.paymentEur}
              />
            </div>

            {/* Decision picker */}
            {targets.length > 0 ? (
              <FormField
                label={tEdit('targetStatus')}
                required
                error={errMsg('targetStatus')}
                htmlFor="claim-targetStatus"
              >
                <Controller
                  control={form.control}
                  name="targetStatus"
                  render={({ field }) => (
                    <Select
                      id="claim-targetStatus"
                      value={field.value}
                      onChange={(e) =>
                        field.onChange(e.target.value as ClaimDecisionTarget)
                      }
                    >
                      <option value="">
                        {tEdit('targetStatusPlaceholder')}
                      </option>
                      {targets.map((target) => (
                        <option key={target} value={target}>
                          {tStatus(target)}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </FormField>
            ) : (
              <p className="rounded-md border border-border bg-input p-3 text-sm text-text-sub">
                {/* Terminal state — nothing to change. */}
                {claim.status}
              </p>
            )}

            {/* Read-only context block — 2×2 grid optimised for scan-parity
                between the 4 baseline numbers the verifier reads while
                filling the form (docs/14 §3.1B "should the modal use the
                header layout? No — keep them visually distinct"). The
                HoursReadout sits below the grid as its own full-width row
                because it carries two values (raw + counted). */}
            <div className="rounded-md border border-border bg-input p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label={tEdit('kmGuaranteed')}
                  value={`${Math.round(claim.kmGuaranteed).toLocaleString('pl-PL')} km`}
                />
                <Stat
                  label={tEdit('doplata')}
                  value={formatEur(claim.paymentEur)}
                />
                <Stat
                  label={tEdit('mileage')}
                  value={`${Math.round(claim.mileage).toLocaleString('pl-PL')} km`}
                />
              </div>
              <HoursReadout
                rawTotalDays={claim.breakdown?.rawTotalDays ?? null}
                totalDays={claim.breakdown?.totalDays ?? null}
              />
            </div>

            {/* Corrections — hidden for pure-rejection variants. */}
            {targetStatus &&
              targetStatus !== 'ODRZUCONO' &&
              targetStatus !== 'REKLAMACJA_ODRZUCONO' && (
                <FormGrid cols={2}>
                  <FormField
                    label={tEdit('mileage')}
                    error={errMsg('mileage')}
                    htmlFor="claim-mileage"
                  >
                    <Input
                      id="claim-mileage"
                      type="number"
                      step="1"
                      min={0}
                      {...form.register('mileage', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={tEdit('hoursAdjusted')}
                    error={errMsg('hoursAdjusted')}
                    htmlFor="claim-hoursAdjusted"
                  >
                    <Input
                      id="claim-hoursAdjusted"
                      type="number"
                      step="0.5"
                      min={0}
                      {...form.register('hoursAdjusted', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                    {/* Live HoursReadout — recomputes `totalDays` locally
                        from the watched `hoursAdjusted` input (pure
                        arithmetic, no /preview roundtrip per docs/14
                        §3.1A "Live-update behaviour"). The engine works in
                        days, the form input is in HOURS — divide by 24
                        with the same `round2` semantics the engine uses
                        (see km-calc.ts `applyHoursAdjustment`). The
                        previous `text-warning` origHoursAdjusted hint is
                        absorbed into HoursReadout.hint.override per the
                        design system §A placement 3. */}
                    <div className="mt-1.5">
                      <HoursReadout
                        live
                        rawTotalDays={claim.breakdown?.rawTotalDays ?? null}
                        totalDays={computeLiveTotalDays(
                          claim.breakdown?.rawTotalDays ?? null,
                          wHoursAdjusted,
                        )}
                      />
                    </div>
                  </FormField>
                  <FormField
                    label={tEdit('dateStart')}
                    error={errMsg('dateStart')}
                    htmlFor="claim-dateStart"
                  >
                    <Input
                      id="claim-dateStart"
                      type="date"
                      {...form.register('dateStart')}
                    />
                  </FormField>
                  <FormField
                    label={tEdit('dateEnd')}
                    error={errMsg('dateEnd')}
                    htmlFor="claim-dateEnd"
                  >
                    <Input
                      id="claim-dateEnd"
                      type="date"
                      {...form.register('dateEnd')}
                    />
                  </FormField>
                </FormGrid>
              )}

            {/* Variant-specific fields */}
            {targetStatus === 'ZAAKCEPTOWANO' && (
              <FormGrid cols={2}>
                <FormField
                  label={tEdit('orderNumber')}
                  required
                  error={errMsg('orderNumber')}
                  htmlFor="claim-orderNumber"
                >
                  <Input
                    id="claim-orderNumber"
                    {...form.register('orderNumber')}
                  />
                </FormField>
                <FormField
                  label={tEdit('orderDate')}
                  required
                  error={errMsg('orderDate')}
                  htmlFor="claim-orderDate"
                >
                  <Input
                    id="claim-orderDate"
                    type="date"
                    {...form.register('orderDate')}
                  />
                </FormField>
                <FormField
                  label={tEdit('amountApproved')}
                  required
                  error={errMsg('amountApproved')}
                  htmlFor="claim-amountApproved"
                  className="col-span-2"
                >
                  {/* Computed-but-required field — driven by the live /preview
                      doplata (see the amountApproved useEffect above). The
                      verifier must NOT type into it; `readOnly` (not
                      `disabled`) keeps it visible, copyable, RHF-registered and
                      submitted while signalling "system-owned".

                      Presentation = the canonical LOCKED / COMPUTED FIELD
                      pattern: muted surface (`bg-input/40`), muted text
                      (`text-text-sub`), no focus ring, `cursor-not-allowed`, a
                      right-aligned muted <Lock /> affordance, and a native
                      `title` hover hint. See docs/14 § "Locked / computed field
                      pattern". */}
                  <div className="relative">
                    <Input
                      id="claim-amountApproved"
                      type="number"
                      step="0.01"
                      min={0}
                      readOnly
                      tabIndex={-1}
                      aria-readonly="true"
                      title={tEdit('amountApprovedLocked')}
                      className="bg-input/40 pr-9 font-semibold tabular-nums text-text-sub cursor-not-allowed focus:border-border focus:ring-0"
                      {...form.register('amountApproved', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-text-sub/70"
                    />
                  </div>
                  <FormDescription className="flex items-center gap-1">
                    <Lock aria-hidden className="size-3 shrink-0" />
                    {tEdit('amountApprovedAuto')}
                  </FormDescription>
                </FormField>
                <FormField
                  label={tEdit('comment')}
                  error={errMsg('comment')}
                  htmlFor="claim-comment-accept"
                  className="col-span-2"
                >
                  <Textarea
                    id="claim-comment-accept"
                    rows={3}
                    {...form.register('comment')}
                  />
                </FormField>
              </FormGrid>
            )}

            {targetStatus === 'ODRZUCONO' && (
              <FormField
                label={tEdit('commentRejected')}
                required
                error={errMsg('comment')}
                htmlFor="claim-comment-reject"
              >
                <Textarea
                  id="claim-comment-reject"
                  rows={5}
                  {...form.register('comment')}
                />
              </FormField>
            )}

            {targetStatus === 'OCZEKUJE_NA_AUTORYZACJE' && (
              <div className="space-y-3">
                <FormField
                  label={tEdit('margin')}
                  required
                  error={errMsg('margin')}
                  htmlFor="claim-margin"
                >
                  <Input
                    id="claim-margin"
                    type="number"
                    step="0.01"
                    {...form.register('margin', {
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                  />
                </FormField>
                <FormField
                  label={tEdit('authorizationDescription')}
                  required
                  error={errMsg('authorizationDescription')}
                  htmlFor="claim-authDesc"
                >
                  <Textarea
                    id="claim-authDesc"
                    rows={5}
                    {...form.register('authorizationDescription')}
                  />
                </FormField>
              </div>
            )}

            {targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO' && (
              <div className="space-y-3">
                <FormField
                  label={tEdit('reklamacjaAmount')}
                  required
                  error={errMsg('reklamacjaAmount')}
                  htmlFor="claim-reklamacjaAmount"
                >
                  <Input
                    id="claim-reklamacjaAmount"
                    type="number"
                    step="0.01"
                    min={0}
                    {...form.register('reklamacjaAmount', {
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                  />
                </FormField>
                <FormField
                  label={tEdit('commentReklamacja')}
                  required
                  error={errMsg('comment')}
                  htmlFor="claim-comment-rek-accept"
                >
                  <Textarea
                    id="claim-comment-rek-accept"
                    rows={4}
                    {...form.register('comment')}
                  />
                </FormField>
              </div>
            )}

            {targetStatus === 'REKLAMACJA_ODRZUCONO' && (
              <FormField
                label={tEdit('commentReklamacja')}
                required
                error={errMsg('comment')}
                htmlFor="claim-comment-rek-reject"
              >
                <Textarea
                  id="claim-comment-rek-reject"
                  rows={5}
                  {...form.register('comment')}
                />
              </FormField>
            )}
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab claim={claim} hasHistory={hasHistory} />
          </TabsContent>

          <TabsContent value="authorization">
            <AuthorizationTab claim={claim} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </SheetBody>

      <SheetFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={updateM.isPending}
        >
          {tCommon('cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={submitDisabled}>
          {updateM.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {tEdit('submitting')}
            </>
          ) : (
            tEdit('submit')
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

// ── History tab ─────────────────────────────────────────────────────

function HistoryTab({
  claim,
  hasHistory,
}: {
  claim: ClaimDto;
  hasHistory: boolean;
}) {
  const t = useTranslations('employee.claims.modal.history');

  if (!hasHistory) {
    return (
      <p className="rounded-md border border-border bg-input p-4 text-sm text-text-sub text-center">
        {t('empty')}
      </p>
    );
  }

  const hasOrig =
    claim.origDateStart !== null ||
    claim.origDateEnd !== null ||
    claim.origMileage !== null ||
    // Only count the hours-adjustment snapshot as "orig data" when it actually
    // diverges from the value currently driving the calc; otherwise rendering
    // a 0 → 0 (or 5.5 → 5.5) diff row would be visual noise.
    (claim.origHoursAdjusted !== null &&
      claim.origHoursAdjusted !== claim.hoursAdjustedValue);

  return (
    <div className="space-y-4">
      {claim.decidedBy && (
        <div className="rounded-md border border-border bg-input p-3 space-y-1 text-sm">
          <p>
            {t('decidedBy', {
              actor:
                claim.decidedBy.name ??
                claim.decidedBy.login ??
                claim.decidedById ??
                '—',
            })}
          </p>
          {claim.statusChangedAt && (
            <p className="text-text-sub text-xs">
              {t('decidedAt', { date: formatDateFull(claim.statusChangedAt) })}
            </p>
          )}
        </div>
      )}

      {hasOrig && (
        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('origData')}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <DiffRow
              label={t('origDateStart')}
              orig={formatDateFull(claim.origDateStart)}
              current={formatDateFull(claim.dateStart)}
            />
            <DiffRow
              label={t('origDateEnd')}
              orig={formatDateFull(claim.origDateEnd)}
              current={formatDateFull(claim.dateEnd)}
            />
            <DiffRow
              label={t('origMileage')}
              orig={
                claim.origMileage != null
                  ? `${Math.round(claim.origMileage).toLocaleString('pl-PL')} km`
                  : '—'
              }
              current={`${Math.round(claim.mileage).toLocaleString('pl-PL')} km`}
            />
            {/* Render the hours-adjustment diff only when the verifier has
                actually overridden the carrier's submission. `origHoursAdjusted`
                is a snapshot taken at submit time; `hoursAdjustedValue` is the
                value currently driving the km-calc — divergence means an
                override happened (see audit log for who/when). */}
            {claim.origHoursAdjusted !== null &&
              claim.origHoursAdjusted !== claim.hoursAdjustedValue && (
                <DiffRow
                  label={t('origHoursAdjusted')}
                  orig={`${claim.origHoursAdjusted} h`}
                  current={`${claim.hoursAdjustedValue ?? 0} h`}
                />
              )}
          </div>
        </section>
      )}

      {claim.reklamacjaText && (
        <section className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('reklamacjaText')}
          </h4>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-input p-3 text-sm">
            {claim.reklamacjaText}
          </p>
        </section>
      )}

      {claim.reklamacjaResponse && (
        <section className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('reklamacjaResponse')}
          </h4>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-input p-3 text-sm">
            {claim.reklamacjaResponse}
          </p>
        </section>
      )}
    </div>
  );
}

function DiffRow({
  label,
  orig,
  current,
}: {
  label: string;
  orig: string;
  current: string;
}) {
  const changed = orig !== current;
  return (
    <div className="text-sm space-y-0.5">
      <p className="text-xs font-medium text-text-sub">{label}</p>
      <p
        className={changed ? 'text-text-sub line-through' : 'text-text-sub'}
      >
        {orig}
      </p>
      <p
        className={
          changed
            ? 'rounded-sm bg-warning/10 px-1.5 py-0.5 inline-block text-text font-semibold'
            : 'text-text'
        }
      >
        {current}
      </p>
    </div>
  );
}

// ── Authorization tab ──────────────────────────────────────────────
//
// Phase 4.2 rewrite — wires the new `POST /claims/:nrZgl/request-authorization`
// endpoint. Replaces the Phase 4.1 PATCH-based stub.
//
// Behaviour by current `claim.status`:
//   - `NA_WERYFIKACJI`           — pre-decision form: kwotaMaksima (required)
//     + comment (optional) → "Wymaga autoryzacji" button calls the new
//     POST. Success closes the modal and fires the "Email wysłany" toast.
//   - `OCZEKUJE_NA_AUTORYZACJE`  — read-only summary (description + persisted
//     amountMaximum). The Save-kwoty-as-standalone-override path is not
//     supported by the current UpdateClaimSchema (see report Deviations).
//   - `ZAAKCEPTOWANO` / `ODRZUCONO` — terminal: "notRequired" message.
//   - other (e.g. REKLAMACJA / AUTORYZACJA_KWOTA_MAKSIMA) — terminal too.

/** RHF form values for the pre-decision "Wymaga autoryzacji" form. */
interface AuthFormValues {
  kwotaMaksima: number | undefined;
  comment: string;
}

const AUTH_COMMENT_MAX = 2_000;

function AuthorizationTab({
  claim,
  onClose,
}: {
  claim: ClaimDto;
  onClose: () => void;
}) {
  const t = useTranslations('employee.claims.modal.auth');
  const tCommon = useTranslations('common');

  // Case 1 — already pending authorization. Show description + the
  // amountMaximum that the original `request-authorization` call already
  // persisted (read-only).
  if (claim.status === 'OCZEKUJE_NA_AUTORYZACJE') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-input p-3 space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('pendingTitle')}
          </h4>
          <p className="text-xs text-text-sub">{t('alreadyPending')}</p>
          {claim.authorizationDescription && (
            <>
              <p className="text-xs text-text-sub pt-2">
                {t('pendingDescription')}
              </p>
              <p className="whitespace-pre-wrap text-sm text-text">
                {claim.authorizationDescription}
              </p>
            </>
          )}
        </div>

        {claim.amountMaximum != null && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
              {t('pendingMaximumLabel')}
            </p>
            <p className="text-sm font-semibold text-text tabular-nums">
              {formatEur(claim.amountMaximum)}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Case 2 — terminal status: nothing more to do here.
  if (
    claim.status === 'ZAAKCEPTOWANO' ||
    claim.status === 'ODRZUCONO' ||
    claim.status === 'AUTORYZACJA_KWOTA_MAKSIMA' ||
    claim.status === 'REKLAMACJA'
  ) {
    return (
      <p className="rounded-md border border-border bg-input p-4 text-sm text-text-sub text-center">
        {t('notRequired')}
      </p>
    );
  }

  // Case 3 — pre-decision (`NA_WERYFIKACJI`): RHF + Zod-validated
  // request-authorization form. The wire body is `RequestAuthorizationDto`
  // (kwotaMaksima required + positive, optional comment 1..2000 chars).
  return <RequestAuthorizationForm claim={claim} onClose={onClose} t={t} tCommon={tCommon} />;
}

function RequestAuthorizationForm({
  claim,
  onClose,
  t,
  tCommon,
}: {
  claim: ClaimDto;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'employee.claims.modal.auth'>>;
  tCommon: ReturnType<typeof useTranslations<'common'>>;
}) {
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(RequestAuthorizationSchema) as Resolver<AuthFormValues>,
    defaultValues: {
      // Seed with the previously-persisted amountMaximum (when re-opening
      // after a soft-cancel) or the server-calculated doplata so the
      // verifier doesn't have to retype the typical value.
      kwotaMaksima:
        claim.amountMaximum ??
        (Number.isFinite(claim.paymentEur) ? claim.paymentEur : undefined),
      comment: '',
    },
  });

  const requestM = useRequestAuthorization(claim.nrZgl, {
    onSuccess: () => {
      toast.success(t('emailSent'));
      onClose();
    },
    onError: (err) => {
      // 4xx → surface server message (validation / state-machine errors);
      // network/5xx → generic toast. Mirrors the main Edit tab handler.
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tCommon('errorGeneric');
      toast.error(msg);
    },
  });

  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  // Note: the parent ModalBody already renders a <form> wrapper for the
  // main Edit tab — nested <form>s are invalid HTML. We render the
  // request-authorization fields inside a plain <div> and trigger the
  // mutation from a `type="button"` click handler that runs RHF's
  // `handleSubmit` manually. This also keeps the verifier from
  // accidentally firing the main Edit-tab submit when pressing Enter.
  const onValid: SubmitHandler<AuthFormValues> = (values) => {
    if (values.kwotaMaksima == null || !Number.isFinite(values.kwotaMaksima)) {
      return;
    }
    const body: RequestAuthorizationDto = {
      kwotaMaksima: Number(values.kwotaMaksima),
      comment:
        values.comment.trim().length > 0 ? values.comment.trim() : undefined,
    };
    void requestM.mutateAsync(body).catch(() => {
      // Error already surfaced via the mutation's onError handler — swallow
      // here so the promise rejection doesn't bubble as unhandled.
    });
  };

  const handleRequestClick = () => {
    void form.handleSubmit(onValid)();
  };

  // Live char counter for the comment textarea (max 2000 per Zod schema).
  const commentValue = form.watch('comment') ?? '';
  const commentLen = commentValue.length;

  const submitDisabled =
    requestM.isPending ||
    form.watch('kwotaMaksima') == null ||
    !(Number(form.watch('kwotaMaksima')) > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-input p-3 space-y-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('requestTitle')}
        </h4>
        <p className="text-xs text-text-sub">{t('requestHelp')}</p>
      </div>

      <FormField
        label={t('kwotaMaksimaLabel')}
        required
        description={t('kwotaMaksimaHelp')}
        error={errMsg('kwotaMaksima')}
        htmlFor="auth-kwotaMaksima"
      >
        <Input
          id="auth-kwotaMaksima"
          type="number"
          step="0.01"
          min={0}
          inputMode="decimal"
          {...form.register('kwotaMaksima', {
            setValueAs: (v) =>
              v === '' || v === null ? undefined : Number(v),
          })}
        />
      </FormField>

      <FormField
        label={t('commentLabel')}
        error={errMsg('comment')}
        htmlFor="auth-comment"
      >
        <Textarea
          id="auth-comment"
          rows={4}
          maxLength={AUTH_COMMENT_MAX}
          placeholder={t('commentPlaceholder')}
          {...form.register('comment')}
        />
        <p className="text-xs text-text-sub text-right tabular-nums">
          {commentLen} / {AUTH_COMMENT_MAX}
        </p>
      </FormField>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleRequestClick}
          disabled={submitDisabled}
        >
          {requestM.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {t('submitting')}
            </>
          ) : (
            t('requestButton')
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Mirror of the km-calc engine's `applyHoursAdjustment` semantics
 * (packages/shared/src/domain/km-calc.ts) — used only to render the live
 * `<HoursReadout>` under the verifier's `hoursAdjusted` input. Pure
 * arithmetic, no network roundtrip. Returns the projected post-correction
 * `totalDays` so the readout's "counted" value updates on every keystroke.
 *
 * Unit reminder: the form input is in HOURS (matches `HoursAdjustedSchema`
 * in shared/schemas/claims.ts), the engine works in DAYS — divide by 24
 * with `round2` (same precision the engine persists). Returns `null` when
 * we have no baseline to subtract from (legacy breakdown / fallback path).
 */
function computeLiveTotalDays(
  rawTotalDays: number | null,
  hoursAdjustedInput: number | undefined,
): number | null {
  if (rawTotalDays == null || !Number.isFinite(rawTotalDays)) return null;
  if (rawTotalDays <= 0) return rawTotalDays;
  const hours =
    hoursAdjustedInput != null && Number.isFinite(hoursAdjustedInput)
      ? Math.max(0, Number(hoursAdjustedInput))
      : 0;
  if (hours <= 0) return rawTotalDays;
  const korektaDni = Math.round((hours / 24) * 100) / 100;
  const adjusted = Math.max(0, Math.round((rawTotalDays - korektaDni) * 100) / 100);
  return adjusted;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
        {label}
      </p>
      <p className="text-sm font-semibold text-text tabular-nums">{value}</p>
    </div>
  );
}

function getDefaults(
  claim: ClaimDto,
  firstTarget: ClaimDecisionTarget | '',
): FormValues {
  return {
    targetStatus: firstTarget,
    dateStart: claim.dateStart.slice(0, 10),
    dateEnd: claim.dateEnd.slice(0, 10),
    timeFrom: claim.timeFrom,
    timeTo: claim.timeTo,
    mileage: claim.mileage,
    // Seed the form with the value currently driving the km-calc on the
    // server (`hoursAdjustedValue`). If the verifier hasn't overridden the
    // carrier's submission yet, this equals `origHoursAdjusted`. If they
    // have, this is the in-effect correction — exactly what they last saved.
    hoursAdjusted: claim.hoursAdjustedValue ?? 0,
    orderNumber: claim.orderNumber ?? '',
    orderDate: claim.orderDate ?? '',
    amountApproved:
      claim.amountApproved ?? claim.paymentEur ?? undefined,
    amountMaximum: claim.amountMaximum ?? undefined,
    comment: claim.comment ?? '',
    margin: claim.margin ?? undefined,
    authorizationDescription: claim.authorizationDescription ?? '',
    reklamacjaAmount: claim.reklamacjaAmount ?? undefined,
  };
}
