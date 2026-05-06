'use client';

// Phase 3 — reklamacja form drawer. Triggered from claim detail when the
// claim is decided and within 48h. Per docs/14 Phase 3 § "Reklamacja sheet":
// 480px sheet, sticky 48h countdown banner at the top, two fields (tresc
// + kwotaReklamacji), server is the source of truth on the deadline.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
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
import { useSubmitReklamacja } from '@/lib/hooks/useClaims';

const REKLAMACJA_WINDOW_MS = 48 * 60 * 60 * 1000;

interface Props {
  open: boolean;
  claim: ClaimDto | null;
  onClose: () => void;
}

type FormValues = SubmitReklamacjaDto;

export function ReklamacjaSheet({ open, claim, onClose }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(SubmitReklamacjaSchema),
    defaultValues: { tresc: '', kwotaReklamacji: 0 },
  });

  // Reset on open with a fresh draft.
  useEffect(() => {
    if (open) form.reset({ tresc: '', kwotaReklamacji: 0 });
  }, [open, form]);

  const submitM = useSubmitReklamacja({
    onSuccess: () => {
      toast.success('Reklamacja wysłana');
      onClose();
    },
    onError: () => toast.error('Nie udało się wysłać reklamacji'),
  });

  const deadline = useMemo(() => {
    if (!claim?.statusChangedAt) return null;
    return new Date(
      new Date(claim.statusChangedAt).getTime() + REKLAMACJA_WINDOW_MS,
    );
  }, [claim?.statusChangedAt]);

  // Re-render when the deadline crosses (so the form switches to the
  // expired state). The CountdownBanner already ticks every minute; we
  // mirror its state via a local boolean updated on tick + on mount.
  const [expired, setExpired] = useState<boolean>(() =>
    deadline ? deadline.getTime() <= Date.now() : false,
  );
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setExpired(deadline.getTime() <= Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [deadline]);

  const maxAmount = useMemo(() => {
    if (!claim) return null;
    const requested = claim.amountRequested ?? 0;
    const approved = claim.amountApproved ?? 0;
    const diff = requested - approved;
    return diff > 0 ? diff : null;
  }, [claim]);

  const onSubmit = form.handleSubmit((values) => {
    if (!claim || expired) return;
    submitM.mutate({
      nrZgl: claim.nrZgl,
      body: values,
    });
  });

  const submitting = submitM.isPending;
  const errs = form.formState.errors;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Złóż reklamację</SheetTitle>
            <SheetDescription>
              {claim ? `Wniosek ${claim.nrZgl}` : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            {deadline && <CountdownBanner deadline={deadline} />}

            {expired ? (
              <EmptyState
                title="Termin reklamacji upłynął"
                message="Reklamacja może być zgłoszona w ciągu 48 godzin od decyzji."
              />
            ) : (
              <div className="space-y-4">
                <FormField
                  label="Treść reklamacji"
                  required
                  error={errs.tresc?.message}
                  htmlFor="rek-tresc"
                  description="Opisz powód reklamacji — od 20 do 2000 znaków."
                >
                  <Textarea
                    id="rek-tresc"
                    rows={6}
                    {...form.register('tresc')}
                  />
                </FormField>

                <FormField
                  label="Kwota reklamacji (EUR)"
                  required
                  error={errs.kwotaReklamacji?.message}
                  htmlFor="rek-kwota"
                  description={
                    maxAmount != null
                      ? `Maksymalnie: ${new Intl.NumberFormat('pl-PL', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(maxAmount)} €`
                      : undefined
                  }
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
              Anuluj
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || expired}
            >
              {submitting ? 'Wysyłanie…' : 'Wyślij reklamację'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
