// Phase 6.3 — non-dismissible read-only info banner.
//
// Both the planista (6.4) and dyspozytor (6.5) panels open with the same
// "data is read-only — managed by an administrator" strip (DS §6.3.1 #2),
// replacing the legacy red/blue "tylko do podglądu" bar. Composed from
// existing tokens only: `bg-input` soft surface + `text-info` accent on the
// leading icon. No banner token is invented.

import { Info } from 'lucide-react';

export interface ReadOnlyBannerProps {
  /** Already-translated copy (PL default). */
  message: string;
}

export function ReadOnlyBanner({ message }: ReadOnlyBannerProps) {
  return (
    <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-input px-4 py-3 text-sm text-text-sub">
      <Info size={16} className="text-info shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
