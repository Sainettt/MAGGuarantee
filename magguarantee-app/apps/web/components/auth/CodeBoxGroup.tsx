'use client';

// 6-input verification-code group. Owns the UX behavior:
//   * auto-advance focus on input
//   * backspace deletes current then jumps to previous if already empty
//   * arrow-left / arrow-right navigates without modifying values
//   * paste of N digits fills N boxes starting at current
//   * `onComplete(code)` fires once when all 6 boxes hold a digit
//   * shake animation when `error` flips true (driven by parent)
//   * disables every box when `locked` is set (423 lockout)

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

import { cn } from '@/lib/utils';

import { CodeBox } from './CodeBox';

const LENGTH = 6;
const EMPTY: string[] = Array.from({ length: LENGTH }, () => '');

interface CodeBoxGroupProps {
  ariaLabel: string;
  /** Set true after a wrong-code response — triggers shake + paint red. */
  error?: boolean;
  /** Set true after 423 — disables every input. */
  locked?: boolean;
  /** Reset the group to all-empty (e.g. after wrong-code, focus first). */
  resetToken?: number;
  onComplete(code: string): void;
}

export function CodeBoxGroup({
  ariaLabel,
  error,
  locked,
  resetToken,
  onComplete,
}: CodeBoxGroupProps) {
  const [values, setValues] = useState<string[]>(EMPTY);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const completedRef = useRef<string | null>(null);

  const focusIndex = useCallback((i: number) => {
    inputs.current[i]?.focus();
    inputs.current[i]?.select?.();
  }, []);

  // Reset on parent signal — back to empty + focus first.
  useEffect(() => {
    if (resetToken === undefined) return;
    setValues(EMPTY);
    completedRef.current = null;
    requestAnimationFrame(() => focusIndex(0));
  }, [resetToken, focusIndex]);

  // When all six are filled and we haven't already reported this code, fire.
  useEffect(() => {
    if (locked) return;
    const all = values.join('');
    if (all.length === LENGTH && /^\d{6}$/.test(all)) {
      if (completedRef.current !== all) {
        completedRef.current = all;
        onComplete(all);
      }
    } else {
      completedRef.current = null;
    }
  }, [values, locked, onComplete]);

  const setAt = useCallback((i: number, v: string) => {
    setValues((prev) => {
      const next = prev.slice();
      next[i] = v;
      return next;
    });
  }, []);

  const handleChar = useCallback(
    (i: number, char: string) => {
      setAt(i, char);
      if (char && i < LENGTH - 1) focusIndex(i + 1);
    },
    [focusIndex, setAt],
  );

  const handleKeyDown = useCallback(
    (i: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        setValues((prev) => {
          const next = prev.slice();
          if (next[i]) {
            next[i] = '';
          } else if (i > 0) {
            next[i - 1] = '';
            requestAnimationFrame(() => focusIndex(i - 1));
          }
          return next;
        });
        return;
      }
      if (e.key === 'ArrowLeft' && i > 0) {
        e.preventDefault();
        focusIndex(i - 1);
        return;
      }
      if (e.key === 'ArrowRight' && i < LENGTH - 1) {
        e.preventDefault();
        focusIndex(i + 1);
        return;
      }
    },
    [focusIndex],
  );

  const handlePaste = useCallback(
    (i: number, e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text').replace(/\D/g, '');
      if (!text) return;
      e.preventDefault();
      setValues((prev) => {
        const next = prev.slice();
        for (let k = 0; k < text.length && i + k < LENGTH; k++) {
          next[i + k] = text[k] ?? '';
        }
        return next;
      });
      const lastFilled = Math.min(i + text.length - 1, LENGTH - 1);
      requestAnimationFrame(() => focusIndex(lastFilled));
    },
    [focusIndex],
  );

  const indices = useMemo(() => Array.from({ length: LENGTH }, (_, i) => i), []);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex gap-2.5 justify-center',
        error && 'animate-shake',
      )}
    >
      {indices.map((i) => (
        <CodeBox
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          index={i}
          value={values[i] ?? ''}
          filled={!!values[i]}
          error={error}
          locked={locked}
          placeholder="—"
          onChangeChar={(c) => handleChar(i, c)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
        />
      ))}
    </div>
  );
}
