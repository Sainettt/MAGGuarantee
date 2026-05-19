'use client';

// Layout shell for every authenticated route group. Pulls the current user
// from `useAuth`; when no user is loaded yet (still fetching `/auth/me`),
// shows a skeleton rather than a flash of empty content. If the cookies are
// stale and `me` returns `null`, we redirect to /login — this is a fallback
// to the middleware which already gates on `mt_access`, but covers the case
// where the cookie is present but the user record was deleted server-side.

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Header } from '@/components/layout/Header';
import { useAuth } from '@/lib/hooks/useAuth';

export function RoleShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {isLoading || !user ? (
          <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-12">
            <div className="h-8 w-48 rounded bg-input animate-pulse" />
            <div className="mt-4 h-4 w-72 rounded bg-input animate-pulse" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
