'use client';

// <ActiveStatusRow> — the distinguished `Aktywny` status control shared by all
// four entity form dialogs (docs/14-design-system.md §13.2.4).
//
// The `active` flag deactivates the ENTIRE entity — the single most
// consequential control in the form. Instead of a bare inline <Checkbox> buried
// among dozens of equipment/permission flags, it is lifted out of every
// <FormSection> and rendered ONCE as the last child of <FormDialogBody>, as a
// distinguished bordered status row.
//
// Presentational only: the parent owns the RHF `register('active')` (passed via
// `checkboxProps`) and the live checked state (passed via `checked` from
// `form.watch('active')`). The component renders the RevealInset shell + bold
// label + consequence subline + a live mirror badge.

import type { ComponentPropsWithRef } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';

interface ActiveStatusRowProps {
  /** «Aktywny» — reuse `<ns>.fields.active` / `common.active`. */
  label: string;
  /** One-line deactivation consequence — `formActive.<entity>Consequence`. */
  consequence: string;
  /** Badge text when checked — `common.active`. */
  activeBadgeLabel: string;
  /** Badge text when unchecked — `common.inactive`. */
  inactiveBadgeLabel: string;
  /** Live checked state from `form.watch('active')`, drives the mirror badge. */
  checked: boolean;
  /** The `form.register('active')` spread — wires the checkbox to RHF. */
  checkboxProps: ComponentPropsWithRef<typeof Checkbox>;
}

export function ActiveStatusRow({
  label,
  consequence,
  activeBadgeLabel,
  inactiveBadgeLabel,
  checked,
  checkboxProps,
}: ActiveStatusRowProps) {
  return (
    // Same shell as <RevealInset> (§13.2.1): left-2px brand accent + calm inset
    // fill — reads as "important status control", NOT an error/warning.
    <div className="flex items-start gap-3 rounded-lg border border-border border-l-2 border-l-brand/50 bg-input/40 p-3">
      {/* Whole text region is one click target (≥44px effective hit area). */}
      <label className="flex flex-1 items-start gap-3 cursor-pointer">
        <Checkbox className="mt-0.5" {...checkboxProps} />
        <span className="flex flex-col">
          <span className="text-sm font-bold text-text">{label}</span>
          <span className="mt-0.5 text-xs text-text-sub">{consequence}</span>
        </span>
      </label>
      <Badge
        variant={checked ? 'success' : 'muted'}
        className="ml-auto mt-0.5 shrink-0"
      >
        {checked ? activeBadgeLabel : inactiveBadgeLabel}
      </Badge>
    </div>
  );
}
