'use client';

// Phase 3 — reklamacja form drawer, REWORKED 2026-07-31.
// Spec: docs/14 §"Reklamacja sheet" (authoritative eligibility table).
//
// The form itself is unchanged (2 fields + the sticky 48h <CountdownBanner>);
// what changed is everything AROUND it:
//
//   - the ceiling is no longer hand-inlined here. `getReklamacjaEligibility()`
//     in `@magguarantee/shared` is THE formula (the api calls the same helper),
//     so the client can no longer promise a ceiling the server then refuses —
//     which is exactly what the two drifted copies did before;
//   - THREE dead-end states (window expired / already filed / no delta) instead
//     of one, each rendered as an <EmptyState> with the form omitted (§6.5.13:
//     an impossible action is REMOVED, never a disabled button);
//   - the 5 server error codes are mapped to localized copy, and an
//     `REKLAMACJA_AMOUNT_EXCEEDS_CAP` 422 re-seeds the ceiling from the server's
//     `extensions.maxAmount` so the hint + validation re-render against the
//     authoritative number.
//
// The server re-validates the window, the one-per-claim flag AND the ceiling on
// every submit — nothing here is trusted.

import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Info, MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import {
  isWithinReklamacjaCap,
  getReklamacjaEligibility,
  REKLAMACJA_ALREADY_SUBMITTED,
  REKLAMACJA_AMOUNT_EXCEEDS_CAP,
  REKLAMACJA_CLAIM_NOT_DECIDED,
  REKLAMACJA_NO_DELTA,
  REKLAMACJA_WINDOW_EXPIRED,
  SubmitReklamacjaSchema,
  type ClaimDto,
  type SubmitReklamacjaDto,
} from '@magguarantee/shared';

import { CountdownBanner } from '@/components/carrier/CountdownBanner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useSubmitReklamacja } from '@/lib/hooks/useClaims';

/** Tick the eligibility clock once a minute — same cadence as the banner. */
const TICK_MS = 60_000;

interface Props {
  open: boolean;
  claim: ClaimDto | null;
  onClose: () => void;
}

type FormValues = SubmitReklamacjaDto;

/** `1 234,56` — the copy adds the «€» itself. */
function formatEur(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** RFC 7807 `extensions` bag off an api error — same access path as the other
 *  carrier flows (`carrier/claims/new`, `ClaimModal`). */
function problemExtensions(err: unknown): Record<string, unknown> | undefined {
  if (!(err instanceof ApiResponseError)) return undefined;
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return undefined;
  return extensions as Record<string, unknown>;
}

function problemCode(err: unknown): string | undefined {
  const code = problemExtensions(err)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function ReklamacjaSheet({ open, claim, onClose }: Props) {
  const t = useTranslations('carrier.reklamacja');
  const tCommon = useTranslations('common');

  // ── Eligibility (THE shared predicate) ──
  // `now` ticks every minute so a sheet left open across the 48h boundary flips
  // to the expired dead-end on its own, exactly like the countdown banner.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [open]);

  // The ceiling the SERVER reported on a 422 (`extensions.maxAmount`). Wins over
  // the locally derived one so the hint + validation immediately agree with the
  // authoritative number instead of re-refusing the same input.
  const [serverMaxAmount, setServerMaxAmount] = useState<number | null>(null);

  const eligibility = useMemo(
    () =>
      claim
        ? getReklamacjaEligibility(
            {
              status: claim.status,
              origPaymentEur: claim.origPaymentEur,
              paymentEur: claim.paymentEur,
              amountApproved: claim.amountApproved,
              reklamacjaSubmitted: claim.reklamacjaSubmitted,
              statusChangedAt: claim.statusChangedAt,
            },
            now,
          )
        : null,
    [claim, now],
  );

  const maxAmount = serverMaxAmount ?? eligibility?.maxAmount ?? 0;

  // ── Resolver: the shared submit schema + the ceiling rule ──
  // The cap lives outside the schema (a Zod schema cannot see the claim row), so
  // it is layered on here with the SHARED comparison helper — cent-precision,
  // equality allowed — never a hand-rolled `>` on floats.
  const resolver = useMemo<Resolver<FormValues>>(() => {
    const schema = SubmitReklamacjaSchema.superRefine((values, ctx) => {
      if (!isWithinReklamacjaCap(values.kwotaReklamacji, maxAmount)) {
        ctx.addIssue({
          code: 'custom',
          path: ['kwotaReklamacji'],
          message: t('errorExceedsCap', { max: formatEur(maxAmount) }),
        });
      }
    });
    return zodResolver(schema) as Resolver<FormValues>;
  }, [maxAmount, t]);

  const form = useForm<FormValues>({
    resolver,
    defaultValues: { tresc: '', kwotaReklamacji: 0 },
  });

  // Reset on open with a fresh draft (and a fresh server-ceiling memory).
  useEffect(() => {
    if (open) {
      form.reset({ tresc: '', kwotaReklamacji: 0 });
      setServerMaxAmount(null);
    }
  }, [open, form]);

  const submitM = useSubmitReklamacja({
    onSuccess: () => {
      toast.success(t('submittedToast'));
      onClose();
    },
    onError: (err) => {
      const code = problemCode(err);
      // Ceiling breach — re-seed the ceiling from the server and pin the error on
      // the amount field so the hint and the message agree.
      if (code === REKLAMACJA_AMOUNT_EXCEEDS_CAP) {
        const serverMax = problemExtensions(err)?.maxAmount;
        const nextMax =
          typeof serverMax === 'number' && Number.isFinite(serverMax)
            ? serverMax
            : maxAmount;
        setServerMaxAmount(nextMax);
        form.setError('kwotaReklamacji', {
          type: 'max',
          message: t('errorExceedsCap', { max: formatEur(nextMax) }),
        });
        toast.error(t('errorExceedsCap', { max: formatEur(nextMax) }));
        return;
      }
      // The remaining four are all "the world moved under this sheet" states:
      // surface the reason and let the refetched claim re-derive the dead-end
      // (the parent page owns the claim query).
      const staleCopy: Record<string, string> = {
        [REKLAMACJA_ALREADY_SUBMITTED]: t('errorAlreadySubmitted'),
        [REKLAMACJA_CLAIM_NOT_DECIDED]: t('errorNotDecided'),
        [REKLAMACJA_WINDOW_EXPIRED]: t('errorWindowExpired'),
        [REKLAMACJA_NO_DELTA]: t('errorNoDelta'),
      };
      if (code && staleCopy[code]) {
        toast.error(staleCopy[code]);
        setNow(new Date());
        return;
      }
      toast.error(t('submitErrorToast'));
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!claim || !eligibility?.canFile) return;
    submitM.mutate({ nrZgl: claim.nrZgl, body: values });
  }, onInvalidToast(form.setFocus, tCommon('validationFailedToast')));

  const submitting = submitM.isPending;
  const errs = form.formState.errors;
  const canFile = eligibility?.canFile ?? false;

  // ── The ceiling hint (always visible while the form is open) ──
  // Two keys, no branching inside one interpolated string: a rejected wniosek
  // paid nothing, so its parenthetical collapses to a single clause.
  const requested = claim ? (claim.origPaymentEur ?? claim.paymentEur) : 0;
  const maxHint =
    claim?.status === 'ODRZUCONO'
      ? t('maxHintRejected', { max: formatEur(maxAmount) })
      : t('maxHint', {
          max: formatEur(maxAmount),
          requested: formatEur(requested),
          // Derived by subtraction so the printed arithmetic always adds up,
          // whatever branch the shared cap helper took.
          paid: formatEur(Math.max(0, requested - maxAmount)),
        });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
            <SheetDescription>
              {claim ? t('sheetSubtitle', { nrZgl: claim.nrZgl }) : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            {/* The countdown is meaningful only while filing is still possible;
                the expired dead-end below carries the past-deadline message. */}
            {canFile && eligibility?.deadlineAt && (
              <CountdownBanner deadline={eligibility.deadlineAt} />
            )}

            {canFile ? (
              <div className="space-y-4">
                <FormField
                  label={t('fieldText')}
                  required
                  error={errs.tresc?.message}
                  htmlFor="rek-tresc"
                  description={t('fieldTextHint')}
                >
                  <Textarea
                    id="rek-tresc"
                    rows={6}
                    {...form.register('tresc')}
                  />
                </FormField>

                <FormField
                  label={t('fieldAmount')}
                  required
                  error={errs.kwotaReklamacji?.message}
                  htmlFor="rek-kwota"
                  description={maxHint}
                >
                  <Input
                    id="rek-kwota"
                    type="number"
                    step="0.01"
                    min={0}
                    {...form.register('kwotaReklamacji', {
                      setValueAs: (v) =>
                        v === '' || v === null ? 0 : Number(v),
                    })}
                  />
                </FormField>
              </div>
            ) : (
              <DeadEnd
                reason={eligibility?.blockedReason ?? 'NOT_DECIDED'}
                hasRequestedAmount={requested > 0}
              />
            )}
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {canFile ? tCommon('cancel') : tCommon('close')}
            </Button>
            {/* §6.5.13 — an impossible action is REMOVED, not disabled. */}
            {canFile && (
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? t('submitting') : t('submit')}
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The dead-end states, reachable by deep-link / a stale tab. Form omitted, one
 * <EmptyState> explaining WHY — docs/14 §"The three dead-end states" (+ the
 * defensive `NOT_DECIDED` case, which the detail page never offers a CTA for).
 */
function DeadEnd({
  reason,
  hasRequestedAmount,
}: {
  reason: 'NOT_DECIDED' | 'ALREADY_SUBMITTED' | 'WINDOW_EXPIRED' | 'NO_DELTA';
  /** Picks between the two NO_DELTA copies (`origPaymentEur > 0`). */
  hasRequestedAmount: boolean;
}) {
  const t = useTranslations('carrier.reklamacja');

  switch (reason) {
    case 'WINDOW_EXPIRED':
      return (
        <EmptyState
          icon={Clock}
          title={t('expiredTitle')}
          message={t('expiredMessage')}
        />
      );
    case 'ALREADY_SUBMITTED':
      return (
        <EmptyState
          icon={MessageSquareWarning}
          title={t('alreadyTitle')}
          message={t('alreadyMessage')}
        />
      );
    case 'NO_DELTA':
      return (
        <EmptyState
          icon={Info}
          title={t('noDeltaTitleSheet')}
          message={hasRequestedAmount ? t('noDelta') : t('noDeltaZero')}
        />
      );
    case 'NOT_DECIDED':
    default:
      return (
        <EmptyState
          icon={Info}
          title={t('notDecidedTitle')}
          message={t('notDecidedMessage')}
        />
      );
  }
}
