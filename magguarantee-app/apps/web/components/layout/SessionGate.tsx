'use client';

// Client-side session gate shared by <RoleShell> and <CarrierShell>. The
// server layout (`requireRoleAccess`) already vetted the session; this covers
// the client lifetime of the page:
//   * loading            → skeleton;
//   * anonymous (401)    → redirect to /login (session really ended);
//   * `/auth/me` failed  → «session could not be verified» + retry. NOT a
//     redirect: a network blip or API restart must not look like a logout.

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { ErrorState } from '@/components/ui/ErrorState';
import { useAuth } from '@/lib/hooks/useAuth';

export function SessionGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('errors.session');
  const { user, isLoading, isAnonymous, isError, error, isFetching, refetch } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAnonymous) router.replace('/login');
  }, [isAnonymous, router]);

  if (user) return <>{children}</>;

  if (isError && !isLoading) {
    return (
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-12">
        <ErrorState
          error={error}
          title={t('title')}
          message={t('message')}
          onRetry={() => {
            void refetch();
          }}
          isRetrying={isFetching}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-12">
      <div className="h-8 w-48 rounded bg-input animate-pulse" />
      <div className="mt-4 h-4 w-72 rounded bg-input animate-pulse" />
    </div>
  );
}
