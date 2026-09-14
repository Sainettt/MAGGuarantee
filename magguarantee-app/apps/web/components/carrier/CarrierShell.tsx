'use client';

// Phase 3 — carrier-specific shell. Like <RoleShell> but with the
// <CarrierTabs> nav slot below the header. Session handling (skeleton /
// redirect on confirmed 401 / error + retry on API failure) is <SessionGate>.

import { Header } from '@/components/layout/Header';
import { SessionGate } from '@/components/layout/SessionGate';
import { CarrierTabs } from '@/components/carrier/CarrierTabs';

export function CarrierShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <CarrierTabs />
      <main className="flex-1">
        <SessionGate>{children}</SessionGate>
      </main>
    </div>
  );
}
