// MaskedPostalInput — controlled <input> that masks the user's typing to
// the per-country postal-code pattern in `EU_POSTAL_CODES`.
//
// Why custom (no `imask`/`react-input-mask`):
// - The dialect is tiny (`9` digit, `A` uppercase letter, anything else
//   literal) — covers all 27 EU formats with ~30 lines.
// - Pulling a dependency just to support 6 mask shapes (`9999`, `99999`,
//   `99-999`, `9999-999`, `999999`, `999 99`, plus a few with letters)
//   would be overkill and ships extra KB for a single form.
//
// Behavior:
// - If no `country` is selected, the input is read-only-disabled with a
//   neutral placeholder so the user knows what to do (pick a country first).
// - When `country` changes, the caller is responsible for clearing the value
//   (see `delegations/new/page.tsx`). We don't auto-clear here — the parent
//   form is the one that owns the field's RHF state.
// - On typing, each character is matched against the mask slot at its
//   position: digit slots consume only `[0-9]`, letter slots only `[A-Z]`
//   (we uppercase on the fly), literals are inserted automatically when the
//   user has typed enough payload chars to reach them.
// - On blur, if the value isn't empty and the country is set, we run
//   `isValidPostalCode` for an inline warning — RHF/Zod will catch this on
//   submit anyway but the live feedback is friendlier.

import {
  forwardRef,
  useCallback,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react';
import { useTranslations } from 'next-intl';

import {
  EU_POSTAL_CODES,
  isValidPostalCode,
  type EuVatCountryCode,
} from '@magguarantee/shared';

import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'placeholder'
>;

export interface MaskedPostalInputProps extends NativeInputProps {
  /** Current postal value (mask-formatted, e.g. `00-001`). */
  value: string;
  /** Called with the new (mask-formatted) value as the user types. */
  onChange: (next: string) => void;
  /**
   * ISO 2-letter country code (VIES dialect — `EL` for Greece). When empty,
   * the input is disabled because we don't know which mask to apply.
   */
  country: EuVatCountryCode | '';
  /** Optional placeholder override; defaults to the country's `example`. */
  placeholderOverride?: string;
}

const DIGIT_RE = /\d/;
const LETTER_RE = /[A-Za-z]/;

/**
 * Walk the mask and the user's raw input in parallel, dropping characters
 * that don't fit (digit-only slots reject letters, etc.) and auto-inserting
 * literal characters whenever the user has typed enough payload to reach
 * them.
 */
function applyMask(mask: string, raw: string): string {
  const out: string[] = [];
  // Index into the raw string — we advance through it independently of the
  // mask cursor because invalid characters get skipped.
  let rawIdx = 0;
  for (let mi = 0; mi < mask.length; mi += 1) {
    if (rawIdx >= raw.length) break;
    const slot = mask[mi];
    if (slot === '9') {
      // Skip non-digits in `raw`.
      while (rawIdx < raw.length && !DIGIT_RE.test(raw[rawIdx]!)) rawIdx += 1;
      if (rawIdx >= raw.length) break;
      out.push(raw[rawIdx]!);
      rawIdx += 1;
    } else if (slot === 'A') {
      while (rawIdx < raw.length && !LETTER_RE.test(raw[rawIdx]!)) rawIdx += 1;
      if (rawIdx >= raw.length) break;
      out.push(raw[rawIdx]!.toUpperCase());
      rawIdx += 1;
    } else {
      // Literal slot. Insert the literal automatically — but also consume the
      // matching literal from `raw` if the user typed it themselves (paste
      // case: pasting `00-001` against mask `99-999` should not double the
      // dash).
      out.push(slot!);
      if (raw[rawIdx] === slot) rawIdx += 1;
    }
  }
  return out.join('');
}

/**
 * Visual placeholder derived from the mask: `99-999` -> `__-___`. Better than
 * showing the literal mask because users might think `9` is a real character.
 * Optional `placeholderOverride` wins.
 */
function maskToPlaceholder(mask: string): string {
  return mask.replace(/[9A]/g, '_');
}

export const MaskedPostalInput = forwardRef<
  HTMLInputElement,
  MaskedPostalInputProps
>(function MaskedPostalInput(
  {
    value,
    onChange,
    country,
    placeholderOverride,
    onBlur,
    className,
    ...rest
  },
  ref,
) {
  const t = useTranslations('forms.postal');
  const [blurInvalid, setBlurInvalid] = useState(false);

  const rule = country ? EU_POSTAL_CODES[country] : undefined;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!rule) return;
      const next = applyMask(rule.mask, e.target.value);
      // The user is editing again — drop the stale "looks invalid" flag.
      if (blurInvalid) setBlurInvalid(false);
      onChange(next);
    },
    [rule, onChange, blurInvalid],
  );

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      if (country && value) {
        setBlurInvalid(!isValidPostalCode(country, value));
      } else {
        setBlurInvalid(false);
      }
      onBlur?.(e);
    },
    [country, value, onBlur],
  );

  const placeholder = country
    ? (placeholderOverride ?? maskToPlaceholder(rule!.mask))
    : t('placeholderNoCountry');

  return (
    <div className="space-y-1">
      <Input
        ref={ref}
        type="text"
        inputMode={rule && /^9+$/.test(rule.mask) ? 'numeric' : 'text'}
        autoComplete="postal-code"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={!country}
        aria-invalid={blurInvalid || undefined}
        className={cn(blurInvalid && 'border-danger', className)}
        {...rest}
      />
      {country && rule && (
        <p
          className={cn(
            'text-xs',
            blurInvalid ? 'text-danger' : 'text-text-sub',
          )}
          role={blurInvalid ? 'alert' : undefined}
        >
          {blurInvalid
            ? t('invalidFormat', { example: rule.example })
            : t('expectedFormat', { example: rule.example })}
        </p>
      )}
    </div>
  );
});
