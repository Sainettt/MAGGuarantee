'use client';

// «Uprawnienia indywidualne» — the last section of the admin user form in edit
// mode (docs/14 «UserSheet — blok „Uprawnienia indywidualne”» A.1–A.14,
// docs/25 §3 B6). Composition only: `Checkbox`, `Badge`, `Button`,
// `FormMessage`, `LockNotice`.
//
//   * «Dodatkowe» — rights granted ON TOP of the role (`GRANTABLE_EXTRA`),
//     hidden when the role may be granted nothing. Dependencies apply both
//     ways automatically, announced in one live line (A.3).
//   * «Odebrane» — the role's rights revoked from this person, collapsed
//     unless something is revoked; absent for admin. A revoked base right with
//     still-effective dependents gets a «Odbierz również» hint (A.4).
//   * «Uprawnienia efektywne» — the live preview of what the api will compute
//     from the current form values (A.6).
//   * A role / leader change in the same edit lists the entries it will drop
//     (A.7) — the form keeps them, so switching back restores them.
//
// The form owns the FULL lists (`value`); everything shown is derived through
// `lib/users/permissionOverrides.ts`. Group headings are `<h4>`s naming their
// `<fieldset>` via `aria-labelledby` (the «Odebrane» header carries a toggle,
// which a `<legend>` could not lay out next to it).

import { AlertTriangle, ChevronDown, Info, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Role } from '@magguarantee/shared';

import { FormMessage } from '@/components/forms/Form';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { LockNotice } from '@/components/ui/LockNotice';
import {
  groupPermissions,
  permissionGroupKey,
  permissionLabelKey,
} from '@/lib/auth/permissionGroups';
import type { Permission } from '@/lib/auth/permissions';
import {
  applyDependents,
  deniedOptions,
  dependentsOf,
  droppedOnRoleChange,
  effectivePreview,
  extraOptions,
  isLiderPermission,
  toggleDenied,
  toggleExtra,
  type OverridesState,
} from '@/lib/users/permissionOverrides';
import { cn } from '@/lib/utils';

const ID = 'user-perms';

const HEADING_FOCUS =
  'rounded-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40';

export type PermissionGroupField = 'extra' | 'denied';

export interface UserPermissionsBlockProps {
  /** The role the block is computed for — `overridesRole(...)` of the current form values. */
  role: Role;
  lider: boolean;
  managedBy: 'local' | 'magspace';
  /** The form's FULL lists (entries the role does not admit included). */
  value: OverridesState;
  onChange: (next: OverridesState, group: PermissionGroupField) => void;
  /** «Odebrane» starts expanded when the stored row has revocations (A.4). */
  initiallyExpanded: boolean;
  /** Localised api refusal under «Dodatkowe» (A.9). */
  extraError?: string;
  /** Localised api refusal under «Odebrane» (A.9). */
  deniedError?: string;
}

export function UserPermissionsBlock({
  role,
  lider,
  managedBy,
  value,
  onChange,
  initiallyExpanded,
  extraError,
  deniedError,
}: UserPermissionsBlockProps) {
  const t = useTranslations('users.permissions');
  const tPerm = useTranslations('permissions');
  const tRoles = useTranslations('roles');
  const locale = useLocale();

  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const extraHeadingRef = useRef<HTMLHeadingElement>(null);
  const deniedHeadingRef = useRef<HTMLHeadingElement>(null);

  const listFormat = useMemo(
    () => new Intl.ListFormat(locale, { type: 'conjunction' }),
    [locale],
  );
  const label = (p: Permission): string => tPerm(permissionLabelKey(p));
  const formatList = (list: readonly Permission[]): string =>
    listFormat.format(list.map(label));

  // A.9 — a refusal moves focus to its group (and opens «Odebrane»).
  useEffect(() => {
    if (extraError) extraHeadingRef.current?.focus();
  }, [extraError]);
  useEffect(() => {
    if (!deniedError) return;
    setExpanded(true);
    deniedHeadingRef.current?.focus();
  }, [deniedError]);

  const roleLabel = tRoles(role);
  const { kept, dropped } = droppedOnRoleChange(role, lider, value);
  const extraOpts = extraOptions(role, lider);
  const deniedOpts = deniedOptions(role, lider);
  const showExtra = extraOpts.length > 0;
  const showDenied = deniedOpts.length > 0;
  const hasDropped = dropped.extra.length > 0 || dropped.denied.length > 0;

  // Admin: no «Dodatkowe», no «Odebrane» → no block, except the drop notice
  // when this edit turns the account into an admin (A.4).
  if (!showExtra && !showDenied && !hasDropped && !extraError && !deniedError) {
    return null;
  }

  const showGroups = showExtra || showDenied;
  const preview = effectivePreview(role, lider, kept);
  const effectiveIds = preview.map((e) => e.permission);
  const isEmpty = !hasDropped && kept.extra.length === 0 && kept.denied.length === 0;

  const onExtraChange = (permission: Permission, checked: boolean) => {
    const result = toggleExtra(value.extra, permission, checked, extraOpts);
    onChange({ extra: result.extra, denied: value.denied }, 'extra');
    setAutoNote(
      result.autoAdded.length > 0
        ? t('extra.autoAdded', { list: formatList(result.autoAdded) })
        : result.autoRemoved.length > 0
          ? t('extra.autoRemoved', { list: formatList(result.autoRemoved) })
          : null,
    );
  };

  const onDeniedChange = (permission: Permission, checked: boolean) => {
    onChange(
      { extra: value.extra, denied: toggleDenied(value.denied, permission, checked) },
      'denied',
    );
  };

  const onApplyDependents = (permission: Permission) => {
    onChange(applyDependents(role, lider, value, permission), 'denied');
  };

  return (
    <section
      aria-labelledby={`${ID}-title`}
      className="mt-2 space-y-4 border-t border-border pt-4"
    >
      <div className="space-y-1">
        <h3
          id={`${ID}-title`}
          className="text-xs font-bold uppercase tracking-wider text-text-sub"
        >
          {t('title')}
        </h3>
        <p className="text-xs text-text-sub">{t('description')}</p>
        {managedBy === 'magspace' && (
          <p className="text-xs text-text-sub">{t('magspaceHint')}</p>
        )}
        {isEmpty && (
          <p className="text-xs text-text-sub">{t('empty', { role: roleLabel })}</p>
        )}
      </div>

      {hasDropped && (
        <LockNotice icon={Info}>
          <p>{t('drop.title')}</p>
          <ul className="mt-1 space-y-0.5">
            {dropped.extra.map((p) => (
              <li key={`extra-${p}`}>
                <del className="text-text-sub">{label(p)}</del>
                {' · '}
                {t('drop.extraTag')}
              </li>
            ))}
            {dropped.denied.map((p) => (
              <li key={`denied-${p}`}>
                <del className="text-text-sub">{label(p)}</del>
                {' · '}
                {t('drop.deniedTag')}
              </li>
            ))}
          </ul>
        </LockNotice>
      )}

      {showExtra && (
        <fieldset
          aria-labelledby={`${ID}-extra-title`}
          aria-describedby={`${ID}-extra-hint`}
          aria-invalid={extraError ? true : undefined}
          className="min-w-0 space-y-1"
        >
          <h4
            id={`${ID}-extra-title`}
            ref={extraHeadingRef}
            tabIndex={-1}
            className={cn('text-sm font-semibold text-text', HEADING_FOCUS)}
          >
            {t('extra.title')}
          </h4>
          <p id={`${ID}-extra-hint`} className="text-xs text-text-sub">
            {t('extra.hint', { role: roleLabel })}
          </p>
          <div>
            {extraOpts.map((p) => (
              <label
                key={p}
                className="flex items-start gap-2 py-1.5 text-sm text-text max-sm:min-h-11"
              >
                <Checkbox
                  className="mt-0.5 shrink-0"
                  checked={kept.extra.includes(p)}
                  onChange={(e) => onExtraChange(p, e.target.checked)}
                />
                <span>{label(p)}</span>
              </label>
            ))}
          </div>
          {/* Always mounted, so the announcement is read when the text appears. */}
          <p aria-live="polite" className="text-xs text-text-sub">
            {autoNote}
          </p>
          <FormMessage>{extraError}</FormMessage>
        </fieldset>
      )}

      {showDenied && (
        <fieldset
          aria-labelledby={`${ID}-denied-title`}
          aria-describedby={
            expanded ? `${ID}-denied-summary ${ID}-denied-hint` : `${ID}-denied-summary`
          }
          aria-invalid={deniedError ? true : undefined}
          className="min-w-0 space-y-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4
                id={`${ID}-denied-title`}
                ref={deniedHeadingRef}
                tabIndex={-1}
                className={cn('text-sm font-semibold text-text', HEADING_FOCUS)}
              >
                {t('denied.title')}
              </h4>
              <p id={`${ID}-denied-summary`} className="text-xs text-text-sub">
                {t('denied.summary', { count: kept.denied.length })}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={`${ID}-denied-list`}
              onClick={() => setExpanded((open) => !open)}
              className="shrink-0 gap-1.5 max-sm:min-h-11"
            >
              {expanded
                ? t('denied.toggleHide')
                : t('denied.toggleShow', { count: deniedOpts.length })}
              <ChevronDown
                size={14}
                aria-hidden
                className={cn('transition-transform', expanded && 'rotate-180')}
              />
            </Button>
          </div>

          {expanded && (
            <div id={`${ID}-denied-list`}>
              <p id={`${ID}-denied-hint`} className="text-xs text-text-sub">
                {t('denied.hint')}
              </p>
              {groupPermissions(deniedOpts).map(({ group, permissions }) => (
                <div key={group}>
                  <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-text-sub">
                    {tPerm(permissionGroupKey(group))}
                  </p>
                  {permissions.map((p) => {
                    const checked = kept.denied.includes(p);
                    const dependents = checked ? dependentsOf(p, effectiveIds) : [];
                    const hintId = `${ID}-dependents-${p}`;
                    return (
                      <div key={p}>
                        <label className="flex items-start gap-2 py-1.5 text-sm text-text max-sm:min-h-11">
                          <Checkbox
                            className="mt-0.5 shrink-0"
                            checked={checked}
                            aria-describedby={dependents.length > 0 ? hintId : undefined}
                            onChange={(e) => onDeniedChange(p, e.target.checked)}
                          />
                          <span>
                            {label(p)}
                            {isLiderPermission(role, p) && (
                              <span className="ml-1 text-xs text-text-sub">
                                {tPerm('liderSuffix')}
                              </span>
                            )}
                          </span>
                        </label>
                        {dependents.length > 0 && (
                          // Not live (A.14): it appears right under the box just ticked.
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1.5 pl-6 text-xs text-warning-dark dark:text-warning">
                            <AlertTriangle size={14} aria-hidden className="shrink-0" />
                            <span id={hintId}>
                              {t('denied.dependentsHint', { list: formatList(dependents) })}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="max-sm:min-h-11"
                              onClick={() => onApplyDependents(p)}
                            >
                              {t('denied.dependentsApply')}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <FormMessage>{deniedError}</FormMessage>
        </fieldset>
      )}

      {/* A refusal for a group this role does not render (e.g. a stale form). */}
      {!showExtra && extraError ? <FormMessage>{extraError}</FormMessage> : null}
      {!showDenied && deniedError ? <FormMessage>{deniedError}</FormMessage> : null}

      {showGroups && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h4 className="text-sm font-semibold text-text">{t('effective.title')}</h4>
            <span aria-live="polite" className="text-xs text-text-sub">
              {t('effective.count', { count: preview.length })}
            </span>
          </div>
          <p className="text-xs text-text-sub">{t('effective.hint')}</p>
          {preview.length === 0 ? (
            <p className="text-xs text-text-sub">{t('effective.none')}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {preview.map(({ permission, source }) => (
                <li key={permission} className="flex">
                  {source === 'extra' ? (
                    <Badge variant="success" className="gap-1">
                      <Plus size={12} aria-hidden />
                      {label(permission)}
                      <span className="sr-only"> ({t('effective.extraAria')})</span>
                    </Badge>
                  ) : (
                    <Badge variant="muted">{label(permission)}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-text-sub">{t('auditNote')}</p>
    </section>
  );
}

export default UserPermissionsBlock;
