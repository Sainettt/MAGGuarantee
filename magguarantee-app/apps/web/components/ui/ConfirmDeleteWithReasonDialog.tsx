'use client';

// Phase 4.4 — shared confirm dialog for irreversible hard-deletes.
//
// Wraps <Dialog> with an RHF + Zod-validated reason textarea. Used by every
// admin lookup page (carriers / vehicles / drivers / trailers / trailer-types)
// to satisfy the audit requirement that hard-delete always carries a free-form
// justification (lands in `audit_log.metadata.reason`).
//
// Behaviour:
//   - Title: "Trwałe usunięcie {entityLabel}" (e.g. "Trwałe usunięcie pojazdu")
//   - Body : "Tej operacji nie da się cofnąć. {entityName} zostanie trwale
//            usunięty. Podaj powód."
//   - Reason textarea — RHF + Zod (`DeleteWithReasonSchema`: min 3, max 500,
//     trimmed). Submit disabled until valid.
//   - On submit → `await onConfirm(reason)` → if it resolves, the dialog
//     closes. If it throws, the dialog stays open and the parent surfaces
//     an error toast (mirrors the rest of the admin mutation flow).

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  DeleteWithReasonSchema,
  type DeleteWithReasonDto,
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
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/forms/Form';

export interface ConfirmDeleteWithReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Lowercase noun describing the entity *kind* (e.g. "pojazdu", "kierowcy",
   * "przewoźnika"). Goes into the title.
   */
  entityLabel: string;
  /**
   * Identifier of the specific row (e.g. plate number, login). Goes into the
   * description so the operator sees exactly what's about to disappear.
   */
  entityName: string;
  /**
   * Receives the validated reason. Should return a Promise — the dialog awaits
   * it and closes on resolve. If it throws, the dialog stays open.
   */
  onConfirm: (reason: string) => Promise<void>;
  /**
   * External loading flag (e.g. when the parent uses TanStack Query's
   * `isPending` instead of awaiting onConfirm). Disables the form while true.
   */
  isLoading?: boolean;
}

export function ConfirmDeleteWithReasonDialog({
  open,
  onOpenChange,
  entityLabel,
  entityName,
  onConfirm,
  isLoading,
}: ConfirmDeleteWithReasonDialogProps) {
  const t = useTranslations('confirmDelete');

  const form = useForm<DeleteWithReasonDto>({
    resolver: zodResolver(DeleteWithReasonSchema),
    defaultValues: { reason: '' },
    mode: 'onChange',
  });

  // Reset the textarea every time the dialog re-opens — we don't want a stale
  // reason carrying over from the previous victim.
  useEffect(() => {
    if (open) form.reset({ reason: '' });
  }, [open, form]);

  const submitting = isLoading || form.formState.isSubmitting;
  const canSubmit = form.formState.isValid && !submitting;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await onConfirm(values.reason);
      onOpenChange(false);
    } catch {
      // Parent shows the error toast; keep the dialog open so the user can
      // retry without re-typing.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {t('title', { entityLabel })}
            </DialogTitle>
            <DialogDescription>
              {t('body', { entityName })}
            </DialogDescription>
          </DialogHeader>

          <FormField
            label={t('reasonLabel')}
            required
            error={form.formState.errors.reason?.message}
            htmlFor="confirm-delete-reason"
          >
            <Textarea
              id="confirm-delete-reason"
              rows={3}
              autoFocus
              placeholder={t('reasonPlaceholder')}
              {...form.register('reason')}
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
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              // The visual variant stays the brand-red default — that *is* the
              // danger affordance in this design system. We just lean into it
              // for the destructive action.
              disabled={!canSubmit}
            >
              {submitting ? t('deleting') : t('confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
