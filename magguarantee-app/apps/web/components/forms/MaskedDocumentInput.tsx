// SOFT-WARNING ONLY — never escalate to RHF/Zod, never block submit. See docs/14 §6.1.2
//
// MaskedDocumentInput — a sibling of <MaskedPostalInput> for the driver
// idDocumentNumber field. Like MaskedPhoneInput it is deliberately NOT a
// generalisation of MaskedPostalInput: identity documents have a LENIENT model
// (length-range + an optional permissive regex) and are never wired into a Zod
// schema.
//
// Asymmetries vs. MaskedPostalInput (all intentional — see docs/14 §6.1.3):
// - No rigid character-mask. Most EU states issue several accepted document
//   types (national ID / passport / residence card / legacy formats) with
//   divergent shapes, so we never reshape typing — the value passes through to
//   RHF verbatim. Only a realistic example HINT + soft on-blur warning.
// - When `country === ''` the input is an ENABLED free-text field (no mask, no
//   hint row, NOT disabled) so non-EU / unusual documents always submit.
// - The on-blur "looks implausible" flag is LOCAL useState (`blurInvalid`),
//   exactly like MaskedPostalInput. It NEVER becomes an RHF error and NEVER
//   blocks submit.

import {
  forwardRef,
  useCallback,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react';
import { useTranslations } from 'next-intl';

import {
  EU_ID_DOCUMENT_RULES,
  isPlausibleIdDocument,
  type EuVatCountryCode,
} from '@magguarantee/shared';

import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'placeholder'
>;

export interface MaskedDocumentInputProps extends NativeInputProps {
  /** Current document number — passed through verbatim (no mask reshaping). */
  value: string;
  /** Called with the raw typed value. We never transform it. */
  onChange: (next: string) => void;
  /**
   * ISO 2-letter country code (VIES dialect — `EL` for Greece). When empty the
   * input is an ENABLED free-text field (no mask, no hint) — unlike postal.
   */
  country: EuVatCountryCode | '';
  /** Optional placeholder override; defaults to the country's `example`. */
  placeholderOverride?: string;
}

export const MaskedDocumentInput = forwardRef<
  HTMLInputElement,
  MaskedDocumentInputProps
>(function MaskedDocumentInput(
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
  const t = useTranslations('forms.document');
  // SOFT-WARNING ONLY — local flag, never leaves the component, never RHF.
  const [blurInvalid, setBlurInvalid] = useState(false);

  const rule = country ? EU_ID_DOCUMENT_RULES[country] : undefined;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // No mask — pass the literal value straight through to RHF.
      if (blurInvalid) setBlurInvalid(false);
      onChange(e.target.value);
    },
    [onChange, blurInvalid],
  );

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      // Only nudge when a country is selected and the field has content.
      if (country && value) {
        setBlurInvalid(!isPlausibleIdDocument(country, value));
      } else {
        setBlurInvalid(false);
      }
      onBlur?.(e);
    },
    [country, value, onBlur],
  );

  // No country → neutral free-text placeholder, no hint row.
  const placeholder = rule
    ? (placeholderOverride ?? rule.example)
    : (placeholderOverride ?? t('placeholderNoCountry'));

  return (
    <div className="space-y-1">
      <Input
        ref={ref}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
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
