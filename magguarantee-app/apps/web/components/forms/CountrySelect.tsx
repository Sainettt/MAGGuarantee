// CountrySelect — dropdown of the 27 EU VAT countries.
//
// Used by the new-delegation form for `departureCountry` and `returnCountry`,
// both backed by the `EU_VAT_COUNTRY_CODES` Zod enum in
// `packages/shared/src/schemas/delegations.ts`.
//
// Shape: thin wrapper over the native `<Select>` so it integrates with React
// Hook Form via the standard `register('field')` spread — callers pass the
// RHF `...register(...)` props as-is. Display order is alphabetical by Polish
// name (the `EU_VAT_COUNTRIES` list is alphabetical by *code*; we re-sort by
// `name` here so the dropdown reads naturally to a Polish user).

import { forwardRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { EU_VAT_COUNTRIES } from '@magguarantee/shared';

import { Select, type SelectProps } from '@/components/ui/Select';

export type CountrySelectProps = Omit<SelectProps, 'children'>;

export const CountrySelect = forwardRef<HTMLSelectElement, CountrySelectProps>(
  function CountrySelect(props, ref) {
    const t = useTranslations('forms.country');

    // Memoize the sorted list — `EU_VAT_COUNTRIES` is a constant tuple so the
    // sort runs exactly once across the app's lifetime.
    const countries = useMemo(
      () =>
        [...EU_VAT_COUNTRIES].sort((a, b) =>
          a.name.localeCompare(b.name, 'pl'),
        ),
      [],
    );

    return (
      <Select ref={ref} {...props}>
        <option value="">{t('placeholder')}</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </Select>
    );
  },
);
