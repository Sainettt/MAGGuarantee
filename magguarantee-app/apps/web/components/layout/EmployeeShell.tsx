'use client';

// Employee shell — RoleShell + EmployeeNav. The nav itself is role-gated
// (only admin sees admin links per docs/14). Other employee roles
// (opiekun, planista, dyspozytor, eksport, weryfikator) get the same shell
// but with an empty nav row that doesn't render at all (returns null when
// the filtered list is empty).

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Header } from '@/components/layout/Header';
import { EmployeeNav } from '@/components/layout/EmployeeNav';
import { useAuth } from '@/lib/hooks/useAuth';

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <EmployeeNav />
      <main className="flex-1">
        {isLoading || !user ? (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
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
