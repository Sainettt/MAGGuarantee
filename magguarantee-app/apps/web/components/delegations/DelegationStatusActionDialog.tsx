'use client';

// Phase 7 — weryfikator per-row status-transition confirm dialog.
// docs/14-design-system.md §7.1 ("Weryfikator per-row status actions").
//
// ONE component, two modes (mirrors the §7.3 recommendation):
//   • mode 'in-transit' → plain confirm, NO input. Fires `POST /:id/in-transit`
//     (zgloszony → w_trasie).
//   • mode 'returned'   → confirm + ONE date-only field (`actualReturnAt`).
//     Fires `POST /:id/returned` (w_trasie → zjechal).
//
// There is deliberately NO cancel («Anuluj» = delegation-cancel) action here —
// owner decision 2026-06-10, weryfikator has no cancel authority. The ghost
// footer button reading «Anuluj» is the universal *dialog-dismiss* control
// (close-without-acting), NOT a cancel endpoint — keep it (DS §7.1 note).
//
// Mutation flow matches <ConfirmDeleteWithReasonDialog>: optimistic-free,
// `await onConfirm()`, close on resolve, stay open + parent toast on reject.

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  makeMarkReturnedFormSchema,
  type MarkReturnedFormValues,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/forms/Form';

export type DelegationActionMode = 'in-transit' | 'returned';

export interface DelegationStatusActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DelegationActionMode;
  /** Vehicle plate interpolated into the dialog copy so the verifier sees the row. */
  plate: string;
  /** Row's departure timestamp — lower-bounds `actualReturnAt` (soft guard). */
  departureAt?: string | null;
  /**
   * In-transit: called with no args. Returned: called with the validated
   * `actualReturnAt` (date-only). Returns a Promise — the dialog awaits it,
   * closes on resolve, stays open on reject (parent toasts the error).
   */
  onConfirm: (actualReturnAt?: string) => Promise<void>;
  /** External pending flag (TanStack `isPending`) — disables the form. */
  isLoading?: boolean;
}

/** Local `YYYY-MM-DD` for "today" — drives the soft not-in-future guard. */
function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DelegationStatusActionDialog({
  open,
  onOpenChange,
  mode,
  plate,
  departureAt,
  onConfirm,
  isLoading,
}: DelegationStatusActionDialogProps) {
  const t = useTranslations('weryfikator.actions.dialog');

  const today = useMemo(() => todayLocalDate(), []);
  const schema = useMemo(
    () => makeMarkReturnedFormSchema({ departureAt, today }),
    [departureAt, today],
  );

  const form = useForm<MarkReturnedFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { actualReturnAt: '' },
    mode: 'onChange',
  });

  // Reset the date every time the dialog (re)opens so a stale value never
  // carries over from a previous row.
  useEffect(() => {
    if (open) form.reset({ actualReturnAt: '' });
  }, [open, form]);

  const submitting = isLoading || form.formState.isSubmitting;

  // ── In-transit: plain confirm, no form, no validation ──────────────────
  const confirmInTransit = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Parent surfaces the error toast; keep the dialog open to retry.
    }
  };

  // ── Returned: RHF + Zod date-only field ────────────────────────────────
  const onSubmitReturned = form.handleSubmit(async (values) => {
    try {
      await onConfirm(values.actualReturnAt);
      onOpenChange(false);
    } catch {
      // Stay open; parent toasts. The date isn't re-typed.
    }
  });

  // Map the schema's soft-guard codes to i18n copy; required/format errors
  // fall through to the generic "required" message.
  const dateError = (() => {
    const msg = form.formState.errors.actualReturnAt?.message;
    if (!msg) return undefined;
    if (msg === 'future') return t('returned.errorFuture');
    if (msg === 'beforeDeparture') return t('returned.errorBeforeDeparture');
    return t('returned.errorRequired');
  })();

  const canSubmitReturned = form.formState.isValid && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {mode === 'in-transit' ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('inTransit.title')}</DialogTitle>
              <DialogDescription>
                {t('inTransit.description', { plate })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t('dismiss')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={confirmInTransit}
                disabled={submitting}
              >
                <Truck size={14} className="mr-1.5" aria-hidden />
                {t('inTransit.confirm')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmitReturned} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('returned.title')}</DialogTitle>
              <DialogDescription>
                {t('returned.description', { plate })}
              </DialogDescription>
            </DialogHeader>

            <FormField
              label={t('returned.dateLabel')}
              required
              error={dateError}
              htmlFor="delegation-actual-return"
            >
              <Input
                id="delegation-actual-return"
                type="date"
                className="h-10"
                autoFocus
                max={today}
                {...form.register('actualReturnAt')}
              />
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t('dismiss')}
              </Button>
              <Button type="submit" size="sm" disabled={!canSubmitReturned}>
                <CheckCircle2 size={14} className="mr-1.5" aria-hidden />
                {t('returned.confirm')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
