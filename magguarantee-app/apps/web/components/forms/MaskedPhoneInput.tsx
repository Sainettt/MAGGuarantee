// SOFT-WARNING ONLY — never escalate to RHF/Zod, never block submit. See docs/14 §6.1.2
//
// MaskedPhoneInput — a sibling of <MaskedPostalInput> for the driver phone /
// phone2 fields. It is deliberately NOT a generalisation of MaskedPostalInput:
// phone has a LENIENT model (calling-code + national-digit-count range) and is
// never wired into a Zod schema.
//
// Asymmetries vs. MaskedPostalInput (all intentional — see docs/14 §6.1.3):
// - No rigid character-mask. National significant lengths vary (mobile vs
//   landline), so we never reshape the user's typing — the value passes through
//   to RHF verbatim. Only a light format/length HINT + soft on-blur warning.
// - When `country === ''` the input is an ENABLED free-text field (no mask, no
//   hint row, NOT disabled) so non-EU / unusual numbers always submit.
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
  EU_PHONE_RULES,
  isPlausiblePhone,
  type EuVatCountryCode,
} from '@magguarantee/shared';

import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'placeholder'
>;

export interface MaskedPhoneInputProps extends NativeInputProps {
  /** Current phone value — passed through verbatim (no mask reshaping). */
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

export const MaskedPhoneInput = forwardRef<
  HTMLInputElement,
  MaskedPhoneInputProps
>(function MaskedPhoneInput(
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
  const t = useTranslations('forms.phone');
  // SOFT-WARNING ONLY — local flag, never leaves the component, never RHF.
  const [blurInvalid, setBlurInvalid] = useState(false);

  const rule = country ? EU_PHONE_RULES[country] : undefined;

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
        setBlurInvalid(!isPlausiblePhone(country, value));
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

  // Digit count of the national part, surfaced in the neutral hint.
  const digits = rule
    ? rule.minNationalLen === rule.maxNationalLen
      ? `${rule.minNationalLen}`
      : `${rule.minNationalLen}–${rule.maxNationalLen}`
    : '';

  return (
    <div className="space-y-1">
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
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
            ? t('invalidFormat', {
                callingCode: `+${rule.callingCode}`,
                digits,
                example: rule.example,
              })
            : t('expectedFormat', {
                callingCode: `+${rule.callingCode}`,
                digits,
              })}
        </p>
      )}
    </div>
  );
});
