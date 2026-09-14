'use client';

// "Dokumenty" tab on the opieka carrier drill-down (docs/14-design-system.md
// §Phase 5-rework, §5R.0–5R.10). It is a fleet-wide document-TYPE catalog: five
// fixed groups (company / vehicles / adrVehicles / trailers / drivers) of
// <DocumentTypeCard>s; clicking a card opens a right-side <Sheet> with a file
// <DataTable> (owning-entity label · fileName · size · createdAt · download).
// Company docs are managed IN the Sheet footer (upload/delete — the category is
// implicit from which card was clicked, so the old category <Select> is gone);
// fleet docs (vehicle/trailer/driver) are download-only with a "manage
// elsewhere" pointer. The vehicle-ADR card is display-only (no files; adrClasses
// as muted Badge chips). No warnings anywhere — every zero-file state is neutral.
//
// DELIBERATE DEVIATION FROM §5R: the spec says "no new API — render from the
// parent page's already-loaded vehicles/drivers/trailers payloads". We instead
// consume a NEW aggregate endpoint `GET /carriers/:id/documents/overview` via
// `useCarrierDocumentsOverview`. Rationale: soft-delete filtering stays
// centralised server-side, and this tab is no longer coupled to the shape of the
// other tabs' list payloads. Layout & interaction remain 1:1 with the spec; only
// the data sourcing differs.
//
// Download: every endpoint is authenticated (not a public URL), so we fetch the
// bytes through the auth/refresh-aware client and trigger a save via a throwaway
// object-URL anchor. Delete (company only): confirmed in a <Dialog> then DELETEd.

import {
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  CarrierAttachmentCategory,
  CarrierDocumentsOverviewDto,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  FileUpload,
  type FileUploadItem,
  type FileUploadLabels,
} from '@/components/ui/FileUpload';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { downloadCarrierAttachment } from '@/lib/api/carriers';
import { downloadDriverAttachment } from '@/lib/api/drivers';
import { downloadTrailerAttachment } from '@/lib/api/trailers';
import { downloadVehicleAttachment } from '@/lib/api/vehicles';
import { formatDateTime } from '@/lib/format/numbers';
import {
  useCarrierDocumentsOverview,
  useDeleteCarrierAttachment,
  useUploadCarrierAttachment,
} from '@/lib/hooks/useCarriers';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

// ─── Model ────────────────────────────────────────────────
//
// A "document type" is one catalog tile → one Sheet. We flatten the overview DTO
// into a stable set of type descriptors, grouped, so both the card grid and the
// Sheet render from the same shape.

/** Owning-entity kind — drives the entity column header + download route. */
type EntityKind = 'company' | 'vehicle' | 'trailer' | 'driver';

/** One concrete file inside a type. `download` is entity-scoped (right route). */
interface FileRow {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  /** Owning-entity label shown in the `entity` column (plate / name). */
  entityLabel: string;
  /** Fetches this file's bytes through the correct authenticated route. */
  download: () => Promise<Blob>;
}

/** A catalog type — one card, one Sheet. */
interface DocType {
  /** Stable key (group + category). */
  key: string;
  /** i18n type label (title). */
  title: string;
  entityKind: EntityKind;
  files: FileRow[];
  /** Distinct owning entities across `files` (for the "· N pojazdy" count). */
  entityCount: number;
  /** Company types are managed in-Sheet; the category drives upload/delete. */
  managed: boolean;
  /** Present only for company (managed) types. */
  companyCategory?: CarrierAttachmentCategory;
}

const COMPANY_CATEGORIES: CarrierAttachmentCategory[] = [
  'insurance',
  'license',
  'kreptd',
  'other',
];

const VEHICLE_CATEGORIES = [
  'gps',
  'agreement',
  'cabotage_de_insurance',
] as const;

interface Props {
  carrierId: string;
}

export function CarrierDocumentsTab({ carrierId }: Props) {
  const t = useTranslations('opieka.documents');
  const tCommon = useTranslations('common');
  const tFile = useTranslations('fileUpload');

  const overviewQ = useCarrierDocumentsOverview(carrierId);
  const data = overviewQ.data;
  const fileLabels = useFileLabels(tFile);

  // Which type-card's Sheet is open. Null = closed.
  const [openTypeKey, setOpenTypeKey] = useState<string | null>(null);

  // ── Build the five groups from the overview DTO ─────────
  const groups = useMemo(
    () => (data ? buildGroups(data, carrierId, t) : null),
    [data, carrierId, t],
  );

  const allTypes = useMemo(
    () => (groups ? groups.flatMap((g) => g.types) : []),
    [groups],
  );
  const openType = useMemo(
    () => allTypes.find((ty) => ty.key === openTypeKey) ?? null,
    [allTypes, openTypeKey],
  );

  // A failed overview must not spin the skeleton forever.
  if (!groups && overviewQ.isError) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-card">
        <ErrorState {...queryErrorProps(overviewQ)} />
      </div>
    );
  }

  if (overviewQ.isLoading || !groups) {
    return <DocumentsSkeleton t={t} />;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.id} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t(`group.${group.id}`)}
          </h3>

          {group.id === 'adrVehicles' ? (
            <AdrDisplayCard vehicleAdr={data?.vehicleAdr ?? []} t={t} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.types.map((ty) => (
                <DocumentTypeCard
                  key={ty.key}
                  type={ty}
                  countLine={countLine(ty, t)}
                  openAria={t('sheet.openAria', { type: ty.title })}
                  onOpen={() => setOpenTypeKey(ty.key)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* Detail Sheet — one shell reused for managed + download-only types. */}
      <DocumentTypeSheet
        type={openType}
        carrierId={carrierId}
        open={openType !== null}
        onClose={() => setOpenTypeKey(null)}
        t={t}
        tCommon={tCommon}
        fileLabels={fileLabels}
      />
    </div>
  );
}

// ─── <DocumentTypeCard> — the clickable catalog tile ──────
//
// Composition only (bg-card + border + chevron), reusing the exact hover/focus
// recipe of <OpiekunCarrierCard> so the two card families feel identical.

interface DocumentTypeCardProps {
  type: DocType;
  countLine: string;
  openAria: string;
  onOpen: () => void;
}

function DocumentTypeCard({
  type,
  countLine,
  openAria,
  onOpen,
}: DocumentTypeCardProps) {
  const empty = type.files.length === 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openAria}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left',
        'transition-[background-color,border-color,box-shadow] duration-150',
        'hover:shadow-card hover:border-brand/40 hover:bg-brand-50/30 dark:hover:bg-brand/5',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand/60',
      )}
    >
      <FileText size={20} className="flex-none text-text-sub" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-text">{type.title}</p>
        <p className="mt-0.5 truncate text-xs text-text-sub">{countLine}</p>
      </div>
      {!empty && (
        <Badge variant="muted" className="flex-none tabular-nums">
          {type.files.length}
        </Badge>
      )}
      <ChevronRight
        size={16}
        className="ml-auto flex-none text-text-sub"
        aria-hidden
      />
    </button>
  );
}

// ─── «ADR pojazdów» — fileless display card (§5R.4) ───────
//
// Non-clickable: ADR is a cargo-permit flag on the vehicle, not a document.
// adrClasses render as muted Badge chips — never `warning` (no warnings in this
// tab; overrides the §6.3.1 fleet-table ADR convention for this informational
// surface only).

interface AdrDisplayCardProps {
  vehicleAdr: CarrierDocumentsOverviewDto['vehicleAdr'];
  t: ReturnType<typeof useTranslations>;
}

function AdrDisplayCard({ vehicleAdr, t }: AdrDisplayCardProps) {
  const count = vehicleAdr.length;
  return (
    <div className="cursor-default rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <FileText size={20} className="flex-none text-text-sub" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text">
            {t('group.adrVehicles')}
          </p>
          <p className="mt-0.5 text-xs text-text-sub">
            {count === 0
              ? t('count.noAdrVehicles')
              : t('count.adrVehiclesCount', { count })}
          </p>
        </div>
      </div>

      {count > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {vehicleAdr.map((v) => (
            <li
              key={v.vehicleId}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span className="font-mono text-sm text-text">{v.plate}</span>
              <span className="flex flex-wrap gap-1">
                {v.adrClasses.map((cls) => (
                  <Badge key={cls} variant="muted">
                    {cls}
                  </Badge>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── <DocumentTypeSheet> — the detail surface (§5R.3) ─────

interface DocumentTypeSheetProps {
  type: DocType | null;
  carrierId: string;
  open: boolean;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  fileLabels: FileUploadLabels;
}

function DocumentTypeSheet({
  type,
  carrierId,
  open,
  onClose,
  t,
  tCommon,
  fileLabels,
}: DocumentTypeSheetProps) {
  // ── Download — fetch authenticated bytes, save via object-URL anchor ──
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const handleDownload = useCallback(
    async (row: FileRow) => {
      setDownloadingId(row.id);
      try {
        const blob = await row.download();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast.error(t('downloadError'));
      } finally {
        setDownloadingId(null);
      }
    },
    [t],
  );

  // ── Company-doc management (managed types only) ─────────
  const [picked, setPicked] = useState<FileUploadItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<FileRow | null>(null);

  const uploadM = useUploadCarrierAttachment({
    onSuccess: () => {
      toast.success(t('uploadedToast'));
      setPicked([]);
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const deleteM = useDeleteCarrierAttachment({
    onSuccess: () => {
      toast.success(t('deletedToast'));
      setDeleteTarget(null);
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const pickedFile = useMemo(() => {
    const item = picked.find(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    );
    return item?.file ?? null;
  }, [picked]);

  const onUpload = () => {
    if (!pickedFile || !type?.companyCategory) return;
    uploadM.mutate({
      carrierId,
      category: type.companyCategory,
      file: pickedFile,
    });
  };

  // Reset the picker whenever the open type changes so a staged file never
  // leaks into another category's Sheet.
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setPicked([]);
      setDeleteTarget(null);
      onClose();
    }
  };

  const entityHeader = useMemo(() => {
    switch (type?.entityKind) {
      case 'vehicle':
        return t('columns.entityVehicle');
      case 'trailer':
        return t('columns.entityTrailer');
      case 'driver':
        return t('columns.entityDriver');
      default:
        return '';
    }
  }, [type?.entityKind, t]);

  const columns = useMemo<DataTableColumn<FileRow>[]>(() => {
    const cols: DataTableColumn<FileRow>[] = [];
    // Owning-entity column — omitted entirely for company docs.
    if (type && type.entityKind !== 'company') {
      cols.push({
        id: 'entity',
        header: entityHeader,
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span
            className={cn(
              type.entityKind === 'driver'
                ? 'font-semibold'
                : 'font-mono font-semibold',
            )}
            title={row.entityLabel}
          >
            {row.entityLabel}
          </span>
        ),
      });
    }
    cols.push(
      {
        id: 'fileName',
        header: t('columns.fileName'),
        width: type && type.entityKind === 'company' ? 'flex' : 'auto',
        truncate: 'ellipsis',
        cell: (row) => (
          <span className="font-medium" title={row.fileName}>
            {row.fileName}
          </span>
        ),
      },
      {
        id: 'size',
        header: t('columns.size'),
        width: 'tight',
        align: 'right',
        cell: (row) => (
          <span className="tabular-nums text-text-sub">
            {formatBytes(row.size)}
          </span>
        ),
      },
      {
        id: 'createdAt',
        header: t('columns.uploadedAt'),
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums text-text-sub">
            {formatDateTime(row.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        width: 'tight',
        align: 'right',
        cell: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={downloadingId === row.id}
              aria-busy={downloadingId === row.id}
              aria-label={`${t('download')} — ${row.fileName}`}
              onClick={() => void handleDownload(row)}
            >
              {downloadingId === row.id ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Download size={14} aria-hidden />
              )}
              <span className="hidden lg:inline">{t('download')}</span>
            </Button>
            {type?.managed && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`${tCommon('delete')} — ${row.fileName}`}
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 size={14} aria-hidden />
                <span className="hidden lg:inline">{tCommon('delete')}</span>
              </Button>
            )}
          </div>
        ),
      },
    );
    return cols;
  }, [type, entityHeader, t, tCommon, downloadingId, handleDownload]);

  // Manage-elsewhere pointer for download-only types.
  const managePointer =
    type?.entityKind === 'vehicle'
      ? t('sheet.manageInVehicle')
      : type?.entityKind === 'trailer'
        ? t('sheet.manageInTrailer')
        : type?.entityKind === 'driver'
          ? t('sheet.manageInDriver')
          : null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent size="wide" className="w-full">
          <SheetHeader>
            <SheetTitle>{type?.title ?? ''}</SheetTitle>
            {type && (
              <SheetDescription>
                {`${t(`group.${entityKindToGroup(type.entityKind)}`)} · ${countLine(type, t)}`}
              </SheetDescription>
            )}
          </SheetHeader>

          <SheetBody>
            <DataTable
              rows={type?.files ?? []}
              columns={columns}
              rowKey={(r) => r.id}
              skeletonRows={4}
              empty={
                <EmptyState
                  icon={FileText}
                  title={t('empty.title')}
                  message={t('empty.message')}
                />
              }
            />
          </SheetBody>

          {type?.managed ? (
            <SheetFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-xs text-text-sub">{t('sheet.uploadHint')}</p>
                <FileUpload
                  value={picked}
                  onChange={setPicked}
                  labels={fileLabels}
                  multiple={false}
                  variant="compact"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="flex-none"
                disabled={!pickedFile || uploadM.isPending}
                onClick={onUpload}
              >
                {uploadM.isPending ? tCommon('saving') : t('uploadButton')}
              </Button>
            </SheetFooter>
          ) : (
            managePointer && (
              <SheetFooter className="justify-start">
                <p className="text-xs text-text-sub">{managePointer}</p>
              </SheetFooter>
            )
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation (company types only). */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteBody', { fileName: deleteTarget?.fileName ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteM.isPending}
            >
              {tCommon('cancel')}
            </Button>
            {/* Brand-red default IS the danger affordance here (§ConfirmDelete). */}
            <Button
              type="button"
              size="sm"
              disabled={deleteM.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteM.mutate({ carrierId, attachmentId: deleteTarget.id });
              }}
            >
              {deleteM.isPending ? tCommon('saving') : tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Loading skeleton (§5R.5) ─────────────────────────────

function DocumentsSkeleton({
  t,
}: {
  t: ReturnType<typeof useTranslations>;
}) {
  const groups: { id: string; cards: number }[] = [
    { id: 'company', cards: 4 },
    { id: 'vehicles', cards: 3 },
    { id: 'trailers', cards: 1 },
    { id: 'drivers', cards: 1 },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.id} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t(`group.${g.id}`)}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: g.cards }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
              >
                <Skeleton className="h-5 w-5 flex-none rounded" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Derivation helpers ───────────────────────────────────

type GroupId =
  | 'company'
  | 'vehicles'
  | 'adrVehicles'
  | 'trailers'
  | 'drivers';

interface Group {
  id: GroupId;
  types: DocType[];
}

function entityKindToGroup(kind: EntityKind): GroupId {
  switch (kind) {
    case 'vehicle':
      return 'vehicles';
    case 'trailer':
      return 'trailers';
    case 'driver':
      return 'drivers';
    default:
      return 'company';
  }
}

/** Flattens the overview DTO into the five fixed, ordered groups. */
function buildGroups(
  data: CarrierDocumentsOverviewDto,
  carrierId: string,
  t: ReturnType<typeof useTranslations>,
): Group[] {
  // Company — one type per category (always all four, even when empty).
  const companyTypes: DocType[] = COMPANY_CATEGORIES.map((cat) => {
    const files: FileRow[] = data.carrierDocs
      .filter((d) => d.category === cat)
      .map((d) => ({
        id: d.id,
        fileName: d.fileName,
        size: d.size,
        createdAt: d.createdAt,
        entityLabel: '',
        download: () => downloadCarrierAttachment(carrierId, d.id),
      }));
    return {
      key: `company:${cat}`,
      title: t(`category.${cat}`),
      entityKind: 'company',
      files,
      entityCount: 0,
      managed: true,
      companyCategory: cat,
    };
  });

  // Vehicles — one type per category (always all three, even when empty).
  const vehicleTypes: DocType[] = VEHICLE_CATEGORIES.map((cat) => {
    const entries = data.vehicleDocs[cat];
    const files: FileRow[] = entries.map((e) => ({
      id: e.attachmentId,
      fileName: e.fileName,
      size: e.size,
      createdAt: e.createdAt,
      entityLabel: e.vehicle.registration,
      download: () =>
        downloadVehicleAttachment(e.vehicle.id, e.attachmentId),
    }));
    return {
      key: `vehicle:${cat}`,
      title: t(`type.${cat}`),
      entityKind: 'vehicle',
      files,
      entityCount: new Set(entries.map((e) => e.vehicle.id)).size,
      managed: false,
    };
  });

  // Trailers — single «Certyfikat XL» type.
  const trailerFiles: FileRow[] = data.trailerDocs.map((e) => ({
    id: e.attachmentId,
    fileName: e.fileName,
    size: e.size,
    createdAt: e.createdAt,
    entityLabel: e.registration,
    download: () => downloadTrailerAttachment(e.trailerId, e.attachmentId),
  }));
  const trailerTypes: DocType[] = [
    {
      key: 'trailer:cert_xl',
      title: t('type.cert_xl'),
      entityKind: 'trailer',
      files: trailerFiles,
      entityCount: new Set(data.trailerDocs.map((e) => e.trailerId)).size,
      managed: false,
    },
  ];

  // Drivers — single «Świadectwo ADR kierowcy» type.
  const driverFiles: FileRow[] = data.driverDocs.map((e) => ({
    id: e.attachmentId,
    fileName: e.fileName,
    size: e.size,
    createdAt: e.createdAt,
    entityLabel: e.fullName,
    download: () => downloadDriverAttachment(e.driverId, e.attachmentId),
  }));
  const driverTypes: DocType[] = [
    {
      key: 'driver:adr',
      title: t('type.driverAdr'),
      entityKind: 'driver',
      files: driverFiles,
      entityCount: new Set(data.driverDocs.map((e) => e.driverId)).size,
      managed: false,
    },
  ];

  return [
    { id: 'company', types: companyTypes },
    { id: 'vehicles', types: vehicleTypes },
    { id: 'adrVehicles', types: [] },
    { id: 'trailers', types: trailerTypes },
    { id: 'drivers', types: driverTypes },
  ];
}

/** Count line under a card title — «3 pliki · 2 pojazdy», or neutral «Brak plików». */
function countLine(
  type: DocType,
  t: ReturnType<typeof useTranslations>,
): string {
  if (type.files.length === 0) return t('count.noFiles');
  const files = t('count.files', { count: type.files.length });
  if (type.entityKind === 'company') return files;
  const entityKey =
    type.entityKind === 'vehicle'
      ? 'vehicles'
      : type.entityKind === 'trailer'
        ? 'trailers'
        : 'drivers';
  const entities = t(`count.${entityKey}`, { count: type.entityCount });
  return t('count.summary', { files, entities });
}

/** Human-readable byte size. Mirrors the FileUpload primitive's formatter. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** Memoised FileUpload label bundle for the company-type upload footer. */
function useFileLabels(
  tFile: ReturnType<typeof useTranslations>,
): FileUploadLabels {
  return useMemo<FileUploadLabels>(
    () => ({
      prompt: tFile('prompt'),
      promptCompact: tFile('promptCompact'),
      constraints: tFile('constraints'),
      errTooLarge: tFile('errTooLarge'),
      errWrongType: tFile('errWrongType'),
      errUploadFailed: tFile('errUploadFailed'),
      retry: tFile('retry'),
      dropzoneAria: tFile('dropzoneAria'),
      removeAria: (name: string) => tFile('removeAria', { name }),
      change: tFile('change'),
    }),
    [tFile],
  );
}
