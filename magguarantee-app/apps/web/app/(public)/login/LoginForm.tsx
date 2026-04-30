'use client';

// Step 1 client island: login + password form, posts to `/auth/login`,
// stashes `{sessionToken, maskedEmail}` in sessionStorage for step 2 to
// read, then routes to `/login/verify`. Errors map to the LoginError
// variants (wrong / network) — the API's free-form `message` is never
// shown directly per docs/13-api-design.md.

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest as LoginRequestSchema } from '@magguarantee/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
import { LOGIN_SESSION_KEY, type LoginSessionState } from './session-storage';

export function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const [errVariant, setErrVariant] = useState<LoginErrorVariant>('idle');

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
    try {
      const res = await login(values);
      const state: LoginSessionState = {
        sessionToken: res.sessionToken,
        maskedEmail: res.maskedEmail,
        createdAt: Date.now(),
      };
      sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(state));
      router.push('/login/verify');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 401) setErrVariant('wrong');
        else setErrVariant('network');
      } else {
        setErrVariant('network');
      }
    }
  });

  const errMessage =
    errVariant === 'wrong'
      ? t('errorWrong')
      : errVariant === 'network'
        ? t('errorNetwork')
        : undefined;

  return (
    <LoginCard title={t('title')} subtitle={t('subtitle')}>
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
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder={t('passwordPlaceholder')}
            aria-invalid={!!errors.password || undefined}
            {...register('password')}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>
      </form>

      <LoginError variant={errVariant} message={errMessage} />
    </LoginCard>
  );
}
