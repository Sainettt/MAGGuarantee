'use client';

// Phase 11 — <InitialsAvatar> (docs/14-design-system.md §7.9.2).
//
// A neutral, non-coloured initials circle. Deliberately NOT per-person tinted:
// avatars here are wayfinding, not identity-colour, so a team of dispatchers
// reads as a calm uniform set instead of a rainbow. Introduced for
// <TeamMembers> but generic and offered app-wide.
//
// `bg-input` / `text-text-sub` are theme-aware CSS-var tokens, so the circle is
// neutral in both light and dark with NO `dark:` override. The circle is
// decorative — the name text beside it is the accessible label — so the avatar
// is `aria-hidden` (no duplicate SR announcement of the initials).

import { cn } from '@/lib/utils';

export interface InitialsAvatarProps {
  /**
   * Source for the initials. Takes the first letter of the first two
   * whitespace-separated tokens, uppercased (`"Jan Kowalski"` → `JK`;
   * single-token `"Admin"` → `A`). Empty/whitespace → `?`.
   */
  name: string;
  /** `sm` = `h-6 w-6 text-[10px]`; `md` (default) = `h-8 w-8 text-xs`. */
  size?: 'sm' | 'md';
  /** Escape hatch only. */
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<InitialsAvatarProps['size']>, string> = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
};

/** First letter of the first two whitespace tokens, uppercased. `?` fallback. */
export function initialsFromName(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  return tokens
    .slice(0, 2)
    .map((tok) => tok[0]!.toUpperCase())
    .join('');
}

export function InitialsAvatar({
  name,
  size = 'md',
  className,
}: InitialsAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-input font-semibold text-text-sub',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}
