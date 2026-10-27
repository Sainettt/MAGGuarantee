// Phase 4 — 403 landing inside the employee shell. Renders *inside* the
// shell (sidebar + header still visible) so the user has obvious recovery
// paths (their nav, the back-to-home CTA).
//
// Reached from any employee-shell page whose permission the user lacks
// (`requirePermission(…, { onDenied: 'forbidden' })`), including a right
// revoked per user (docs/25 B6) that the edge, knowing the role catalog
// only, let through — and from `/employee` when no nav entry is left
// (`employeeLandingPath`). The CTA goes to `/employee`, which picks the first
// entry the user can see (an opiekun has no `dashboard.read`). This page is
// never gated, so it cannot loop.

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function ForbiddenPage() {
  const t = await getTranslations('forbidden');
  return (
    <section className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="rounded-xl border border-border bg-card shadow-card p-8 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger"
        >
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px] text-text">
          {t('title')}
        </h1>
        <p className="mt-2 text-[14px] text-text-sub">{t('message')}</p>
        <div className="mt-6">
          <Link
            href="/employee"
            className="inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition-colors bg-brand text-white hover:bg-brand-dark h-11 px-4 text-[14px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
          >
            {t('backToDashboard')}
          </Link>
        </div>
      </div>
    </section>
  );
}
