'use client';

// Phase 9 §9.4 Dialog A — admin reset-password confirmation + choice.
//
// Replaces the former one-click `resetM.mutate(row.id)` (a single misclick
// silently regenerated a user's password). This dialog inserts a confirm +
// generate-vs-custom choice BEFORE the mutation. The existing result modal
// (Dialog B, in UsersListView) is kept as the second step.
//
//   * RadioGroup: ⦿ Wygeneruj automatycznie (default) / ⦾ Ustaw własne hasło.
//   * Custom → reveals <PasswordField> + <PasswordPolicyHint>; confirm button
//     is disabled until the custom password passes the shared policy.
//   * Force-change note always shown (mustChangePassword is always set).
//   * Dismissible (Esc / Cancel / outside-click) with NO mutation — safe
//     default; nothing persists until confirm.
//   * Submit sends { mode:'generate' } or { mode:'custom', password }.
//
// Implementation note (deviation): the design references a shadcn
// <RadioGroup>, but this app ships ZERO Radix primitives (the <Dialog> itself
// is hand-rolled). To stay consistent we use native <input type="radio">
// elements sharing a `name` — the browser provides arrow-key navigation and
// the roving-tabindex for free, fully accessible. See Deviations.

import { ResetPasswordModeSchema } from '@magguarantee/shared';
import type { ResetPasswordModeDto, UserDtoFull } from '@magguarantee/shared';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordPolicyHint } from '@/components/auth/PasswordPolicyHint';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { passwordSatisfiesPolicy } from '@/lib/auth/password-policy';
import { cn } from '@/lib/utils';

type Mode = 'generate' | 'custom';

interface ResetPasswordDialogProps {
  /** The user being reset, or null when closed. */
  user: UserDtoFull | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired with the validated payload on confirm. */
  onConfirm: (body: ResetPasswordModeDto) => void;
  /** Disables the footer while the mutation is in flight. */
  pending?: boolean;
}

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: ResetPasswordDialogProps) {
  const t = useTranslations('users.resetDialog');
  const tCommon = useTranslations('common');
  const groupName = useId();

  const [mode, setMode] = useState<Mode>('generate');
  const [password, setPassword] = useState('');
  const customRef = useRef<HTMLInputElement | null>(null);

  // Reset internal state whenever the dialog (re)opens for a fresh target.
  useEffect(() => {
    if (open) {
      setMode('generate');
      setPassword('');
    }
  }, [open, user?.id]);

  // Auto-focus the custom field the moment the option is picked.
  useEffect(() => {
    if (mode === 'custom') {
      requestAnimationFrame(() => customRef.current?.focus());
    }
  }, [mode]);

  const customValid = mode === 'custom' ? passwordSatisfiesPolicy(password) : true;
  const confirmDisabled = pending || (mode === 'custom' && !customValid);

  const submit = () => {
    if (confirmDisabled) return;
    const body: ResetPasswordModeDto =
      mode === 'custom'
        ? { mode: 'custom', password }
        : { mode: 'generate' };
    // Validate against the shared schema before firing (defense in depth —
    // matches what the API enforces; rejects e.g. an under-length custom pwd).
    const parsed = ResetPasswordModeSchema.safeParse(body);
    if (!parsed.success) return;
    onConfirm(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t.rich('description', {
              login: user?.login ?? '',
              strong: (chunks) => (
                <span className="font-mono font-semibold text-text">
                  {chunks}
                </span>
              ),
            })}
          </DialogDescription>
        </DialogHeader>

        <fieldset
          className="space-y-2"
          // First focus lands on the radio group (§8.5) — the dialog's
          // focus-trap focuses the first focusable element, which is the
          // first radio below.
        >
          <legend className="sr-only">{t('title')}</legend>

          <RadioCard
            name={groupName}
            checked={mode === 'generate'}
            onChange={() => setMode('generate')}
            label={t('optionAuto')}
          />
          <RadioCard
            name={groupName}
            checked={mode === 'custom'}
            onChange={() => setMode('custom')}
            label={t('optionCustom')}
          />
        </fieldset>

        {mode === 'custom' && (
          <div className="mt-3">
            <PasswordField
              ref={customRef}
              label={t('optionCustom')}
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <PasswordPolicyHint value={password} />
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-xs text-text-sub">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t('forceNote')}</span>
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={submit}
            disabled={confirmDisabled}
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Radio-card option — a styled native radio. Sharing `name` gives browser-native
// arrow-key navigation + roving tabindex (a11y for free).
function RadioCard({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 cursor-pointer transition-colors',
        'focus-within:ring-[3px] focus-within:ring-brand/30',
        checked
          ? 'border-brand bg-brand/5'
          : 'border-border hover:bg-input',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-brand"
      />
      <span className="text-sm font-semibold text-text">{label}</span>
    </label>
  );
}
