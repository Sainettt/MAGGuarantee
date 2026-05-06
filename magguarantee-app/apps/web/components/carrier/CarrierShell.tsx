'use client';

// Phase 3 — carrier-specific shell. Like <RoleShell> but with the
// <CarrierTabs> nav slot below the header. Keeps the same auth-gated
// layout pattern as <EmployeeShell>.

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Header } from '@/components/layout/Header';
import { CarrierTabs } from '@/components/carrier/CarrierTabs';
import { useAuth } from '@/lib/hooks/useAuth';

export function CarrierShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <CarrierTabs />
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
