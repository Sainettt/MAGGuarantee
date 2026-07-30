'use client';

// Self-service password change — available to EVERY role from the user menu,
// next to "Wyloguj" (decision 2026-07-30).
//
// Distinct from the two neighbouring flows:
//   * `/login/change-password` — the FORCED change (mustChangePassword), a
//     full-page non-dismissible gate. Same endpoint, different context.
//   * `/login/forgot` — for users who cannot log in at all (email code).
//     This dialog is for a user who IS logged in and simply wants a new
//     password.
//
// No current-password field: `ChangePasswordRequest` deliberately carries only
// `newPassword` — the live JWT session (2FA-gated at login) is the proof of
// identity. See the schema comment in `packages/shared/src/schemas/auth.ts`.
//
// On success the server issues a fresh cookie pair, so the session survives
// the change and the user stays where they are.

import { zodResolver } from '@hookform/resolvers/zod';
import { SetPasswordFormSchema } from '@magguarantee/shared';
import type { SetPasswordForm } from '@magguarantee/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordPolicyHint } from '@/components/auth/PasswordPolicyHint';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { changePassword } from '@/lib/api/auth';
import { ApiResponseError } from '@/lib/api/client';
import { ME_QUERY_KEY } from '@/lib/hooks/useAuth';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const t = useTranslations('changePassword');
  const tCommon = useTranslations('common');
  const tPolicy = useTranslations('passwordPolicy');
  const qc = useQueryClient();
  const router = useRouter();

  const form = useForm<SetPasswordForm>({
    resolver: zodResolver(SetPasswordFormSchema),
    defaultValues: { password: '', confirm: '' },
  });

  // Never leave a typed password sitting in form state after the dialog goes
  // away — reopening must always start blank.
  useEffect(() => {
    if (!open) form.reset({ password: '', confirm: '' });
  }, [open, form]);

  const passwordValue = form.watch('password');
  const { ref: pwdRef, ...pwdReg } = form.register('password');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await changePassword({ newPassword: values.password });
      // Fresh cookies are already set by the server; prime the cache so any
      // `mustChangePassword` flag clears without a /me round-trip.
      qc.setQueryData(ME_QUERY_KEY, res.user);
      toast.success(t('dialogSuccessToast'));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 401) {
        // Session died mid-flow — nothing to change, send them to login.
        qc.setQueryData(ME_QUERY_KEY, null);
        router.replace('/login');
        return;
      }
      toast.error(t('dialogErrorToast'));
    }
  });

  const confirmError = form.formState.errors.confirm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <PasswordField
              label={t('newPasswordLabel')}
              autoComplete="new-password"
              autoFocus
              ref={pwdRef}
              {...pwdReg}
              error={
                form.formState.errors.password ? tPolicy('label') : undefined
              }
            />
            <PasswordPolicyHint value={passwordValue ?? ''} />
          </div>

          <PasswordField
            label={t('confirmPasswordLabel')}
            autoComplete="new-password"
            {...form.register('confirm')}
            error={confirmError ? tPolicy('mismatch') : undefined}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={form.formState.isSubmitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t('dialogSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
