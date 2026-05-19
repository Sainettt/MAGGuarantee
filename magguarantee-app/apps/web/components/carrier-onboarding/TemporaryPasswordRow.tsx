'use client';

// Phase 3.4 — replacement for the Phase 3.2 temporary-password banner.
//
// A single-row info band that lives inside the <SheetHeader> of the
// carrier-onboarding wizard, immediately below the <WizardStepper>. Visible
// from step 2 onwards (after the carrier user is created and the API returns
// a plaintext password). When the Sheet closes, the row unmounts with it —
// the cleartext password is held in the wizard root's local React state and
// is GC'd at that moment.
//
// Per docs/14-design-system.md § Phase 3.4.C, with the following deliberate
// user override: the password is **masked by default** with a Show / Hide
// toggle, NOT plaintext-on-mount. The rest of the spec (sky-50 `bg-info-soft`
// surface, single row inside SheetHeader, inline checkmark feedback on copy,
// no success toast, no body paragraph) stays as written. The Copy button
// always writes the cleartext password to the clipboard regardless of mask
// state — the operator's most common path is "click Copy, paste into chat
// with carrier" without ever revealing the value on screen.
//
// A11y notes (cross-ref §C "Accessibility" + the contrast paragraph):
//   - <section role="group"> with `aria-label={t('tempPwd.regionLabel')}`
//     — labelled group of inline controls inside the header, not a top-level
//     landmark.
//   - The password chip carries `aria-label="Temporary password"` so SR
//     announces the field's purpose. We do NOT also speak the value: when
//     the row is masked the value is meaningless dots; when revealed sighted
//     and SR users can read the chip text. (Masked SR users see / hear the
//     masked-state aria-label per `tempPwd.maskedAria` instead.)
//   - Show button: `aria-pressed` reflects revealed state.
//   - Copy button: `aria-label="Copy password to clipboard"`. The button's
//     accessible name flips on success ("Skopiowano") and reverts after
//     1500ms — `aria-live="polite"` announces the swap.
//   - The chip's `border-border` on `bg-info-soft` is decorative (1.18:1) —
//     identification relies on the chip's `bg-card` fill contrasting with
//     the soft-blue band, not on the border itself.

import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

interface Props {
  password: string;
  /** Wrapper className override — used by the wizard to apply the
   * `-mx-6 mt-3` header-edge bleed without baking the offset into the
   * component itself. */
  className?: string;
}

const COPIED_FLASH_MS = 1500;
// Fixed-length mask so visual width does not leak the actual password length.
const MASKED_PLACEHOLDER = '••••••••••••';

export function TemporaryPasswordRow({ password, className }: Props) {
  const t = useTranslations();
  const [revealed, setRevealed] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the "just copied" timer on unmount so we don't update state after
  // the row has been torn down (Sheet closed mid-flash).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async () => {
    try {
      // Always copy the cleartext password, regardless of mask state — the
      // operator's most common path is "click Copy, paste into chat with
      // carrier" without ever revealing on screen (shoulder-surfing
      // protection in open-plan offices).
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(password);
      }
      setJustCopied(true);
      // Phase 3.4 — no success toast. Inline checkmark is the primary
      // feedback; the toast was redundant + could fire after the operator's
      // eye had already moved to the next field.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setJustCopied(false);
      }, COPIED_FLASH_MS);
    } catch {
      // Clipboard API may be blocked (insecure context, focus, permissions).
      // Keep the toast.error so the operator knows the click did nothing.
      toast.error(t('common.errorGeneric'));
    }
  };

  return (
    <section
      role="group"
      aria-label={t('tempPwd.regionLabel')}
      className={cn(
        // Sky-50 info band — calm, neutral-positive surface that says
        // "informational, success-adjacent, not warning, not brand-red".
        // `flex-wrap` so on narrow Sheet widths the chip drops to a 2nd line.
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2.5',
        'border-t border-border bg-info-soft',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          'text-xs font-bold uppercase tracking-wider text-text-sub',
        )}
      >
        <KeyRound size={14} aria-hidden="true" />
        {t('tempPwd.title')}
      </span>
      <span
        className={cn(
          'inline-flex items-center rounded-sm border border-border bg-card px-2.5 py-1',
          'font-mono text-sm tabular-nums select-all',
        )}
        aria-label={revealed ? t('tempPwd.title') : t('tempPwd.maskedAria')}
      >
        {revealed ? password : MASKED_PLACEHOLDER}
      </span>
      <button
        type="button"
        aria-pressed={revealed}
        aria-label={revealed ? t('tempPwd.hideAria') : t('tempPwd.revealAria')}
        onClick={() => setRevealed((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-semibold text-text',
          'hover:bg-input',
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
        aria-live="polite"
        onClick={onCopy}
        disabled={!password}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-semibold text-text',
          'hover:bg-input',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          'disabled:opacity-50',
        )}
      >
        {justCopied ? (
          <>
            <Check size={14} className="text-success" aria-hidden="true" />
            {t('tempPwd.copied')}
          </>
        ) : (
          <>
            <Copy size={14} aria-hidden="true" />
            {t('tempPwd.copy')}
          </>
        )}
      </button>
    </section>
  );
}
