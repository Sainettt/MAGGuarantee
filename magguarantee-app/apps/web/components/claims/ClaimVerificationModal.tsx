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

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  Controller,
  useForm,
  type FieldErrors,
  type Resolver,
  type SubmitHandler,
} from 'react-hook-form';
import { toast } from 'sonner';
import {
  UpdateClaimSchema,
  type ClaimDto,
  type PreviewClaimDto,
  type UpdateClaimDto,
} from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { RecalcBadge } from '@/components/claims/RecalcBadge';
import {
  decisionTargetsFor,
  type ClaimDecisionTarget,
} from '@/components/claims/claim-transitions';
import { FormField } from '@/components/forms/Form';
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
      className="flex h-full flex-col"
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

            {/* Read-only context block */}
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-input p-3">
              <Stat
                label={tEdit('kmGuaranteed')}
                value={`${Math.round(claim.kmGuaranteed).toLocaleString('pl-PL')} km`}
              />
              <Stat
                label={tEdit('amountRequested')}
                value={formatEur(claim.amountRequested)}
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

            {/* Corrections — hidden for pure-rejection variants. */}
            {targetStatus &&
              targetStatus !== 'ODRZUCONO' &&
              targetStatus !== 'REKLAMACJA_ODRZUCONO' && (
                <div className="grid grid-cols-2 gap-3">
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
                    {/* Surface the carrier's original input when the verifier
                        (or a prior verifier) has overridden it. We render the
                        hint only on a real divergence — equal values mean no
                        override happened yet and the input is the source of
                        truth on its own. */}
                    {claim.origHoursAdjusted !== null &&
                      claim.origHoursAdjusted !== claim.hoursAdjustedValue && (
                        <p className="text-xs text-warning mt-1">
                          {tEdit('hoursAdjustedOrigHint', {
                            orig: claim.origHoursAdjusted,
                          })}
                        </p>
                      )}
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
                </div>
              )}

            {/* Variant-specific fields */}
            {targetStatus === 'ZAAKCEPTOWANO' && (
              <div className="grid grid-cols-2 gap-3">
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
                  <Input
                    id="claim-amountApproved"
                    type="number"
                    step="0.01"
                    min={0}
                    {...form.register('amountApproved', {
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                  />
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
              </div>
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
            <AuthorizationTab claim={claim} />
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

function AuthorizationTab({ claim }: { claim: ClaimDto }) {
  const t = useTranslations('employee.claims.modal.auth');
  const tCommon = useTranslations('common');

  const [margin, setMargin] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [amountMaximum, setAmountMaximum] = useState<string>(
    claim.amountMaximum != null ? String(claim.amountMaximum) : '',
  );

  const updateM = useUpdateClaim({
    onSuccess: () => {
      toast.success(t('savedToast'));
    },
    onError: (err) => {
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tCommon('errorGeneric');
      toast.error(msg);
    },
  });

  // Case 1 — already pending authorization. Show description (read-only)
  // + amountMaximum entry (writes a ZAAKCEPTOWANO PATCH with amountMaximum
  // override; we don't have a dedicated "set max amount" endpoint, so we
  // surface the value here for record-keeping. Backend will wire the
  // dedicated transition in sub-slice 4.2.)
  if (claim.status === 'OCZEKUJE_NA_AUTORYZACJE') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-input p-3 space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('pendingTitle')}
          </h4>
          {claim.authorizationDescription && (
            <>
              <p className="text-xs text-text-sub">{t('pendingDescription')}</p>
              <p className="whitespace-pre-wrap text-sm text-text">
                {claim.authorizationDescription}
              </p>
            </>
          )}
        </div>

        <FormField
          label={t('amountMaximumLabel')}
          htmlFor="auth-amountMaximum"
        >
          <Input
            id="auth-amountMaximum"
            type="number"
            step="0.01"
            min={0}
            value={amountMaximum}
            onChange={(e) => setAmountMaximum(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-text-sub">
          {/* Note: persistence of the Maksim amount currently rides on
              the same PATCH endpoint; a dedicated `POST /claims/:nrZgl/maksim-amount`
              is on the api-agent backlog (sub-slice 4.2). For now the
              button is informational — it triggers the existing PATCH
              with `amountMaximum` and no status change is allowed yet. */}
        </p>
      </div>
    );
  }

  // Case 2 — terminal status: nothing more to do here.
  if (claim.status === 'ZAAKCEPTOWANO' || claim.status === 'ODRZUCONO') {
    return (
      <p className="rounded-md border border-border bg-input p-4 text-sm text-text-sub text-center">
        {t('notRequired')}
      </p>
    );
  }

  // Case 3 — pre-decision: offer "Request authorization" form.
  // This wires the existing PATCH endpoint with targetStatus =
  // OCZEKUJE_NA_AUTORYZACJE per the task brief — Maksim email is added
  // server-side in sub-slice 4.2 without UI changes.
  const onRequest = () => {
    const m = Number(margin);
    if (!Number.isFinite(m)) {
      toast.error(tCommon('errorGeneric'));
      return;
    }
    if (description.trim().length < 1) {
      toast.error(tCommon('errorGeneric'));
      return;
    }
    updateM.mutate({
      nrZgl: claim.nrZgl,
      body: {
        targetStatus: 'OCZEKUJE_NA_AUTORYZACJE',
        margin: m,
        authorizationDescription: description.trim(),
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-input p-3 space-y-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('requestTitle')}
        </h4>
        <p className="text-xs text-text-sub">{t('requestHelp')}</p>
      </div>

      <FormField label={t('margin')} required htmlFor="auth-margin">
        <Input
          id="auth-margin"
          type="number"
          step="0.01"
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
        />
      </FormField>
      <FormField
        label={t('description')}
        required
        htmlFor="auth-description"
      >
        <Textarea
          id="auth-description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={onRequest}
          disabled={updateM.isPending}
        >
          {updateM.isPending ? t('submitting') : t('submitRequest')}
        </Button>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

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
