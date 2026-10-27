// docs/25 §3 B6 / docs/14 «Carrier „Dokumenty” tab» B.1–B.3 — the carrier's
// own company and fleet documents, for a carrier an admin granted
// `carrier_documents.read` (and maybe `.add`). The same <CarrierDocumentsTab>
// the opiekun uses; its controls follow the viewer's rights (upload with
// `.add`, never delete — `.delete` is not grantable to a carrier).
//
// Gate (server, on the EFFECTIVE permissions of `/auth/me`):
//   * `requirePermission('carrier_documents.read')` — the per-user right;
//   * scope — the carrier panel and an own company (`carrierDocumentsCarrierId`);
//     admin reaches the carrier shell and holds `.read` by role, but has
//     neither.
// Either fails → `/carrier/claims` (policy: redirect, not a 403 screen; the
// role landing `/carrier` is an alias of it). Deliberately NOT in the edge
// `PATH_PERMISSIONS`: the edge sees the role only and would bounce every
// carrier the right was granted to (docs/25 R3).

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { CarrierDocumentsTab } from '@/components/documents/CarrierDocumentsTab';
import { carrierDocumentsCarrierId } from '@/lib/auth/carrierDocuments';
import { canAny, effectivePermissionsOf } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const DENIED_PATH = '/carrier/claims';

export default async function CarrierDocumentsPage() {
  const user = await requirePermission('carrier_documents.read', { onDenied: 'landing' });
  const carrierId = carrierDocumentsCarrierId(user);
  if (!carrierId) redirect(DENIED_PATH);

  const t = await getTranslations('carrier.documents');
  const canAdd = canAny(effectivePermissionsOf(user), 'carrier_documents.add');

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-text">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-sub">
          {canAdd ? t('subtitleAdd') : t('subtitleRead')}
        </p>
      </div>
      <CarrierDocumentsTab carrierId={carrierId} />
    </section>
  );
}
