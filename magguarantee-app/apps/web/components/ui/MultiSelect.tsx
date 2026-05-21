'use client';

// <MultiSelect> — reusable "pick many from a list" control.
// docs/14 § Phase 5.2. Built on <Popover> + <Command> (cmdk) so the open
// list has real listbox semantics (arrow-key nav, type-ahead, aria-selected).
//
// Generic: it knows nothing about countries. The «Kraje» field in the vehicle
// Sheet is just <MultiSelect options={countryOptions} … />. Any future
// multi-pick field reuses it.
//
// Selected values render two synced ways: removable chips inside the closed
// trigger, and ticked rows in the open list. Removing works via the chip `x`,
// via un-ticking a row, and (nice-to-have) via Backspace on an empty search.

import { Check, ChevronDown, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/Popover';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  /** Caller-supplied, already-localised options. Sorted by label unless
   *  `sort={false}`. */
  options: MultiSelectOption[];
  /** Selected `value`s. */
  value: string[];
  /** Emits the next array on toggle / remove. */
  onChange: (next: string[]) => void;
  /** Sort options alphabetically by localised label. Default `true`. */
  sort?: boolean;
  disabled?: boolean;
  /** Closed-trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Popover search-field placeholder. */
  searchPlaceholder?: string;
  /** Shown when the search yields no matches. */
  emptyText?: string;
  /** Per-chip remove-button aria-label builder. */
  removeAriaLabel?: (label: string) => string;
  /** Visually-hidden SR summary, e.g. "Selected 3". */
  selectionSummary?: (count: number) => string;
  /** Wired to the field for htmlFor / aria. */
  id?: string;
  /** Mirrors RHF onBlur so the field registers as touched. */
  onBlur?: () => void;
}

export function MultiSelect({
  options,
  value,
  onChange,
  sort = true,
  disabled = false,
  placeholder,
  searchPlaceholder,
  emptyText,
  removeAriaLabel,
  selectionSummary,
  id,
  onBlur,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const listId = useId();

  const sortedOptions = useMemo(() => {
    if (!sort) return options;
    return [...options].sort((a, b) => a.label.localeCompare(b.label));
  }, [options, sort]);

  // Selected chips follow the (sorted) option order so they don't jump
  // around as the user picks.
  const selectedOptions = useMemo(
    () => sortedOptions.filter((o) => value.includes(o.value)),
    [sortedOptions, value],
  );

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const removeLast = () => {
    if (value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSearch('');
      onBlur?.();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-label={
            selectionSummary ? selectionSummary(value.length) : undefined
          }
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={cn(
            'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[10px]',
            'border border-border bg-input px-2 py-1.5 text-sm text-left',
            'cursor-pointer transition-colors',
            'hover:border-brand-200',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            open && 'border-brand',
            disabled && 'cursor-not-allowed opacity-50 hover:border-border',
          )}
        >
          {selectedOptions.length === 0 ? (
            <span className="text-text-sub">{placeholder}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className={cn(
                  'inline-flex items-center gap-1 rounded-sm border border-border',
                  'bg-card pl-2 pr-1 py-0.5 text-xs font-medium text-text',
                )}
              >
                <span className="whitespace-nowrap">{opt.label}</span>
                <span
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-label={
                    removeAriaLabel
                      ? removeAriaLabel(opt.label)
                      : `Remove ${opt.label}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!disabled) toggle(opt.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!disabled) toggle(opt.value);
                    }
                  }}
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full',
                    'text-text-sub hover:bg-danger-bg hover:text-danger',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                  )}
                >
                  <X size={12} aria-hidden />
                </span>
              </span>
            ))
          )}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              'ml-auto shrink-0 text-text-sub transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverAnchor>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          // Disable cmdk's default filter substitution — we filter via the
          // built-in `value` matching; cmdk handles the search input → list
          // narrowing internally when `shouldFilter` is left on (default).
          loop
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              // Backspace on an empty search removes the last-added chip
              // (combobox convention).
              if (e.key === 'Backspace' && search === '') {
                removeLast();
              }
            }}
          />
          <CommandList id={listId}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {sortedOptions.map((opt) => {
                const checked = value.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => toggle(opt.value)}
                    aria-selected={checked}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                        checked
                          ? 'border-brand bg-brand text-white'
                          : 'border-border bg-input',
                      )}
                    >
                      {checked && <Check size={12} />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
