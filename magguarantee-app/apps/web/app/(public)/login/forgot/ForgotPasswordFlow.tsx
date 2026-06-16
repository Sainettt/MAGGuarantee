'use client';

// Phase 9 §9.1–9.2 — password-reset flow. One client island, three internal
// states (no cross-route session-passing needed):
//
//   'request' → single `login` input → POST /auth/forgot-password
//   'sent'    → enumeration-safe confirmation ("Jeśli konto istnieje…")
//   'reset'   → 6-box code (autoSubmit=false) + new-password pair + policy hint
//
// Security: the API ALWAYS returns 200 with the same shape whether or not the
// account exists (anti-enumeration). We never branch the UI on "not found" —
// the masked email is whatever the server returned (real or generic decoy).
//
// On reset success → toast + redirect to /login (NO auto-login — the 2FA
// boundary stays intact; the user re-authenticates with the new password).

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ForgotPasswordRequest as ForgotPasswordRequestSchema,
  ResetPasswordFormSchema,
} from '@magguarantee/shared';
import type {
  ForgotPasswordRequest,
  ResetPasswordForm,
} from '@magguarantee/shared';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { BackButton } from '@/components/auth/BackButton';
import { CodeBoxGroup } from '@/components/auth/CodeBoxGroup';
import { EmailHintBanner } from '@/components/auth/EmailHintBanner';
import { LoginCard } from '@/components/auth/LoginCard';
import { LoginError, type LoginErrorVariant } from '@/components/auth/LoginError';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordPolicyHint } from '@/components/auth/PasswordPolicyHint';
import { ResendButton, type ResendButtonHandle } from '@/components/auth/ResendButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ApiResponseError } from '@/lib/api/client';
import { forgotPassword, resendResetCode, resetPassword } from '@/lib/api/auth';

type Step = 'request' | 'sent' | 'reset';

interface SessionState {
  sessionToken: string;
  maskedEmail: string;
}

export function ForgotPasswordFlow() {
  const t = useTranslations('forgotPassword');
  const tLogin = useTranslations('login');
  const tVerify = useTranslations('verify');
  const router = useRouter();

  const [step, setStep] = useState<Step>('request');
  const [session, setSession] = useState<SessionState | null>(null);

  // ── Step 1: request form ──────────────────────────────────────
  const [requestErr, setRequestErr] = useState<LoginErrorVariant>('idle');

  const requestForm = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: { login: '' },
  });

  const onRequest = requestForm.handleSubmit(async (values) => {
    setRequestErr('idle');
    try {
      const res = await forgotPassword(values);
      setSession({
        sessionToken: res.sessionToken,
        maskedEmail: res.maskedEmail,
      });
      setStep('sent');
    } catch {
      // Only hard errors (network / 429) surface — never "account not found".
      // Both map to the generic network message; the success state itself is
      // identical whether or not the account exists (anti-enumeration).
      setRequestErr('network');
    }
  });

  if (step === 'request') {
    return (
      <LoginCard title={t('subtitle')} subtitle={t('subtitle')}>
        <form onSubmit={onRequest} noValidate className="space-y-4">
          <div>
            <Label htmlFor="forgot-login">{tLogin('loginLabel')}</Label>
            <Input
              id="forgot-login"
              autoComplete="username"
              autoFocus
              placeholder={tLogin('loginPlaceholder')}
              aria-invalid={requestForm.formState.errors.login ? true : undefined}
              {...requestForm.register('login')}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={requestForm.formState.isSubmitting}
          >
            {requestForm.formState.isSubmitting
              ? tVerify('resending')
              : t('submit')}
          </Button>
          <div className="text-center">
            <BackButton href="/login">{t('backToLogin')}</BackButton>
          </div>
        </form>
        <LoginError
          variant={requestErr}
          message={requestErr === 'network' ? tLogin('errorNetwork') : undefined}
        />
      </LoginCard>
    );
  }

  if (step === 'sent' && session) {
    return (
      <SentConfirmation
        maskedEmail={session.maskedEmail}
        onEnterCode={() => setStep('reset')}
      />
    );
  }

  if (step === 'reset' && session) {
    return (
      <ResetStep
        session={session}
        onSuccess={() => {
          toast.success(t('successToast'));
          router.replace('/login');
        }}
      />
    );
  }

  return null;
}

// ── Step 2: sent confirmation (enumeration-safe) ────────────────

function SentConfirmation({
  maskedEmail,
  onEnterCode,
}: {
  maskedEmail: string;
  onEnterCode: () => void;
}) {
  const t = useTranslations('forgotPassword');

  return (
    <LoginCard title={t('subtitle')} subtitle={t('subtitle')}>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand text-white mb-4 shadow-[0_4px_12px_rgba(220,38,38,0.2)]">
          <MailCheck size={28} aria-hidden />
        </div>
        <p className="text-[15px] font-bold text-text">{t('sentTitle')}</p>
        <p className="mt-2 text-[13px] text-text-sub">
          {t.rich('sentBody', {
            email: maskedEmail,
            strong: (chunks) => (
              <span className="font-bold text-brand-800 dark:text-brand-200">
                {chunks}
              </span>
            ),
          })}
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full mt-6"
        onClick={onEnterCode}
      >
        {t('enterCode')}
      </Button>

      <div className="mt-4 text-center">
        <BackButton href="/login">{t('backToLogin')}</BackButton>
      </div>
    </LoginCard>
  );
}

// ── Step 3: enter code + set new password ───────────────────────

function ResetStep({
  session,
  onSuccess,
}: {
  session: SessionState;
  onSuccess: () => void;
}) {
  const t = useTranslations('forgotPassword');
  const tVerify = useTranslations('verify');
  const tPolicy = useTranslations('passwordPolicy');

  const [errVariant, setErrVariant] = useState<LoginErrorVariant>('idle');
  const [errMessage, setErrMessage] = useState<string | undefined>(undefined);
  const [resetToken, setResetToken] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const resendBtn = useRef<ResendButtonHandle | null>(null);
  const firstPwdRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(ResetPasswordFormSchema),
    defaultValues: { code: '', password: '', confirm: '' },
  });

  const passwordValue = form.watch('password');
  const { ref: pwdRegRef, ...pwdReg } = form.register('password');

  // Initial 60s cooldown on entering the code step so resend can't be spammed
  // immediately (mirrors the 2FA verify screen).
  useEffect(() => {
    requestAnimationFrame(() => resendBtn.current?.start(60));
  }, []);

  // Live code → keep the RHF `code` field in sync. When it reaches 6 digits,
  // move focus to the first password field (autoSubmit=false: no submit — the
  // form needs the password pair too). Focus only advances when the user
  // hasn't started the password yet (don't yank focus away mid-edit).
  const onCodeChange = useCallback(
    (code: string) => {
      form.setValue('code', code, { shouldValidate: code.length === 6 });
      if (code.length === 6 && !form.getValues('password')) {
        firstPwdRef.current?.focus();
      }
    },
    [form],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setErrVariant('idle');
    setErrMessage(undefined);
    try {
      await resetPassword({
        sessionToken: session.sessionToken,
        code: values.code,
        newPassword: values.password,
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 401 || err.status === 400) {
          // Wrong / expired code. Shake the boxes, keep password values.
          setErrVariant('wrong');
          setErrMessage(t('errorWrongCode'));
          setResetToken((n) => n + 1);
          form.setValue('code', '');
        } else if (err.status === 410) {
          setErrVariant('wrong');
          setErrMessage(t('errorExpired'));
          setResetToken((n) => n + 1);
          form.setValue('code', '');
        } else {
          setErrVariant('network');
          setErrMessage(tVerify('errorNetwork'));
        }
      } else {
        setErrVariant('network');
        setErrMessage(tVerify('errorNetwork'));
      }
    }
  });

  const onResend = useCallback(async () => {
    if (isResending) return;
    setIsResending(true);
    try {
      const res = await resendResetCode({ sessionToken: session.sessionToken });
      resendBtn.current?.start(res.cooldownSec || 60);
      setResetToken((n) => n + 1);
      form.setValue('code', '');
      setErrVariant('idle');
      setErrMessage(undefined);
      toast.success(tVerify('resendSuccess'));
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 429) {
        const cooldown =
          typeof err.data?.cooldownSec === 'number' ? err.data.cooldownSec : 60;
        resendBtn.current?.start(cooldown);
        toast.warning(tVerify('resendCooldown', { seconds: cooldown }));
      } else {
        toast.error(tVerify('errorNetwork'));
      }
    } finally {
      setIsResending(false);
    }
  }, [isResending, session.sessionToken, form, tVerify]);

  const confirmError = form.formState.errors.confirm;

  return (
    <LoginCard title={t('subtitle')} subtitle={t('resetSubtitle')}>
      <EmailHintBanner
        intro={tVerify('sentTo')}
        maskedEmail={session.maskedEmail}
        lifetime={t('codeTtl')}
      />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <div className="mb-2 text-center text-[12px] font-bold uppercase tracking-[0.5px] text-text-sub">
            {tVerify('codeLabel')}
          </div>
          <CodeBoxGroup
            ariaLabel={tVerify('codeLabel')}
            error={errVariant === 'wrong'}
            resetToken={resetToken}
            autoSubmit={false}
            onChange={onCodeChange}
            // Required prop; never fires while autoSubmit is false.
            onComplete={() => {}}
          />
        </div>

        <div>
          <PasswordField
            label={t('newPasswordLabel')}
            autoComplete="new-password"
            ref={(el) => {
              pwdRegRef(el);
              firstPwdRef.current = el;
            }}
            {...pwdReg}
            error={
              form.formState.errors.password
                ? tPolicy('label')
                : undefined
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
          {form.formState.isSubmitting ? tVerify('submitting') : t('setPassword')}
        </Button>
      </form>

      <LoginError variant={errVariant} message={errMessage} />

      <div className="mt-4 flex items-center justify-center gap-4">
        <ResendButton ref={resendBtn} busy={isResending} onResend={onResend} />
        <BackButton href="/login">{t('backToLogin')}</BackButton>
      </div>
    </LoginCard>
  );
}
