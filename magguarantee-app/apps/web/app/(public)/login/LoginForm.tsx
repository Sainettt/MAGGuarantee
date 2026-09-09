'use client';

// Step 1 client island: login + password form, posts to `/auth/login`,
// stashes `{sessionToken, maskedEmail}` in sessionStorage for step 2 to
// read, then routes to `/login/verify`. Errors map to the LoginError
// variants (wrong / network) — the API's free-form `message` is never
// shown directly per docs/13-api-design.md.
//
// Above the form sits the Google button (docs/24 §A3). The password path stays
// for everyone: carriers have no Workspace account at all, and employees need a
// way in when Google or MAGSpace is down. The SSO errors ARE shown verbatim,
// unlike the password ones — they are a fixed set of localised strings picked
// from `extensions.code`, not free-form text from the api.

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest as LoginRequestSchema } from '@magguarantee/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { LoginRequest } from '@magguarantee/shared';

import { LoginCard } from '@/components/auth/LoginCard';
import { LoginError, type LoginErrorVariant } from '@/components/auth/LoginError';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ApiResponseError } from '@/lib/api/client';
import { login } from '@/lib/api/auth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { LOGIN_SESSION_KEY, type LoginSessionState } from './session-storage';

export function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  // `?next=...` is set by middleware when a deep-link redirected through
  // login. Pass it straight to step 2 — VerifyForm validates it post-login
  // (we can't validate here because we don't yet know the user's role).
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [errVariant, setErrVariant] = useState<LoginErrorVariant>('idle');
  const [showPassword, setShowPassword] = useState(false);
  // Kept separate from `errVariant`: an SSO refusal carries its own localised
  // sentence, while the password errors are one of two fixed variants.
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { login: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrVariant('idle');
    setSsoError(null);
    try {
      const res = await login(values);
      const state: LoginSessionState = {
        sessionToken: res.sessionToken,
        maskedEmail: res.maskedEmail,
        createdAt: Date.now(),
      };
      sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(state));
      const verifyUrl = next
        ? `/login/verify?next=${encodeURIComponent(next)}`
        : '/login/verify';
      router.push(verifyUrl);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 401) setErrVariant('wrong');
        else setErrVariant('network');
      } else {
        setErrVariant('network');
      }
    }
  });

  // An SSO refusal wins the single error slot: it is the more specific answer,
  // and it is the one the user just triggered.
  const errMessage =
    ssoError ??
    (errVariant === 'wrong'
      ? t('errorWrong')
      : errVariant === 'network'
        ? t('errorNetwork')
        : undefined);
  const errVariantShown: LoginErrorVariant = ssoError ? 'network' : errVariant;

  return (
    <LoginCard title={t('title')} subtitle={t('subtitle')}>
      <GoogleSignInButton
        next={next}
        onError={(message) => {
          setSsoError(message);
          if (message) setErrVariant('idle');
        }}
        onBusyChange={setSsoBusy}
      />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="login">{t('loginLabel')}</Label>
          <Input
            id="login"
            autoComplete="username"
            autoFocus
            placeholder={t('loginPlaceholder')}
            aria-invalid={!!errors.login || undefined}
            {...register('login')}
          />
        </div>
        <div>
          <Label htmlFor="password">{t('passwordLabel')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={t('passwordPlaceholder')}
              aria-invalid={!!errors.password || undefined}
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('passwordHide') : t('passwordShow')}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-text-sub hover:text-text outline-none focus-visible:text-text"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting || ssoBusy}
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>

        <div className="text-center">
          <Link
            href="/login/forgot"
            className="text-[13px] text-text-sub hover:text-brand transition-colors focus-visible:outline-none focus-visible:text-brand"
          >
            {t('forgotPassword')}
          </Link>
        </div>
      </form>

      <LoginError variant={errVariantShown} message={errMessage} />
    </LoginCard>
  );
}
