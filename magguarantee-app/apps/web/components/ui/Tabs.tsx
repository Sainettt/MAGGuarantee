'use client';

// Minimal tabs primitive. Phase 4 introduces this for the
// `<ClaimVerificationModal>` (Edit / Historia / Autoryzacja). We mirror the
// shadcn API shape (`Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`)
// without pulling Radix — a controlled state + a context is enough for our
// three-tab modal.
//
// A11y: `role="tablist"` + `role="tab"` + `role="tabpanel"`, with
// `aria-selected` / `aria-controls` / `tabIndex` wired so keyboard users
// get the standard tab-roving behavior. Arrow-key navigation between tabs
// is implemented inline (Left/Right / Home/End).

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
  values: string[];
  registerValue: (v: string) => void;
}

const TabsContext = createContext<TabsCtx | null>(null);

function useTabs(): TabsCtx {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs subcomponents must be used inside <Tabs>');
  return ctx;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  children: ReactNode;
}

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const value = controlledValue ?? internal;
  const baseId = useId();
  const [values, setValues] = useState<string[]>([]);

  const setValue = useCallback(
    (v: string) => {
      if (controlledValue === undefined) setInternal(v);
      onValueChange?.(v);
    },
    [controlledValue, onValueChange],
  );

  const registerValue = useCallback((v: string) => {
    setValues((prev) => (prev.includes(v) ? prev : [...prev, v]));
  }, []);

  const ctxValue = useMemo<TabsCtx>(
    () => ({ value, setValue, baseId, values, registerValue }),
    [value, setValue, baseId, values, registerValue],
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-border',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
}

export function TabsTrigger({
  value,
  className,
  children,
  onKeyDown,
  ...props
}: TabsTriggerProps) {
  const { value: active, setValue, baseId, values, registerValue } = useTabs();

  // Register on first render so arrow navigation knows the order.
  if (!values.includes(value)) registerValue(value);

  const selected = active === value;

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const idx = values.indexOf(value);
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % values.length;
    else if (e.key === 'ArrowLeft')
      next = (idx - 1 + values.length) % values.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = values.length - 1;
    const nextVal = values[next];
    if (nextVal !== undefined) setValue(nextVal);
  };

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-trigger-${value}`}
      aria-controls={`${baseId}-panel-${value}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => setValue(value)}
      onKeyDown={handleKey}
      className={cn(
        'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
        selected
          ? 'border-brand text-brand'
          : 'border-transparent text-text-sub hover:text-text',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { value: active, baseId } = useTabs();
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-trigger-${value}`}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
      {...props}
    >
      {children}
    </div>
  );
}
