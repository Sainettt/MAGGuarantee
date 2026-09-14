'use client';

// Layout shell for the single-page role groups (planista / dyspozytor /
// eksport / weryfikator). The session state machine (skeleton while
// `/auth/me` loads, redirect to /login only on a confirmed 401, error + retry
// when the API is unreachable) lives in <SessionGate>.

import { Header } from '@/components/layout/Header';
import { SessionGate } from '@/components/layout/SessionGate';

export function RoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <SessionGate>{children}</SessionGate>
      </main>
    </div>
  );
}
