'use client';

// Phase 6 — VehicleDetailModal. A thin, entity-specific wrapper that maps a
// VehicleDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9, §6.15). The generic shell is NOT re-implemented here.
//
// The section order mirrors VehicleSheet's five FormSections so the read-only
// view and the edit Sheet feel like the same object:
//   Identyfikacja · Przypisanie · Wyposażenie · Stawki · Pozwolenia.
// A trailing «Pozostałe» section carries fields with no Sheet input of their
// own (lastDroveAt is system-set, notes is free text). A final «Załączniki»
// section lists umowa/cabotage attachments — each row carries an «Otwórz»
// action that opens the document inline in a new tab (read-only "view"
// action, the modal itself stays non-editing).
//
// Formatting reuses the shared helpers in components/ui/entity-detail-values.tsx
// and lib/format/numbers.ts — no duplicated Intl wrappers.
//
// docs/14 §17.6 — planner transfer (docs/29):
//   * a LAST section «Historia planistów» (<PlannerHistoryTimeline>) for the
//     viewers of U11 (admin, the carrier's opiekun, the current planista). A
//     carrier (`hideCarrier`) never gets it and no request is sent; a 403 hides
//     the section silently;
//   * the «Planista» row gets the pending badge while a request is open;
//   * the vehicle's CURRENT planista gets «Przekaż ciągnik» in the footer
//     (D3, via the additive `extraActions` slot) → the request dialog stacked
//     over this modal. The opiekun files from «Edytuj» instead (§17.2).

import {
  ArrowLeftRight,
  Banknote,
  ExternalLink,
  FileText,
  History,
  Info,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
  UserCog,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import type { VehicleAttachmentDto, VehicleDto } from '@magguarantee/shared';
import { toast } from 'sonner';

import { VehicleStatusBadge } from '@/components/carrier/VehicleStatusBadge';
import { TeamFieldValue } from '@/components/teams/TeamFieldValue';
import { PlannerHistoryTimeline } from '@/components/transfers/PlannerHistoryTimeline';
import { PlannerTransferRequestDialog } from '@/components/transfers/PlannerTransferRequestDialog';
import { TransferStatusBadge } from '@/components/transfers/TransferStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  dateValue,
  listValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';
import { downloadVehicleAttachment } from '@/lib/api/vehicles';
import { formatDateTime, formatEur } from '@/lib/format/numbers';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCan } from '@/lib/hooks/useCan';
import { useOpenBlobInTab } from '@/lib/hooks/useOpenBlobInTab';
import { useVehiclePlannerHistory } from '@/lib/hooks/usePlannerTransfers';
import { pendingTransferOf } from '@/lib/transfers/plannerTimeline';
import { isHistoryForbidden } from '@/lib/transfers/transferErrors';
import { canTransferFromDetail, personName } from '@/lib/transfers/transferUi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens VehicleSheet.
   *  Omit it for read-only consumers: the «Edytuj» button is then not
   *  rendered (§6.6). */
  onEdit?: () => void;
  /** Set when a carrier views their OWN fleet — they don't need to be told who
   *  the carrier is. Drops the «Przewoźnik» people row and the carrier-name
   *  subtitle; opiekun + planner + dispatchTeam stay visible. */
  hideCarrier?: boolean;
}

export function VehicleDetailModal({
  open,
  onOpenChange,
  vehicle,
  onEdit,
  hideCarrier = false,
}: Props) {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // Popup-blocker-safe "open in new tab" flow, shared with future entities.
  // The toast messages are localized here and passed into the generic hook.
  const popupBlocked = t('attachmentPopupBlocked');
  const loadFailed = t('attachmentOpenError');
  const blobMessages = useMemo(
    () => ({ popupBlocked, loadFailed }),
    [popupBlocked, loadFailed],
  );
  const { open: openAttachment, isPending: isAttachmentPending } =
    useOpenBlobInTab(toast.error, blobMessages);

  // ── Planner history (docs/14 §17.6) — own loading, independent of the
  //    modal. Never requested for a carrier viewing its own fleet. ─────────
  const tTransfers = useTranslations('transfers');
  const { user } = useAuth();
  // `vehicles.planner_history.read` — admin, opiekun, planista (docs/29 U11);
  // false while `/auth/me` loads.
  const canReadHistory = useCan('vehicles.planner_history.read');
  const historyEnabled = open && !hideCarrier && canReadHistory;
  const historyQ = useVehiclePlannerHistory(vehicle?.id ?? null, {
    enabled: historyEnabled,
  });
  const historyForbidden = historyQ.isError && isHistoryForbidden(historyQ.error);
  const pending = pendingTransferOf(historyQ.data);
  const [requestOpen, setRequestOpen] = useState(false);

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!vehicle) return null;

  const f = (key: string) => t(`fields.${key}`);
  const yes = tCommon('yes');
  const no = tCommon('no');
  const bool = (v: boolean | null | undefined) => boolValue(v, yes, no);

  // ── Header badge row — the delegation-driven lifecycle status (§6.3.6),
  //    replacing the retired active/inactive flag (`active=false` surfaces as
  //    «Wyłączona»). No onboarding chips. ──
  const badges: ReactNode = (
    <VehicleStatusBadge
      status={vehicle.lifecycleStatus}
      daysSinceReturn={vehicle.daysSinceReturn}
    />
  );

  // ── Subtitle — carrier name (or login). Dropped when `hideCarrier` (a
  //    carrier viewing its own fleet already knows who it is). ───────────
  const subtitle = hideCarrier
    ? undefined
    : vehicle.carrier?.name || vehicle.carrier?.login || undefined;

  /** €/km rate — `formatEur` already renders its own em-dash for null. */
  const rateValue = (v: number | null | undefined): ReactNode => (
    <span className="tabular-nums">{formatEur(v)}</span>
  );

  // ── «Przypisanie» (people) rows — carrier · opiekun · planner ·
  //    dispatchTeam. The carrier row is omitted when `hideCarrier`; opiekun /
  //    planner / dispatchTeam are always shown. Built as a filtered array so we
  //    don't duplicate the whole `sections` definition. ───────────────────
  const peopleRows: EntityDetailSection['rows'] = [
    hideCarrier
      ? null
      : {
          label: f('carrier'),
          value: textValue(vehicle.carrier?.name ?? vehicle.carrier?.login),
        },
    {
      label: f('opiekun'),
      value: textValue(vehicle.opiekun?.name ?? vehicle.opiekun?.login),
    },
    {
      label: f('planner'),
      // §17.6.3 — a pending request is visible here without scrolling down to
      // the journal.
      value: pending ? (
        <span className="flex flex-wrap items-center gap-2">
          {textValue(vehicle.planner?.name ?? vehicle.planner?.login)}
          <TransferStatusBadge
            status="pending"
            title={tTransfers('form.pendingTitle', {
              to: personName(pending.toPlanner),
            })}
          />
        </span>
      ) : (
        textValue(vehicle.planner?.name ?? vehicle.planner?.login)
      ),
    },
    {
      label: f('dispatchTeam'),
      value: (
        <TeamFieldValue
          team={vehicle.dispatchTeam}
          label={f('dispatchTeam')}
        />
      ),
      fullWidth: true,
    },
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  // ── 5 + 1 + 1 sections — mirrors the VehicleSheet FormSection order ──
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.identification'),
      icon: Truck,
      rows: [
        { label: f('plateNumber'), value: monoValue(vehicle.plateNumber) },
        // «Numer boczny» — the internal MAGTRANS designation. Dropped for the
        // carrier-self viewer (`hideCarrier`): a carrier must never see the
        // internal side-number (§6.15 carrier-self hide, same rule as the
        // §12.3.2 status rows / §12.7 episode history / CarrierFleetPanel).
        hideCarrier
          ? null
          : { label: f('sideNumber'), value: textValue(vehicle.sideNumber) },
        // `type` (MEGA/STD/COIL) and `euro` (V/VI) are raw enum codes — the
        // form/table render them verbatim, so do the same here.
        { label: f('type'), value: textValue(vehicle.type) },
        { label: f('euro'), value: textValue(vehicle.euro) },
        { label: f('certificateL'), value: bool(vehicle.certificateL) },
      ].filter((row): row is NonNullable<typeof row> => row !== null),
    },
    {
      title: t('sections.people'),
      icon: UserCog,
      // The «Zespół» team-composition row needs full width (avatars + chips) —
      // span the whole section so the <TeamMembers> chips row isn't squeezed
      // into the value column (§6.4.2, §7.9.6).
      span: 'full',
      rows: peopleRows,
    },
    {
      title: t('sections.equipment'),
      icon: Package,
      rows: [
        // The `gps` boolean is gone — every vehicle is tracked. Show only the
        // tracker device id (`gpsMobilePhone`), nullable since 2026-07.
        { label: f('gpsMobilePhone'), value: textValue(vehicle.gpsMobilePhone) },
        {
          label: f('fuelCard'),
          // Live fuel-card status badge (§13.2.3) alongside the bool.
          value: (
            <span className="flex flex-wrap items-center gap-2">
              {bool(vehicle.fuelCard)}
              {vehicle.fuelCard &&
                (vehicle.fuelCardBlocked ? (
                  <Badge variant="danger">{t('fuelCardStatus.blocked')}</Badge>
                ) : (
                  <Badge variant="success">{t('fuelCardStatus.active')}</Badge>
                ))}
            </span>
          ),
        },
        {
          label: f('agreement'),
          // Amber «Brak skanu porozumienia» soft warning (§13.2.3), non-blocking.
          value: (
            <span className="flex flex-wrap items-center gap-2">
              {bool(vehicle.agreement)}
              {vehicle.agreementScanMissing && (
                <Badge variant="warning">{t('agreementScanMissing')}</Badge>
              )}
            </span>
          ),
        },
      ],
    },
    {
      title: t('sections.rates'),
      icon: Banknote,
      rows: [
        { label: f('rateDe'), value: rateValue(vehicle.rateDe) },
        { label: f('rateUe'), value: rateValue(vehicle.rateUe) },
        { label: f('rateExport'), value: rateValue(vehicle.rateExport) },
        { label: f('rateImport'), value: rateValue(vehicle.rateImport) },
      ],
    },
    {
      title: t('sections.permissions'),
      icon: ShieldCheck,
      // 8 rows — too tall to pair with a sibling in the 2-col grid (§6.15).
      span: 'full',
      rows: [
        { label: f('adr'), value: bool(vehicle.adr) },
        { label: f('wasteAllowed'), value: bool(vehicle.wasteAllowed) },
        { label: f('wasteCountries'), value: listValue(vehicle.wasteCountries) },
        { label: f('cabotageDe'), value: bool(vehicle.cabotageDe) },
        { label: f('cabotageFr'), value: bool(vehicle.cabotageFr) },
        { label: f('gb'), value: bool(vehicle.gb) },
        { label: f('it'), value: bool(vehicle.it) },
        { label: f('fr'), value: bool(vehicle.fr) },
      ],
    },
    {
      title: t('sections.other'),
      icon: Info,
      rows: [
        { label: f('lastDroveAt'), value: dateValue(vehicle.lastDroveAt) },
        { label: f('notes'), value: textValue(vehicle.notes) },
      ],
    },
  ];

  // ── Attachments — each row shows the localized category label and an
  //    «Otwórz» action that opens the document inline in a new tab. Section
  //    is rendered only when files exist. ────────────────────────────────
  if (vehicle.attachments && vehicle.attachments.length > 0) {
    sections.push({
      title: t('sections.attachments'),
      icon: FileText,
      // Attachment rows carry tall «Otwórz» buttons that need horizontal
      // room — span the full grid row (§6.15).
      span: 'full',
      rows: vehicle.attachments.map((att) => ({
        label: t(`attachmentCategory.${att.category}`),
        value: (
          <AttachmentRowValue
            vehicleId={vehicle.id}
            attachment={att}
            openLabel={t('attachmentOpen')}
            pending={isAttachmentPending(att.id)}
            onOpen={openAttachment}
          />
        ),
      })),
    });
  }

  // ── «Historia planistów» — the LAST section (§17.6.3). Omitted for the
  //    carrier and, silently, for a 403 (viewer outside U11). ─────────────
  if (historyEnabled && !historyForbidden) {
    sections.push({
      title: tTransfers('history.title'),
      icon: History,
      span: 'full',
      rows: [
        {
          label: tTransfers('history.title'),
          value: (
            <PlannerHistoryTimeline
              plate={vehicle.plateNumber}
              history={historyQ.data}
              isLoading={historyQ.isLoading}
              error={historyQ.error}
              onRetry={() => void historyQ.refetch()}
              isRetrying={historyQ.isFetching}
            />
          ),
          fullWidth: true,
        },
      ],
    });
  }

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(vehicle.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(vehicle.updatedAt)}
    </>
  );

  // ── «Przekaż ciągnik» — only the CURRENT planista (D3), enabled vehicle,
  //    no pending request (known only once the history answered). ────────
  // scope: role + id pick the ONE entry point per role (planista here, the
  // edit form for opiekun/admin — D9); see `canTransferFromDetail`.
  const showTransfer = canTransferFromDetail({
    viewerRole: user?.role,
    viewerId: user?.id,
    vehicle: { plannerId: vehicle.plannerId, active: vehicle.active },
    historyReady: historyQ.isSuccess,
    hasPending: pending !== null,
  });
  const extraActions = showTransfer ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-[44px] gap-1.5 sm:min-h-0"
      onClick={() => setRequestOpen(true)}
    >
      <ArrowLeftRight size={14} aria-hidden="true" />
      {tTransfers('request.buttonPlanista')}
    </Button>
  ) : undefined;

  return (
    <>
      <EntityDetailModal
        open={open}
        onOpenChange={onOpenChange}
        title={vehicle.plateNumber}
        subtitle={subtitle}
        badges={badges}
        sections={sections}
        meta={meta}
        onEdit={onEdit}
        extraActions={extraActions}
      />
      {showTransfer || requestOpen ? (
        <PlannerTransferRequestDialog
          open={requestOpen && open}
          onOpenChange={setRequestOpen}
          vehicle={{
            id: vehicle.id,
            plateNumber: vehicle.plateNumber,
            carrierName: vehicle.carrier ? personName(vehicle.carrier) : null,
            plannerName: personName(vehicle.planner),
          }}
        />
      ) : null}
    </>
  );
}

interface AttachmentRowValueProps {
  vehicleId: string;
  attachment: VehicleAttachmentDto;
  /** Localized «Otwórz» / «Open» action label. */
  openLabel: string;
  /** `true` while this row's file is being fetched. */
  pending: boolean;
  /** The `open` callback from `useOpenBlobInTab`. */
  onOpen: (args: {
    key: string;
    fetcher: () => Promise<Blob>;
    mimeType?: string;
  }) => Promise<void>;
}

/**
 * The `value` cell of an attachment row: a ghost button that opens the file
 * inline in a new tab. Shows the file name + an external-link icon, swapped
 * for a spinner while that specific download is in flight.
 */
function AttachmentRowValue({
  vehicleId,
  attachment,
  openLabel,
  pending,
  onOpen,
}: AttachmentRowValueProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${openLabel} — ${attachment.fileName}`}
      className="-mx-2 max-w-full justify-start font-normal"
      onClick={() =>
        void onOpen({
          key: attachment.id,
          fetcher: () =>
            downloadVehicleAttachment(vehicleId, attachment.id),
          mimeType: attachment.mimeType,
        })
      }
    >
      {pending ? (
        <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden />
      ) : (
        <ExternalLink size={14} className="shrink-0" aria-hidden />
      )}
      <span className="truncate">{attachment.fileName}</span>
    </Button>
  );
}
