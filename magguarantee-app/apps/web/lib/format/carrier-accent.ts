// Phase 7.8 — deterministic carrier → accent assignment (docs/14 §7.8.2).
//
// Carrier accents are computed CLIENT-SIDE from `carrier.id` so the API
// contract is untouched and the same carrier always renders the same accent
// everywhere (this tab, future carrier chips, etc.). The hash MIRRORS the
// shipped `avatarBg` hash in `components/audit/AuditRow.tsx` — same algorithm,
// kept deterministic across renders: `h = (h * 31 + code) & 0xffff`, then
// `h % palette.length`.
//
// Each palette entry exposes:
//   • `accentBar`    — the 4px group-header rail (§7.8.1a)
//   • `accentBorder` — the 2px frozen-identity-cell row border (§7.8.1b)
//
// All hues are used at controlled opacity so they read as quiet rails, never
// as full surfaces. The palette is disjoint from the in-cell `success`/
// `bg-input` state language and from the reserved brand-red "today" accent —
// brand-red is NEVER a carrier accent.

export interface CarrierAccent {
  /** 4px group-header rail background class (§7.8.1a). */
  accentBar: string;
  /** 2px row left-border class on the frozen identity cell (§7.8.1b). */
  accentBorder: string;
}

/**
 * The six §7.8.2 category accents. Two new neutral hues (`cat-blue`,
 * `cat-violet`, the user-approved 2-token palette) plus four existing
 * non-colliding families (`warning`, `info`, `text-sub`, `success` at a
 * deeper rail-only opacity). On overflow (>6 carriers) the hash wraps and two
 * carriers share an accent — acceptable, since the group-header NAME is the
 * accessible source of truth (§7.8.1c) and the accent is only a scanning aid.
 */
export const CARRIER_ACCENT_PALETTE: readonly CarrierAccent[] = [
  // 0 — Blue (new cat-blue)
  { accentBar: 'bg-cat-blue/70 dark:bg-cat-blue/80', accentBorder: 'border-cat-blue/60' },
  // 1 — Violet (new cat-violet)
  { accentBar: 'bg-cat-violet/70 dark:bg-cat-violet/80', accentBorder: 'border-cat-violet/60' },
  // 2 — Amber/orange (existing warning)
  { accentBar: 'bg-warning/60 dark:bg-warning/70', accentBorder: 'border-warning/55' },
  // 3 — Yellow (existing info)
  { accentBar: 'bg-info/65 dark:bg-info/75', accentBorder: 'border-info/60' },
  // 4 — Slate / neutral-strong (existing text-sub)
  { accentBar: 'bg-text-sub/55 dark:bg-text-sub/65', accentBorder: 'border-text-sub/50' },
  // 5 — Teal-ish (existing success at a deeper, 4px-rail-only opacity —
  //     spatially separated from the full-cell `bg-success/10` drove tint)
  { accentBar: 'bg-success/60 dark:bg-success/70', accentBorder: 'border-success/55' },
] as const;

/**
 * Maps a carrier id to a stable palette index. Same id ⇒ same index ⇒ same
 * colour, with no server round-trip and no persistence. The `& 0xffff` keeps
 * the running hash a small int; `% palette.length` lands it in the palette.
 */
export function carrierAccentIndex(carrierId: string): number {
  let h = 0;
  for (const ch of carrierId) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return h % CARRIER_ACCENT_PALETTE.length;
}

/** Convenience: the resolved accent class-pair for a carrier id. */
export function carrierAccent(carrierId: string): CarrierAccent {
  return CARRIER_ACCENT_PALETTE[carrierAccentIndex(carrierId)]!;
}
