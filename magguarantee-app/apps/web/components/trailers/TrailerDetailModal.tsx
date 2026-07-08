'use client';

// Phase 6 — TrailerDetailModal. A thin, entity-specific wrapper that maps a
// TrailerDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9, §6.17). The generic shell is NOT re-implemented here.
//
// The section order mirrors TrailerFormDialog's sections so the read-only view
// and the edit dialog feel like the same object: Identyfikacja · Wymiary · Dach
// · Wyposażenie · Załączniki. Dimension/capacity units come baked into the field
// labels themselves (`innerLength` → "Długość wewn. (m)"), exactly as the form
// renders them — so the values are bare numbers.
//
// Formatting reuses the shared helpers in components/ui/entity-detail-values.tsx
// and lib/format/numbers.ts — no duplicated Intl wrappers.

import {
  Container,
  ExternalLink,
  FileText,
  Loader2,
  Package,
  PanelTop,
  Ruler,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import type { TrailerAttachmentDto, TrailerDto } from '@magguarantee/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  emptyValue,
  textValue,
} from '@/components/ui/entity-detail-values';
import { downloadTrailerAttachment } from '@/lib/api/trailers';
import { formatDateTime } from '@/lib/format/numbers';
import { useOpenBlobInTab } from '@/lib/hooks/useOpenBlobInTab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trailer: TrailerDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens
   *  TrailerFormDialog. Omit for read-only consumers (§6.6). */
  onEdit?: () => void;
}

export function TrailerDetailModal({
  open,
  onOpenChange,
  trailer,
  onEdit,
}: Props) {
  const t = useTranslations('trailers');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // Popup-blocker-safe "open in new tab" flow (reuses the vehicle strings).
  const tVehicles = useTranslations('vehicles');
  const popupBlocked = tVehicles('attachmentPopupBlocked');
  const loadFailed = tVehicles('attachmentOpenError');
  const blobMessages = useMemo(
    () => ({ popupBlocked, loadFailed }),
    [popupBlocked, loadFailed],
  );
  const { open: openAttachment, isPending: isAttachmentPending } =
    useOpenBlobInTab(toast.error, blobMessages);

  if (!trailer) return null;

  const f = (key: string) => t(`fields.${key}`);
  const yes = tCommon('yes');
  const no = tCommon('no');
  const bool = (v: boolean | null | undefined) => boolValue(v, yes, no);

  const boolWithCount = (
    flag: boolean | null | undefined,
    count: number | null | undefined,
  ): ReactNode => {
    if (flag == null) return emptyValue();
    if (flag === false) return <span>{no}</span>;
    if (typeof count === 'number') {
      return (
        <span>
          {yes} ({count} {tCommon('pcsShort')})
        </span>
      );
    }
    return <span>{yes}</span>;
  };

  const badges: ReactNode = trailer.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  const numValue = (v: number | null | undefined): ReactNode =>
    v != null ? <span className="tabular-nums">{v}</span> : emptyValue();

  const sections: EntityDetailSection[] = [
    {
      title: t('sections.identification'),
      icon: Container,
      rows: [
        {
          label: f('carrier'),
          value: textValue(trailer.carrier?.name ?? trailer.carrier?.login),
        },
        { label: f('plateNumber'), value: textValue(trailer.plateNumber) },
        {
          label: f('trailerType'),
          value: trailer.trailerType
            ? textValue(
                trailer.trailerType.shortCode
                  ? `[${trailer.trailerType.shortCode}] ${trailer.trailerType.name}`
                  : trailer.trailerType.name,
              )
            : emptyValue(),
        },
      ],
    },
    {
      title: t('sections.dimensions'),
      icon: Ruler,
      rows: [
        { label: f('innerLength'), value: numValue(trailer.innerLength) },
        { label: f('innerWidth'), value: numValue(trailer.innerWidth) },
        { label: f('innerHeight'), value: numValue(trailer.innerHeight) },
        { label: f('capacity'), value: numValue(trailer.capacity) },
        {
          label: f('sideClearanceCm'),
          value: numValue(trailer.sideClearanceCm),
        },
      ],
    },
    {
      title: t('sections.roof'),
      icon: PanelTop,
      rows: [
        { label: f('liftingRoof'), value: bool(trailer.liftingRoof) },
        { label: f('slidingRoof'), value: bool(trailer.slidingRoof) },
        { label: f('edscha'), value: bool(trailer.edscha) },
      ],
    },
    {
      title: t('sections.equipment'),
      icon: Package,
      span: 'full',
      rows: [
        {
          label: f('belts'),
          value: boolWithCount(trailer.belts, trailer.beltsCount),
        },
        {
          label: f('mats'),
          value: boolWithCount(trailer.mats, trailer.matsCount),
        },
        {
          label: f('beams'),
          value: boolWithCount(trailer.beams, trailer.beamsCount),
        },
        { label: f('palletBox'), value: bool(trailer.palletBox) },
        { label: f('multilock'), value: bool(trailer.multilock) },
        { label: f('certXl'), value: bool(trailer.certXl) },
        { label: f('notes'), value: textValue(trailer.notes) },
      ],
    },
  ];

  if (trailer.attachments && trailer.attachments.length > 0) {
    sections.push({
      title: t('sections.attachments'),
      icon: FileText,
      span: 'full',
      rows: trailer.attachments.map((att) => ({
        label: t(`attachmentCategory.${att.category}`),
        value: (
          <AttachmentRowValue
            trailerId={trailer.id}
            attachment={att}
            openLabel={t('attachmentOpen')}
            pending={isAttachmentPending(att.id)}
            onOpen={openAttachment}
          />
        ),
      })),
    });
  }

  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(trailer.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(trailer.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={trailer.plateNumber}
      subtitle={trailer.trailerType?.shortCode ?? trailer.trailerType?.name}
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}

interface AttachmentRowValueProps {
  trailerId: string;
  attachment: TrailerAttachmentDto;
  openLabel: string;
  pending: boolean;
  onOpen: (args: {
    key: string;
    fetcher: () => Promise<Blob>;
    mimeType?: string;
  }) => Promise<void>;
}

function AttachmentRowValue({
  trailerId,
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
          fetcher: () => downloadTrailerAttachment(trailerId, attachment.id),
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
