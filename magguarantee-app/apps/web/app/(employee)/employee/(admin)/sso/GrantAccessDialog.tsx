'use client';

// «Nadaj dostęp» — the one-step grant for an employee refused at sign-in
// because their stanowisko has no mapped role (docs/24 §10).
//
// The admin picks a role; `POST /sso/access-grants` looks the person up in
// MAGSpace and creates, reactivates or updates a MAGSpace-managed account with
// that role as its hand-granted override. The reconcile then keeps the role but
// still revokes access the day the person leaves.
//
// No role is preselected on purpose: `pracownik`, `weryfikator` and `eksport`
// gate wniosek verification and money, so the choice must never be one
// careless click on a default.

import {
  AssignableRole,
  type SsoAccessDenialDto,
  type SsoAccessGrantOutcome,
} from '@magguarantee/shared';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { ApiResponseError } from '@/lib/api/client';
import { useGrantSsoAccess } from '@/lib/hooks/useSso';

/** Static keys rather than a template string, so next-intl can type-check them. */
const OUTCOME_TOAST = {
  created: 'createdToast',
  reactivated: 'reactivatedToast',
  updated: 'updatedToast',
} as const satisfies Record<SsoAccessGrantOutcome, string>;

interface GrantAccessDialogProps {
  /** Refused sign-in the admin picked, or null when no grant is in progress. */
  target: SsoAccessDenialDto | null;
  /** Clears `target` — called on cancel AND after a successful grant. */
  onClose: () => void;
}

export function GrantAccessDialog({ target, onClose }: GrantAccessDialogProps) {
  const t = useTranslations('sso.denials');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');
  const [role, setRole] = useState<AssignableRole | ''>('');
  const grantM = useGrantSsoAccess();

  // A fresh choice for every person — the role picked for the previous row
  // must not carry over to the next one.
  useEffect(() => {
    if (target) setRole('');
  }, [target]);

  const onConfirm = async () => {
    if (!target || role === '') return;
    try {
      const res = await grantM.mutateAsync({ email: target.email, role });
      toast.success(
        t(OUTCOME_TOAST[res.outcome], {
          login: res.user.login,
          role: tRoles(res.user.role),
        }),
      );
      onClose();
    } catch (err) {
      toast.error(grantErrorMessage(err, t('errorToast')));
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('grantTitle')}</DialogTitle>
          <DialogDescription>
            {target
              ? t('grantDescription', {
                  email: target.email,
                  stanowisko: target.stanowiskoCode ?? t('noStanowisko'),
                })
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label={t('grantRole')} required htmlFor="grant-role">
            <Select
              id="grant-role"
              value={role}
              disabled={grantM.isPending}
              onChange={(e) => setRole(e.target.value as AssignableRole | '')}
            >
              <option value="" disabled>
                {t('grantRolePlaceholder')}
              </option>
              {AssignableRole.options.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="flex items-start gap-2 rounded-[10px] border border-border bg-info-soft px-3.5 py-3 text-[13px] text-text">
            <Info size={16} className="mt-0.5 shrink-0 text-text-sub" aria-hidden />
            <span>{t('grantNote')}</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={grantM.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={role === '' || grantM.isPending}
          >
            {grantM.isPending ? tCommon('saving') : t('grantAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The api words every refusal for a human — MAGSpace down (503), not an
 * employee / terminated (422), account held locally or deleted (409) — so its
 * `detail` goes straight into the toast. A bare 500 has no detail worth showing.
 */
function grantErrorMessage(err: unknown, fallback: string): string {
  if (
    err instanceof ApiResponseError &&
    (err.status < 500 || err.status === 503)
  ) {
    return err.message || fallback;
  }
  return fallback;
}
