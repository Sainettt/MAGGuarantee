'use client';

// Phase 11 — <TeamMembers> (docs/14-design-system.md §7.9).
//
// The SINGLE source of truth for rendering a dispatch team's identity (code
// chip + name) and its member dispatchers, wherever a team is shown across the
// app (six contexts — §7.9.6). It replaces ad-hoc "list the dispatchers inline"
// markup so the three states (members / empty team / inactive team) look
// identical everywhere.
//
// FIELD NOTE: a team member carries a single nullable `name` plus a `login`
// (NOT firstName/lastName — the §7.9.5 doc predates the final DTO). The display
// label and the avatar initials both derive from `name ?? login`.
//
// NO NEW DESIGN TOKENS — everything composes the existing palette/radius/type/
// spacing (`bg-input`, `text-text`, `text-text-sub`, the `muted` Badge for the
// inactive treatment, the §3.5 soft-warning recipe for the empty-team box).

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleDispatchTeamDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { cn } from '@/lib/utils';

/** A dispatcher in a team — `{ id, name, login }` (name is nullable). */
export type TeamMember = VehicleDispatchTeamDto['dispatchers'][number];

/** The team identity + roster fed to <TeamMembers> (= `Vehicle.dispatchTeam`). */
export type TeamMembersTeam = Pick<
  VehicleDispatchTeamDto,
  'code' | 'name' | 'active' | 'dispatchers'
>;

export interface TeamMembersProps {
  team: TeamMembersTeam;
  /** `chips` (default) — wrap row of member tokens. `list` — stacked rows. */
  variant?: 'chips' | 'list';
  /** `md` (default) — modals/panels/admin. `sm` — inline previews/tight cells. */
  size?: 'sm' | 'md';
  /**
   * `true` (default) — render the code chip. A host that already prints the
   * code in its own header may pass `false` to dedup; identity is NEVER hidden,
   * so when `name` is also null the chip renders anyway (§7.9.5).
   */
  showCode?: boolean;
  className?: string;
}

/** The display label for one member — `name ?? login`. */
function memberLabel(member: TeamMember): string {
  return member.name?.trim() || member.login;
}

export function TeamMembers({
  team,
  variant = 'chips',
  size = 'md',
  showCode = true,
  className,
}: TeamMembersProps) {
  const t = useTranslations('team');

  const isSm = size === 'sm';
  const isInactive = team.active === false;
  const isEmpty = team.dispatchers.length === 0;

  // Identity never disappears: even with showCode=false, fall back to the chip
  // when there is no name to stand in for it (§7.9.5).
  const renderCode = showCode || !team.name;
  const codeChipClass = cn(
    'inline-flex items-center rounded-md bg-input px-1.5 py-0.5 font-mono tabular-nums text-text',
    isSm ? 'text-xs' : 'text-sm',
  );
  const nameClass = cn('text-text', isSm ? 'text-xs' : 'text-sm');

  return (
    <div className={cn('min-w-0', className)}>
      {/* ── Identity line: code chip + name + inactive badge ── */}
      {/* The badge sits OUTSIDE the dimmed subtree so it stays full-contrast. */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={cn(
            'flex flex-wrap items-center gap-2',
            isInactive && 'opacity-70',
          )}
        >
          {renderCode && (
            <span className={codeChipClass} aria-label={t('codeAria', { code: team.code })}>
              {team.code}
            </span>
          )}
          {team.name ? <span className={nameClass}>{team.name}</span> : null}
        </div>
        {isInactive && (
          <Badge variant="muted">{t('inactiveBadge')}</Badge>
        )}
      </div>

      {/* ── Member area ── */}
      {isEmpty ? (
        // Amber soft-warning box. EXEMPT from the inactive dim — `opacity-100`
        // counters any inherited dim so it always clears AA (§7.9.3).
        <div
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-bold text-warning opacity-100"
        >
          <AlertTriangle size={12} aria-hidden="true" />
          {t('emptyMembers')}
        </div>
      ) : variant === 'list' ? (
        <ul
          className={cn('mt-2 flex flex-col gap-1.5', isInactive && 'opacity-70')}
          aria-label={t('membersAria', { code: team.code })}
        >
          {team.dispatchers.map((member) => (
            <li key={member.id} className="flex items-center gap-2">
              <InitialsAvatar name={memberLabel(member)} size={size} />
              <span className={cn('truncate text-text', isSm ? 'text-xs' : 'text-sm')}>
                {memberLabel(member)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div
          role="list"
          aria-label={t('membersAria', { code: team.code })}
          className={cn('mt-2 flex flex-wrap gap-2', isInactive && 'opacity-70')}
        >
          {team.dispatchers.map((member) => (
            <span
              key={member.id}
              role="listitem"
              className="inline-flex items-center gap-1.5 rounded-full bg-input/60 py-1 pl-1 pr-2.5"
            >
              <InitialsAvatar name={memberLabel(member)} size={size} />
              <span
                className={cn(
                  'truncate max-w-[14ch] text-text',
                  isSm ? 'text-xs' : 'text-sm',
                )}
              >
                {memberLabel(member)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
