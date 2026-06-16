'use client';

// <RowActionsMenu> — a compact kebab («⋮») overflow menu for table row actions.
//
// Replaces a horizontal strip of per-row buttons (Edit / Reset / Deactivate …)
// that overflows the last column once there are ≥3 actions with labels. The
// kebab trigger is a single fixed-width icon button, so the column stays tight
// at every breakpoint; the action labels live inside the menu (no tiny font,
// no clipped buttons). Built on the project's hand-rolled <Popover> (no Radix),
// right-aligned via `align="end"` so it opens leftwards and never spills past
// the table's right edge.
//
// a11y: trigger is `aria-haspopup="menu"` + `aria-expanded`; the panel is
// `role="menu"` with `role="menuitem"` children; first item is focused on open;
// Up/Down/Home/End move focus; Escape + outside-click close (handled by Popover).

import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/Popover';
import { cn } from '@/lib/utils';

export interface RowAction {
  /** Stable key — React key + nothing else. */
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Render in danger tone (e.g. deactivate / delete). */
  destructive?: boolean;
  disabled?: boolean;
}

export interface RowActionsMenuProps {
  actions: RowAction[];
  /** Accessible name for both the trigger and the menu (e.g. «Akcje dla jan»). */
  label: string;
  className?: string;
}

export function RowActionsMenu({
  actions,
  label,
  className,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Focus the first enabled item once the menu paints.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      );
      items?.[0]?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (items.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const idx = items.findIndex((el) => el === current);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Tab':
        // Tabbing out closes the menu (focus moves naturally).
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-[10px]',
            'border border-border bg-transparent text-text transition-colors',
            'hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
            open && 'bg-input',
            className,
          )}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </PopoverAnchor>

      <PopoverContent align="end" className="min-w-[12rem] py-1">
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  close(false);
                  action.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold',
                  'transition-colors focus-visible:outline-none',
                  'hover:bg-input focus-visible:bg-input',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  action.destructive ? 'text-danger' : 'text-text',
                )}
              >
                <Icon size={15} aria-hidden="true" className="shrink-0" />
                {action.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
