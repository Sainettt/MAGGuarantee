'use client';

// Phase 9 — DRY copy-to-clipboard mechanics shared by <TemporaryPasswordRow>
// (§3.4 C) and the admin reset result modal (§9.4 Dialog B). Owns the
// 1500ms "just copied" flash + the `toast.error` fallback for blocked
// clipboard access (insecure context, missing focus, denied permission).
//
// Returns `{ copy, copied }`:
//   * `copy(text)` writes to the clipboard, sets `copied=true`, and resets it
//     after the flash window. On failure it shows an error toast and leaves
//     `copied=false`.
//   * `copied` drives the inline <Copy/> → <Check/> swap in the caller.

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const COPIED_FLASH_MS = 1500;

export function useCopyToClipboard(flashMs: number = COPIED_FLASH_MS): {
  copy: (text: string) => Promise<void>;
  copied: boolean;
} {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(text);
        } else {
          throw new Error('clipboard-unavailable');
        }
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), flashMs);
      } catch {
        // Clipboard API blocked (insecure context, focus, permissions).
        toast.error(t('errorGeneric'));
      }
    },
    [flashMs, t],
  );

  return { copy, copied };
}
