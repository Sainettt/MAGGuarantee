'use client';

// cmdk-based command primitive — the accessible listbox engine behind
// <MultiSelect>. The project has no shadcn CLI wired up (see Sheet.tsx /
// Dialog.tsx comments), so this file is authored directly rather than
// generated. It mirrors the shadcn `command` component surface
// (Command / CommandInput / CommandList / CommandEmpty / CommandGroup /
// CommandItem) so a future swap to the generated version is mechanical.
//
// Why cmdk and not a hand-rolled <div> list: docs/14 § Phase 5 requires real
// `role="listbox"` semantics — type-ahead, arrow-key nav, `aria-selected` —
// and explicitly bans hand-rolling that. cmdk is a small standalone library
// (not Radix Dialog) and is the same engine shadcn's own combobox uses.

import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded bg-card text-text',
        className,
      )}
      {...props}
    />
  );
});

export const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(function CommandInput({ className, ...props }, ref) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border px-3"
      cmdk-input-wrapper=""
    >
      <Search size={14} className="shrink-0 text-text-sub" aria-hidden />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-9 w-full bg-transparent py-2 text-sm text-text outline-none',
          'placeholder:text-text-sub disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
});

export const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-64 overflow-y-auto overflow-x-hidden p-1', className)}
      {...props}
    />
  );
});

export const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className={cn('py-6 text-center text-sm text-text-sub', className)}
      {...props}
    />
  );
});

export const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn('overflow-hidden text-text', className)}
      {...props}
    />
  );
});

export const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
        // cmdk marks the keyboard-active row with data-selected; hover uses
        // the DataTable row-hover token so the two read the same.
        'data-[selected=true]:bg-brand-50 dark:data-[selected=true]:bg-brand/10',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
