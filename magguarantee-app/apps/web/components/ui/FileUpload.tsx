'use client';

// <FileUpload> — reusable multi-file upload primitive. docs/14 § Phase 5.1.
//
// A controlled component bound to an array of file items. Two item shapes:
//   - `existing` — a file already on the server (edit mode). Carries the
//     attachment id; removing it is deferred to form submit (the Sheet's
//     "nothing persists until Zapisz" contract).
//   - `new`      — a File the user just picked. Sent as a multipart part on
//     form submit; not uploaded eagerly in the vehicle modal.
//
// Client-side validation (size ≤ maxSizeMb, MIME in `accept`) runs the moment
// a file is added; rejected files render as inline error rows so the user
// sees *which* file failed and dismisses it via `[X]` — never a toast.
//
// `onUpload` (optional) supports an eager-upload flow with progress + retry
// for future callers; the vehicle modal does NOT pass it (files travel with
// the form submit). When `onUpload` is omitted the component never shows a
// progress bar — new files are just staged.

import {
  AlertTriangle,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
} from 'react';

import { cn } from '@/lib/utils';

// ─── Item model ──────────────────────────────────────────

/** A file already persisted on the server (edit mode). */
export interface ExistingFileItem {
  kind: 'existing';
  /** Attachment id — names this file for the `removeAttachmentIds` payload. */
  id: string;
  fileName: string;
  size: number;
  mimeType: string;
  /** Optional thumbnail/preview URL. Vehicle modal leaves this undefined —
   *  attachments download via an authenticated endpoint, not a public URL. */
  thumbnailUrl?: string;
}

/** A locally-picked file not yet sent to the server. */
export interface NewFileItem {
  kind: 'new';
  /** Stable client id so React keys + remove() are deterministic. */
  localId: string;
  file: File;
  /** Set by client-side validation; when present the file is NOT staged. */
  error?: 'tooLarge' | 'wrongType' | 'uploadFailed';
  /** Eager-upload state (only when an `onUpload` callback is supplied). */
  uploading?: boolean;
  /** 0–100 — only meaningful while `uploading`. */
  progress?: number;
}

export type FileUploadItem = ExistingFileItem | NewFileItem;

// ─── i18n strings (caller-supplied so the primitive stays locale-agnostic) ──

export interface FileUploadLabels {
  prompt: string;
  promptCompact: string;
  constraints: string;
  errTooLarge: string;
  errWrongType: string;
  errUploadFailed: string;
  retry: string;
  dropzoneAria: string;
  /** `(name) => "Remove file <name>"` */
  removeAria: (name: string) => string;
}

const DEFAULT_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface FileUploadProps {
  value: FileUploadItem[];
  onChange: (next: FileUploadItem[]) => void;
  labels: FileUploadLabels;
  /** Allowed MIME types. Defaults to JPG/PNG/WebP/PDF. */
  accept?: readonly string[];
  /** Per-file size cap in MB. Default 10. */
  maxSizeMb?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Read-only display: no dropzone, no remove buttons. */
  readOnly?: boolean;
  /**
   * Optional eager-upload transfer. When omitted, new files are staged for a
   * later batch submit (the vehicle modal path). When supplied, the component
   * drives progress/error UI around it.
   */
  onUpload?: (file: File) => Promise<void>;
  /** Wires the dropzone button for htmlFor / aria. */
  id?: string;
}

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `fu-${Date.now()}-${localIdCounter}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function FileUpload({
  value,
  onChange,
  labels,
  accept = DEFAULT_ACCEPT,
  maxSizeMb = 10,
  multiple = true,
  disabled = false,
  readOnly = false,
  onUpload,
  id,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fallbackId = useId();
  const dropzoneId = id ?? fallbackId;

  // Object-URLs for image previews of locally-picked files; revoked on unmount
  // so we don't leak. Keyed by localId.
  const previewUrls = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const maxBytes = maxSizeMb * 1024 * 1024;

  const valueRef = useRef(value);
  valueRef.current = value;

  /** Validate + append picked files; rejected ones become error rows. */
  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);
      if (incoming.length === 0) return;
      const toAdd: NewFileItem[] = incoming.map((file) => {
        let error: NewFileItem['error'];
        if (!accept.includes(file.type)) {
          error = 'wrongType';
        } else if (file.size > maxBytes) {
          error = 'tooLarge';
        }
        return { kind: 'new', localId: nextLocalId(), file, error };
      });
      const lastAdded = toAdd[toAdd.length - 1];
      const next: FileUploadItem[] = multiple
        ? [...valueRef.current, ...toAdd]
        : // single-file: replace with the last picked file
          lastAdded
          ? [lastAdded]
          : valueRef.current;
      onChange(next);
    },
    [accept, maxBytes, multiple, onChange],
  );

  const removeItem = useCallback(
    (item: FileUploadItem) => {
      const key = item.kind === 'new' ? item.localId : item.id;
      if (item.kind === 'new') {
        const url = previewUrls.current.get(item.localId);
        if (url) {
          URL.revokeObjectURL(url);
          previewUrls.current.delete(item.localId);
        }
      }
      onChange(
        valueRef.current.filter((it) =>
          it.kind === 'new' ? it.localId !== key : it.id !== key,
        ),
      );
    },
    [onChange],
  );

  const updateItem = useCallback(
    (localId: string, patch: Partial<NewFileItem>) => {
      onChange(
        valueRef.current.map((it) =>
          it.kind === 'new' && it.localId === localId
            ? { ...it, ...patch }
            : it,
        ),
      );
    },
    [onChange],
  );

  /** Eager-upload a single staged file (only when `onUpload` is supplied). */
  const runUpload = useCallback(
    async (item: NewFileItem) => {
      if (!onUpload) return;
      updateItem(item.localId, {
        uploading: true,
        progress: 10,
        error: undefined,
      });
      try {
        await onUpload(item.file);
        updateItem(item.localId, { uploading: false, progress: 100 });
      } catch {
        updateItem(item.localId, {
          uploading: false,
          progress: 0,
          error: 'uploadFailed',
        });
      }
    },
    [onUpload, updateItem],
  );

  const openPicker = () => {
    if (disabled || readOnly) return;
    inputRef.current?.click();
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || readOnly) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const hasFiles = value.length > 0;

  return (
    <div className="space-y-2">
      {/* ── Dropzone ── (hidden in read-only mode) */}
      {!readOnly && (
        <button
          type="button"
          id={dropzoneId}
          aria-label={labels.dropzoneAria}
          disabled={disabled}
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1 rounded text-center',
            'border border-dashed border-border bg-input transition-colors',
            'cursor-pointer px-4',
            hasFiles ? 'py-3' : 'py-5',
            'hover:border-brand-200 hover:bg-brand-50/50',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            // Drag-over: solid border (non-colour cue) + brand fill.
            dragOver && 'border-solid border-brand bg-brand-50',
            disabled &&
              'cursor-not-allowed opacity-50 hover:border-border hover:bg-input',
          )}
        >
          <UploadCloud size={20} className="text-text-sub" aria-hidden />
          <span className="text-sm text-text">
            {hasFiles ? labels.promptCompact : labels.prompt}
          </span>
          {!hasFiles && (
            <span className="text-xs text-text-sub">{labels.constraints}</span>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple={multiple}
            accept={accept.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              // Reset so picking the same file twice re-fires onChange.
              e.target.value = '';
            }}
          />
        </button>
      )}

      {/* ── File list ── */}
      {hasFiles && (
        <ul className="divide-y divide-border rounded border border-border">
          {value.map((item) => (
            <FileRow
              key={item.kind === 'new' ? item.localId : item.id}
              item={item}
              labels={labels}
              disabled={disabled}
              readOnly={readOnly}
              previewUrls={previewUrls.current}
              onRemove={() => removeItem(item)}
              onRetry={
                item.kind === 'new' && item.error === 'uploadFailed' && onUpload
                  ? () => void runUpload(item)
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── File row ────────────────────────────────────────────

interface FileRowProps {
  item: FileUploadItem;
  labels: FileUploadLabels;
  disabled: boolean;
  readOnly: boolean;
  previewUrls: Map<string, string>;
  onRemove: () => void;
  onRetry?: () => void;
}

function FileRow({
  item,
  labels,
  disabled,
  readOnly,
  previewUrls,
  onRemove,
  onRetry,
}: FileRowProps) {
  const errorId = useId();

  const isNew = item.kind === 'new';
  const fileName = isNew ? item.file.name : item.fileName;
  const size = isNew ? item.file.size : item.size;
  const mimeType = isNew ? item.file.type : item.mimeType;
  const error = isNew ? item.error : undefined;
  const uploading = isNew ? item.uploading === true : false;
  const progress = isNew ? (item.progress ?? 0) : 100;

  // Image preview: object-URL for new files, server URL for existing.
  let previewSrc: string | undefined;
  if (IMAGE_MIME.has(mimeType)) {
    if (isNew && !error) {
      let url = previewUrls.get(item.localId);
      if (!url) {
        url = URL.createObjectURL(item.file);
        previewUrls.set(item.localId, url);
      }
      previewSrc = url;
    } else if (!isNew) {
      previewSrc = item.thumbnailUrl;
    }
  }

  const errorMessage =
    error === 'tooLarge'
      ? labels.errTooLarge
      : error === 'wrongType'
        ? labels.errWrongType
        : error === 'uploadFailed'
          ? labels.errUploadFailed
          : undefined;

  return (
    <li
      className={cn(
        'flex items-center gap-3 px-3 py-2',
        error && 'border-danger/40 bg-danger-bg',
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden',
          'rounded-sm border border-border bg-input',
        )}
      >
        {uploading ? (
          <Loader2 size={18} className="animate-spin text-text-sub" aria-hidden />
        ) : error ? (
          <AlertTriangle size={18} className="text-danger" aria-hidden />
        ) : previewSrc ? (
          // Plain <img>: the source is an object-URL (locally-picked file) or
          // an authenticated server thumbnail — next/image can neither
          // optimise nor statically analyse either, so it is the right tool.
          <img
            src={previewSrc}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <FileText size={18} className="text-text-sub" aria-hidden />
        )}
      </div>

      {/* Name + (size | error) + progress */}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-text"
          title={fileName}
        >
          {fileName}
        </p>
        {error ? (
          <p id={errorId} className="text-xs text-danger" role="alert">
            {errorMessage}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="ml-2 text-xs font-semibold text-brand hover:underline"
              >
                {labels.retry}
              </button>
            )}
          </p>
        ) : uploading ? (
          <div
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-input"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={fileName}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : (
          <p className="text-xs tabular-nums text-text-sub">
            {formatBytes(size)}
          </p>
        )}
      </div>

      {/* Remove (hidden in read-only mode) */}
      {!readOnly && (
        <button
          type="button"
          aria-label={labels.removeAria(fileName)}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          onClick={onRemove}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm p-1',
            'text-text-sub transition-colors',
            'hover:bg-danger-bg hover:text-danger',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-sub',
          )}
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </li>
  );
}
