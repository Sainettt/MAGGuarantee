'use client';

// Admin/opiekun password reset for a CARRIER — the UI half of
// `POST /carriers/:id/reset-password`, which had no caller until 2026-07-30
// (the endpoint existed but was unreachable from the app).
//
// Two dialogs, same two-step shape as the internal-user reset in
// <UsersListView>:
//   A. confirm — a reset invalidates the carrier's current password, so it
//      must never fire on a single misclick;
//   B. result — shows the one-time password ONCE, with a copy button.
//
// Difference from the user flow: no generate/custom choice. The carrier
// endpoint takes no body and always generates, so there is nothing to pick.
// The carrier also receives the password by email (`account-password-reset`),
// which the confirm copy states — the operator does not have to relay it.

import type { CarrierDto } from '@magguarantee/shared';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useResetCarrierPassword } from '@/lib/hooks/useCarriers';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';

interface CarrierResetPasswordDialogsProps {
  /** Row the operator picked, or null when no reset is in progress. */
  target: CarrierDto | null;
  /** Clears `target` — called on cancel AND after a successful reset. */
  onClose: () => void;
}

export function CarrierResetPasswordDialogs({
  target,
  onClose,
}: CarrierResetPasswordDialogsProps) {
  const t = useTranslations('carriers.resetPassword');
  const tCommon = useTranslations('common');
  const [info, setInfo] = useState<{ login: string; password: string } | null>(
    null,
  );
  const { copy, copied } = useCopyToClipboard();
  const resetM = useResetCarrierPassword();

  const onConfirm = async () => {
    if (!target) return;
    try {
      const res = await resetM.mutateAsync(target.id);
      // Close A, open B. The temp password is returned once and never again.
      onClose();
      setInfo({
        login: res.login,
        password: res.temporaryPassword ?? '',
      });
    } catch {
      toast.error(t('errorToast'));
    }
  };

  return (
    <>
      {/* A — confirm */}
      <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmDescription', {
                carrier: target
                  ? `${target.login}${target.name ? ` — ${target.name}` : ''}`
                  : '',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-[10px] border border-border bg-info-soft px-3.5 py-3 text-[13px] text-text">
            <KeyRound
              size={16}
              className="mt-0.5 shrink-0 text-text-sub"
              aria-hidden
            />
            <span>{t('confirmNote')}</span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={resetM.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void onConfirm()}
              disabled={resetM.isPending}
            >
              {t('confirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* B — result. Closing wipes the password from state. */}
      <Dialog open={info !== null} onOpenChange={(o) => !o && setInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('resultTitle')}</DialogTitle>
            <DialogDescription>{t('resultDescription')}</DialogDescription>
          </DialogHeader>
          {info && (
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-[10px] border border-border bg-info-soft px-3.5 py-3 text-sm">
                <span className="text-text-sub">{t('loginLabel')}</span>
                <span className="font-mono">{info.login}</span>
                <span className="text-text-sub">{t('passwordLabel')}</span>
                <span className="font-mono break-all">{info.password}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copy(info.password)}
                aria-label={t('copyAria')}
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-success" aria-hidden />
                    {tCommon('copied')}
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden />
                    {tCommon('copy')}
                  </>
                )}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setInfo(null)}>
              {tCommon('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
