'use client';

// Phase 4.5 — admin user autocomplete for the audit-log filter bar.
//
// Backed by `/lookups/users?q=...` (admin only). Debounces the query 250ms,
// shows up to 100 rows in a popover anchored to the trigger button. The
// component is a controlled `value` (userId | null) — the consumer holds
// the selected id and re-renders the label here.
//
// Design choice: rather than another fully-custom dropdown, we lean on the
// existing `<Popover>` primitive (already used by MultiSelect) and keep the
// list rendering small and inline. A future iteration could promote this
// to a generic `<Autocomplete>` once the audit screen surfaces second use.

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { LookupUserAdminDto } from '@magguarantee/shared';

import { Input } from '@/components/ui/Input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/Popover';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useLookupUsersAdmin } from '@/lib/hooks/useAudit';
import { cn } from '@/lib/utils';

interface UserAutocompleteProps {
  value: string | null;
  selectedUser: LookupUserAdminDto | null;
  onChange: (user: LookupUserAdminDto | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function UserAutocomplete({
  value,
  selectedUser,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: UserAutocompleteProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 250);
  const { data, isLoading } = useLookupUsersAdmin(debounced);

  // Reset query input whenever the popover closes — next open starts clean.
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const items = useMemo<LookupUserAdminDto[]>(() => data ?? [], [data]);

  const label = selectedUser
    ? selectedUser.name
      ? `${selectedUser.login} (${selectedUser.name})`
      : selectedUser.login
    : (placeholder ?? t('audit.filters.userPlaceholder'));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor>
        <div className={cn('flex items-center gap-2', className)}>
          <button
            type="button"
            aria-label={ariaLabel ?? t('audit.filters.userPlaceholder')}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-[10px] bg-input px-3 text-[14px]',
              'border border-border text-left',
              'focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15 dark:focus:ring-brand/25',
              value === null && 'text-text-sub',
            )}
          >
            <span className="truncate">{label}</span>
            <Search size={14} className="text-text-sub" aria-hidden />
          </button>
          {value !== null && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={t('common.clear')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-sub hover:text-text hover:bg-input"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-2"
      >
        <Input
          type="search"
          autoFocus
          placeholder={t('audit.filters.userSearchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2"
        />
        <ul
          className="max-h-72 overflow-y-auto"
          role="listbox"
          aria-label={ariaLabel ?? t('audit.filters.userPlaceholder')}
        >
          {isLoading && (
            <li className="px-2 py-2 text-sm text-text-sub">
              {t('common.loading')}
            </li>
          )}
          {!isLoading && items.length === 0 && (
            <li className="px-2 py-2 text-sm text-text-sub">
              {t('audit.filters.userNoResults')}
            </li>
          )}
          {!isLoading &&
            items.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === u.id}
                  onClick={() => {
                    onChange(u);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm',
                    'hover:bg-input transition-colors',
                    value === u.id && 'bg-brand-50 dark:bg-brand/15 text-brand',
                  )}
                >
                  <span className="flex flex-col text-left">
                    <span className="font-mono text-text">{u.login}</span>
                    {u.name && (
                      <span className="text-xs text-text-sub">{u.name}</span>
                    )}
                  </span>
                  <span className="text-xs text-text-sub">
                    {t(`roles.${u.role}`)}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
