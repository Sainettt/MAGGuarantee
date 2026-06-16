'use client';

// Phase 9 §9.3 — forced change-password form (non-dismissible gate).
//
// Reached post-2FA when mustChangePassword=true. The user is authenticated but
// gated: they cannot reach the app until they set their own password.
//
// Non-dismissibility (deviates from §8.4 Esc-closes):
//   * No ✕, no app nav, no back-to-login — this is a full-page route, not a
//     <Dialog>, so there is nothing to dismiss and Esc is a no-op.
//   * Server middleware re-redirects any gated path back here while the flag
//     holds — we render no escape hatch to the app.
//   * The ONLY exit without setting a password is the "Wyloguj się" link
//     (drops the session, returns to /login) — a user must never be trapped.
//
// No current-password field — the temp password + 2FA already proved identity
// this session. On success the server returns fresh cookies with the flag
// cleared; we hard-navigate to the role landing (full reload wipes the router
// cache so the just-cleared gate doesn't replay a stale redirect).

import { zodResolver } from '@hookform/resolvers/zod';
import { SetPasswordFormSchema } from '@magguarantee/shared';
import type { Role, SetPasswordForm } from '@magguarantee/shared';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { BackButton } from '@/components/auth/BackButton';
import { LoginCard } from '@/components/auth/LoginCard';
import { LoginError, type LoginErrorVariant } from '@/components/auth/LoginError';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordPolicyHint } from '@/components/auth/PasswordPolicyHint';
import { Button } from '@/components/ui/Button';
import { changePassword, logout } from '@/lib/api/auth';
import { ApiResponseError } from '@/lib/api/client';
import { ME_QUERY_KEY } from '@/lib/hooks/useAuth';
import { landingFor } from '@/lib/roles';

export function ChangePasswordForm() {
  const t = useTranslations('changePassword');
  const tVerify = useTranslations('verify');
  const tPolicy = useTranslations('passwordPolicy');
  const router = useRouter();
  const qc = useQueryClient();

  const [errVariant, setErrVariant] = useState<LoginErrorVariant>('idle');
  const [errMessage, setErrMessage] = useState<string | undefined>(undefined);

  const form = useForm<SetPasswordForm>({
    resolver: zodResolver(SetPasswordFormSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const passwordValue = form.watch('password');
  const { ref: pwdRef, ...pwdReg } = form.register('password');

  const onSubmit = form.handleSubmit(async (values) => {
    setErrVariant('idle');
    setErrMessage(undefined);
    try {
      const res = await changePassword({ newPassword: values.password });
      // Server set fresh cookies with the flag cleared. Prime the cache so the
      // landing renders without a /me round-trip, then HARD-navigate (full
      // reload wipes the router cache → no stale gate-redirect replay).
      qc.setQueryData(ME_QUERY_KEY, res.user);
      toast.success(t('successToast'));
      const role = res.user.role as Role;
      const destination = landingFor(role);
      if (typeof window !== 'undefined') {
        window.location.assign(destination);
        return;
      }
      router.replace(destination);
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 401) {
        // Session died mid-flow — back to login.
        router.replace('/login');
        return;
      }
      setErrVariant('network');
      setErrMessage(tVerify('errorNetwork'));
    }
  });

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      // Non-fatal — clear local state and route to /login regardless.
    }
    qc.setQueryData(ME_QUERY_KEY, null);
    qc.removeQueries({ queryKey: ME_QUERY_KEY });
    router.replace('/login');
    router.refresh();
  };

  const confirmError = form.formState.errors.confirm;

  return (
    <LoginCard title={t('subtitle')} subtitle={t('subtitle')}>
      {/* Calm, info-toned explainer (NOT a warning) — onboarding is routine. */}
      <div className="bg-info-soft border border-border rounded-[10px] px-4 py-3 mb-6 text-[13px] text-text flex items-start gap-2">
        <KeyRound size={16} className="text-text-sub mt-0.5 shrink-0" aria-hidden />
        <span>{t('explainer')}</span>
      </div>

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

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? tVerify('submitting') : t('submit')}
        </Button>
      </form>

      <LoginError variant={errVariant} message={errMessage} />

      {/* The ONLY escape hatch — drops the session, returns to /login. */}
      <div className="mt-4 text-center">
        <BackButton onClick={onLogout}>{t('logout')}</BackButton>
      </div>
    </LoginCard>
  );
}
