'use client';

// Phase 6 — DriverDetailModal. A thin, entity-specific wrapper that maps a
// DriverDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9, §6.16). The generic shell is NOT re-implemented here.
//
// DriverSheet has a FLAT layout (no FormSections), so there is no Sheet order
// to mirror 1:1. Instead the fields are grouped into three clean logical
// sections — personal/contact · license · assignment — keyed off the
// `drivers.sections.*` i18n keys. A trailing «Załączniki» section lists the
// ADR certificate attachment(s) when present, mirroring VehicleDetailModal:
// each row carries an «Otwórz» action that opens the document inline.
//
// Formatting reuses the shared helpers in components/ui/entity-detail-values.tsx
// and lib/format/numbers.ts — no duplicated Intl wrappers.

import {
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  User,
  UserCog,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import type { DriverAttachmentDto, DriverDto } from '@magguarantee/shared';
import { toast } from 'sonner';

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
import { downloadDriverAttachment } from '@/lib/api/drivers';
import { formatDateTime } from '@/lib/format/numbers';
import { useOpenBlobInTab } from '@/lib/hooks/useOpenBlobInTab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens DriverSheet.
   *  Omit it for read-only consumers: the «Edytuj» button is then not
   *  rendered (§6.6). */
  onEdit?: () => void;
}

export function DriverDetailModal({
  open,
  onOpenChange,
  driver,
  onEdit,
}: Props) {
  const t = useTranslations('drivers');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // Popup-blocker-safe "open in new tab" flow, shared with vehicles. The toast
  // messages are localized here (reusing the vehicle attachment strings) and
  // passed into the generic hook.
  const tVehicles = useTranslations('vehicles');
  const popupBlocked = tVehicles('attachmentPopupBlocked');
  const loadFailed = tVehicles('attachmentOpenError');
  const blobMessages = useMemo(
    () => ({ popupBlocked, loadFailed }),
    [popupBlocked, loadFailed],
  );
  const { open: openAttachment, isPending: isAttachmentPending } =
    useOpenBlobInTab(toast.error, blobMessages);

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!driver) return null;

  const f = (key: string) => t(`fields.${key}`);
  const yes = tCommon('yes');
  const no = tCommon('no');

  // ── Header badge row — only the status badge (no onboarding chips) ──
  const badges: ReactNode = driver.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  // ── 3 logical sections — DriverSheet has no FormSections to mirror ───
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.personal'),
      icon: User,
      rows: [
        { label: f('firstName'), value: textValue(driver.firstName) },
        { label: f('lastName'), value: textValue(driver.lastName) },
        { label: f('phone'), value: textValue(driver.phone) },
        { label: f('phone2'), value: textValue(driver.phone2) },
        { label: f('email'), value: textValue(driver.email) },
        {
          label: f('nationality'),
          value: textValue(t(`nationalityOptions.${driver.nationality}`)),
        },
        {
          label: f('languages'),
          value: listValue(
            driver.languages.map((l) => t(`languageOptions.${l}`)),
          ),
        },
      ],
    },
    {
      title: t('sections.license'),
      icon: CreditCard,
      rows: [
        {
          label: f('idDocumentNumber'),
          value: monoValue(driver.idDocumentNumber),
        },
        { label: f('licenseExpiry'), value: dateValue(driver.licenseExpiry) },
        { label: f('adr'), value: boolValue(driver.adr, yes, no) },
        ...(driver.adr
          ? [{ label: f('adrClasses'), value: listValue(driver.adrClasses) }]
          : []),
      ],
    },
    {
      title: t('sections.assignment'),
      icon: UserCog,
      rows: [
        {
          label: f('carrier'),
          value: textValue(driver.carrier?.name ?? driver.carrier?.login),
        },
        { label: f('notes'), value: textValue(driver.notes) },
      ],
    },
  ];

  // ── Attachments — ADR certificate row(s) with an «Otwórz» action that
  //    opens the document inline in a new tab. Rendered only when files
  //    exist. ──────────────────────────────────────────────────────────
  if (driver.attachments && driver.attachments.length > 0) {
    sections.push({
      title: t('sections.attachments'),
      icon: FileText,
      span: 'full',
      rows: driver.attachments.map((att) => ({
        label: t(`attachmentCategory.${att.category}`),
        value: (
          <AttachmentRowValue
            driverId={driver.id}
            attachment={att}
            openLabel={t('attachmentOpen')}
            pending={isAttachmentPending(att.id)}
            onOpen={openAttachment}
          />
        ),
      })),
    });
  }

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(driver.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(driver.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${driver.firstName} ${driver.lastName}`.trim()}
      subtitle={
        <span className="font-mono">
          {driver.idDocumentNumber || driver.loginSlug}
        </span>
      }
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}

interface AttachmentRowValueProps {
  driverId: string;
  attachment: DriverAttachmentDto;
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
  driverId,
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
          fetcher: () => downloadDriverAttachment(driverId, attachment.id),
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
