'use client';

// Entity-agnostic hook for opening an authenticated binary resource (an
// attachment download) in a new browser tab. Documents currently live on
// vehicles, but carriers / drivers / trailers will gain them later — so this
// hook deliberately knows nothing about any specific entity: the caller hands
// in a `() => Promise<Blob>` fetcher.
//
// Popup-blocker-safe flow (this is the whole point of the hook):
//   1. `window.open('', '_blank')` is called SYNCHRONOUSLY inside the click
//      handler, BEFORE any `await`. Browsers only trust `window.open` while
//      still inside the user gesture; awaiting first loses that trust and the
//      tab is silently blocked. We deliberately do NOT pass `noopener` — that
//      makes `window.open` return `null` and we'd lose the handle we need to
//      navigate the tab afterwards.
//   2. If `window.open` returns `null` the blocker won the race anyway → toast
//      and bail.
//   3. `await` the caller's fetcher to get the bytes.
//   4. Normalise the blob MIME type (see below) so PDFs/images render inline
//      rather than downloading.
//   5. Point the pre-opened tab at an object URL, revoke it after a delay.
//
// MIME normalisation: the API download endpoint streams the stored
// `Content-Type`, so `blob.type` is usually correct. But defensively — if it
// comes back empty or the generic `application/octet-stream` — and the caller
// supplied the attachment's `mimeType`, we re-wrap the blob with that type.
// Without a concrete type the browser falls back to downloading the file.

import { useCallback, useState } from 'react';

/** A blob type that tells the browser nothing useful — treat as "unknown". */
const GENERIC_MIME = 'application/octet-stream';

/** How long the object URL is kept alive so the new tab can render it. */
const REVOKE_DELAY_MS = 60_000;

export interface OpenBlobInTabArgs {
  /**
   * Stable, unique key for this resource (e.g. the attachment id). Used to
   * track per-item loading state so two rows can be opened independently.
   */
  key: string;
  /**
   * Caller-supplied async fetcher that returns the resource bytes. The hook
   * stays generic by never importing a concrete download function itself.
   */
  fetcher: () => Promise<Blob>;
  /**
   * Optional fallback MIME type (the attachment's `mimeType`). Used to re-wrap
   * the blob when the fetched type is empty or `application/octet-stream`.
   */
  mimeType?: string;
}

export interface UseOpenBlobInTabMessages {
  /** Shown when the popup blocker prevents the tab from opening. */
  popupBlocked: string;
  /** Shown when the fetcher rejects (network / auth / server error). */
  loadFailed: string;
}

const DEFAULT_MESSAGES: UseOpenBlobInTabMessages = {
  popupBlocked:
    'Could not open a new tab. Please allow pop-ups for this site and try again.',
  loadFailed: 'Could not open the file. Please try again.',
};

export interface UseOpenBlobInTabResult {
  /** Opens the resource in a new tab. Call this from a click handler. */
  open: (args: OpenBlobInTabArgs) => Promise<void>;
  /** `true` while the resource for `key` is being fetched. */
  isPending: (key: string) => boolean;
  /** The full set of in-flight keys (useful for bulk UI states). */
  pendingKeys: ReadonlySet<string>;
}

/**
 * @param onError    Surfaces an error message to the user (e.g. `toast.error`).
 * @param messages   Optional localized message overrides. Callers should pass
 *                   translated strings; English fallbacks are used otherwise.
 */
export function useOpenBlobInTab(
  onError: (message: string) => void,
  messages?: Partial<UseOpenBlobInTabMessages>,
): UseOpenBlobInTabResult {
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const open = useCallback(
    async ({ key, fetcher, mimeType }: OpenBlobInTabArgs): Promise<void> => {
      const msg = { ...DEFAULT_MESSAGES, ...messages };

      // 1. Open the blank tab synchronously — must happen before any await so
      //    it stays inside the user gesture.
      const tab = window.open('', '_blank');

      // 2. Blocker still won → no handle, nothing we can do.
      if (!tab) {
        onError(msg.popupBlocked);
        return;
      }

      setPending((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      try {
        // 3. Fetch the bytes.
        let blob = await fetcher();

        // 4. Normalise the MIME type so the browser renders inline.
        if (
          (!blob.type || blob.type === GENERIC_MIME) &&
          mimeType &&
          mimeType !== GENERIC_MIME
        ) {
          blob = new Blob([blob], { type: mimeType });
        }

        // 5. Point the pre-opened tab at the object URL.
        const url = URL.createObjectURL(blob);
        tab.location.href = url;

        // Keep the URL alive long enough for the tab to load it, then revoke.
        setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
      } catch {
        // Fetch failed — close the now-useless blank tab and report.
        tab.close();
        onError(msg.loadFailed);
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [onError, messages],
  );

  const isPending = useCallback((key: string) => pending.has(key), [pending]);

  return { open, isPending, pendingKeys: pending };
}
