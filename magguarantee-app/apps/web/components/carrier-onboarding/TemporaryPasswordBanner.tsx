'use client';

// Phase 3.2 — sticky non-dismissible "temporary password" banner. Mounts
// inside the Sheet body of the carrier onboarding wizard from step 2 onwards
// (after the carrier user is created and the API returns a plaintext
// password). The password is the operator's only chance to read it — the
// backend stores only a hash — so the banner is intentionally NOT closable.
//
// Per docs/14-design-system.md § Phase 3.2 #2. Reuses warning-bg / warning-dark
// surface and `sticky top-0 z-10 -mx-6 px-6 py-3` layout recipe.

import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

interface Props {
  password: string;
}

const COPIED_FLASH_MS = 1500;
const MASKED_PLACEHOLDER = '************'; // 12 asterisks regardless of length

export function TemporaryPasswordBanner({ password }: Props) {
  const t = useTranslations();
  const [revealed, setRevealed] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the "just copied" timer on unmount so we don't update state after
  // the banner has been torn down (Sheet closed mid-flash).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async () => {
    try {
      // Always copy the real password, regardless of mask state — the
      // operator's most common path is "click Copy, paste into chat" without
      // ever revealing on screen (shoulder-surfing protection in open-plan).
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(password);
      }
      setJustCopied(true);
      toast.success(t('tempPwd.toast'));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setJustCopied(false);
      }, COPIED_FLASH_MS);
    } catch {
      // Clipboard API may be blocked (insecure context, focus, permissions).
      // Surface a toast so the operator knows the click did nothing.
      toast.error(t('common.errorGeneric'));
    }
  };

  return (
    <section
      role="region"
      aria-label={t('tempPwd.regionLabel')}
      className={cn(
        // Sticky banner pattern from docs/14 § Phase 3.2 — sits inside the
        // <SheetBody> scroll container (px-6 py-4) and bleeds to the edges
        // via -mx-6 + px-6 so the border-b runs the full Sheet width.
        'sticky top-0 z-10 -mx-6 px-6 py-3 border-b border-warning/40 bg-warning-bg',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-bold text-warning-dark">
        <KeyRound size={16} className="shrink-0" aria-hidden="true" />
        <span>{t('tempPwd.title')}</span>
      </div>
      <p className="mt-1 text-xs text-text">{t('tempPwd.body')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-sm border border-warning/40 bg-card px-3 py-1.5',
            'font-mono text-sm tabular-nums select-all',
          )}
          aria-label={
            revealed
              ? undefined
              : t('tempPwd.maskedAria')
          }
        >
          {revealed ? password : MASKED_PLACEHOLDER}
        </span>
        <button
          type="button"
          aria-pressed={revealed}
          aria-label={
            revealed ? t('tempPwd.hideAria') : t('tempPwd.revealAria')
          }
          onClick={() => setRevealed((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-warning-dark hover:underline',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          )}
        >
          {revealed ? (
            <EyeOff size={14} aria-hidden="true" />
          ) : (
            <Eye size={14} aria-hidden="true" />
          )}
          {revealed ? t('tempPwd.hide') : t('tempPwd.reveal')}
        </button>
        <button
          type="button"
          aria-label={t('tempPwd.copyAria')}
          onClick={onCopy}
          disabled={!password}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-warning-dark hover:underline',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            'disabled:opacity-50',
          )}
        >
          {justCopied ? (
            <>
              <Check size={14} aria-hidden="true" />
              {t('tempPwd.copied')}
            </>
          ) : (
            <>
              <Copy size={14} aria-hidden="true" />
              {t('tempPwd.copy')}
            </>
          )}
        </button>
      </div>
    </section>
  );
}
