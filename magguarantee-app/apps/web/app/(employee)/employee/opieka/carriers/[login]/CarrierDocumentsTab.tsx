'use client';

// "Dokumenty" tab on the opieka carrier drill-down. Lists the carrier's
// company documents (CarrierAttachment) in a <DataTable> and offers upload /
// download / delete. Unlike vehicle/driver attachments (which ride the entity
// edit Sheet) carrier documents are managed standalone via
// `/carriers/:id/attachments` — see lib/api/carriers.ts.
//
// Download: the endpoint is authenticated (not a public URL), so we fetch the
// bytes through the auth/refresh-aware client and trigger a save via a
// throwaway object-URL anchor. Delete: confirmed in a <Dialog> then DELETEd.

import {
  Download,
  FileText,
  Loader2,
  Trash2,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  CarrierAttachmentCategory,
  CarrierAttachmentDto,
} from '@magguarantee/shared';

import { ApiResponseError } from '@/lib/api/client';
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
import {
  FileUpload,
  type FileUploadItem,
  type FileUploadLabels,
} from '@/components/ui/FileUpload';
import { FormField } from '@/components/forms/Form';
import { Select } from '@/components/ui/Select';
import { downloadCarrierAttachment } from '@/lib/api/carriers';
import { formatDateTime } from '@/lib/format/numbers';
import {
  useCarrierAttachments,
  useDeleteCarrierAttachment,
  useUploadCarrierAttachment,
} from '@/lib/hooks/useCarriers';

const CATEGORIES: CarrierAttachmentCategory[] = [
  'adr',
  'insurance',
  'license',
  'kreptd',
  'other',
];

interface Props {
  carrierId: string;
}

export function CarrierDocumentsTab({ carrierId }: Props) {
  const t = useTranslations('opieka.documents');
  const tCommon = useTranslations('common');
  const tFile = useTranslations('fileUpload');

  const docsQ = useCarrierAttachments(carrierId);

  // The carrier MUST have exactly one ADR document. We derive presence from
  // the loaded list; only trustworthy once the query has settled.
  const docs = docsQ.data ?? [];
  const hasAdr = docs.some((d) => d.category === 'adr');
  // Don't flash the "missing" warning while the list is still loading.
  const adrMissing = !docsQ.isLoading && docsQ.isSuccess && !hasAdr;

  // ── Upload control state ──────────────────────────────
  const [category, setCategory] = useState<CarrierAttachmentCategory>(
    'adr',
  );
  const [picked, setPicked] = useState<FileUploadItem[]>([]);

  const uploadM = useUploadCarrierAttachment({
    onSuccess: () => {
      toast.success(t('uploadedToast'));
      setPicked([]);
    },
    onError: (err) => {
      // Defense in depth: the API enforces the single-ADR rule and returns
      // 409 if a second ADR slips past the disabled-button guard below.
      if (err instanceof ApiResponseError && err.status === 409) {
        toast.error(t('adrExistsToast'));
        return;
      }
      toast.error(tCommon('errorGeneric'));
    },
  });

  // ── Delete dialog state ───────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<CarrierAttachmentDto | null>(
    null,
  );
  const deleteM = useDeleteCarrierAttachment({
    onSuccess: () => {
      toast.success(t('deletedToast'));
      setDeleteTarget(null);
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  // ── Download — fetch authenticated bytes, save via object-URL anchor ──
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const handleDownload = useCallback(
    async (att: CarrierAttachmentDto) => {
      setDownloadingId(att.id);
      try {
        const blob = await downloadCarrierAttachment(carrierId, att.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.fileName;
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
    [carrierId, t],
  );

  const categoryLabel = useCallback(
    (cat: CarrierAttachmentCategory) => t(`category.${cat}`),
    [t],
  );

  const fileLabels = useMemo<FileUploadLabels>(
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
    }),
    [tFile],
  );

  // The single freshly-picked, valid file (if any).
  const pickedFile = useMemo(() => {
    const item = picked.find(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    );
    return item?.file ?? null;
  }, [picked]);

  // Block a duplicate ADR before the request is even attempted.
  const adrDuplicateBlocked = category === 'adr' && hasAdr;

  const onUpload = () => {
    if (!pickedFile || adrDuplicateBlocked) return;
    uploadM.mutate({ carrierId, category, file: pickedFile });
  };

  const columns = useMemo<DataTableColumn<CarrierAttachmentDto>[]>(
    () => [
      {
        id: 'fileName',
        header: t('columns.fileName'),
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span className="font-medium" title={row.fileName}>
            {row.fileName}
          </span>
        ),
      },
      {
        id: 'category',
        header: t('columns.category'),
        cell: (row) => categoryLabel(row.category),
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
          </div>
        ),
      },
    ],
    [t, tCommon, categoryLabel, downloadingId, handleDownload],
  );

  return (
    <div className="space-y-4">
      {/* ── Mandatory-ADR warning ── shown only once the list has loaded and
          no ADR document is present. Uses the documented amber/warning token
          set (same convention as Badge/CountdownBanner). */}
      {adrMissing && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-bg p-4 dark:bg-warning/10"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert
              size={20}
              className="mt-0.5 flex-none text-warning-dark dark:text-warning"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-warning-dark dark:text-warning">
                {t('adrMissingTitle')}
              </h3>
              <p className="mt-1 text-sm text-text">{t('adrMissingMessage')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload control ── */}
      <div className="rounded-xl border border-border bg-card shadow-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
          <UploadCloud size={16} className="text-text-sub" aria-hidden />
          {t('uploadHeading')}
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr_auto] md:items-end">
          <FormField label={t('categoryLabel')} htmlFor="doc-category">
            <Select
              id="doc-category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as CarrierAttachmentCategory)
              }
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('fileLabel')} htmlFor="doc-file">
            <FileUpload
              id="doc-file"
              value={picked}
              onChange={setPicked}
              labels={fileLabels}
              multiple={false}
            />
          </FormField>
          <Button
            type="button"
            size="sm"
            disabled={!pickedFile || uploadM.isPending || adrDuplicateBlocked}
            onClick={onUpload}
          >
            {uploadM.isPending ? tCommon('saving') : t('uploadButton')}
          </Button>
        </div>
        {/* Inline hint when the user has selected ADR but one already exists —
            the upload button is disabled above; explain why here. */}
        {adrDuplicateBlocked && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-warning-dark dark:text-warning">
            <TriangleAlert size={14} className="flex-none" aria-hidden />
            {t('adrExistsHint')}
          </p>
        )}
      </div>

      {/* ── Documents table ── */}
      <DataTable
        rows={docs}
        columns={columns}
        rowKey={(r) => r.id}
        isLoading={docsQ.isLoading}
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState
            icon={FileText}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      {/* ── Delete confirmation ── */}
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
            {/* Brand-red default IS the danger affordance in this design
                system (see ConfirmDeleteWithReasonDialog). */}
            <Button
              type="button"
              size="sm"
              disabled={deleteM.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteM.mutate({
                  carrierId,
                  attachmentId: deleteTarget.id,
                });
              }}
            >
              {deleteM.isPending ? tCommon('saving') : tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Human-readable byte size. Mirrors the FileUpload primitive's formatter. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
