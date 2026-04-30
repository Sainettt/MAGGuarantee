'use client';

// Step 2 client island: 6-digit verification code form. Pulls
// `{sessionToken, maskedEmail}` from sessionStorage; if absent, sends the
// user back to /login. Auto-submits when the 6th digit is entered.
//
// State machine after submit:
//   200 → cookies set by API → query /me invalidate → router.push(role-landing)
//   401 (Invalid code) → shake + LoginError "wrong" with attemptsLeft
//   401 (other, e.g. expired session) → LoginError "wrong" + reset
//   423 (locked) → LoginError "locked" + live mm:ss countdown
//   429 (resend cooldown) → start cooldown on resend button
//   network error → LoginError "network"

import { useQueryClient } from '@tanstack/react-query';
import type { Role, UserDto } from '@magguarantee/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CodeBoxGroup } from '@/components/auth/CodeBoxGroup';
import { EmailHintBanner } from '@/components/auth/EmailHintBanner';
import { LoginCard } from '@/components/auth/LoginCard';
import { LoginError, type LoginErrorVariant } from '@/components/auth/LoginError';
import { ResendButton, type ResendButtonHandle } from '@/components/auth/ResendButton';
import { Button } from '@/components/ui/Button';
import { resendCode, verifyCode } from '@/lib/api/auth';
import { ApiResponseError } from '@/lib/api/client';
import { ME_QUERY_KEY } from '@/lib/hooks/useAuth';
import { landingFor } from '@/lib/roles';

import {
  clearLoginSession,
  readLoginSession,
  type LoginSessionState,
} from '../session-storage';

// ── Helpers ─────────────────────────────────────────────────────

function getNumber(data: unknown, key: string): number | null {
  if (!data || typeof data !== 'object') return null;
  const v = (data as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// ── Component ───────────────────────────────────────────────────

export function VerifyForm() {
  const t = useTranslations('verify');
  const router = useRouter();
  const qc = useQueryClient();

  const [session, setSession] = useState<LoginSessionState | null>(null);
  const [errVariant, setErrVariant] = useState<LoginErrorVariant>('idle');
  const [errMessage, setErrMessage] = useState<string | undefined>(undefined);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const resendBtn = useRef<ResendButtonHandle | null>(null);

  // ── Bootstrap: pull session, otherwise punt back to step 1.

  useEffect(() => {
    const s = readLoginSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSession(s);
    // Initial 60s cooldown so the user can't immediately spam resend.
    requestAnimationFrame(() => resendBtn.current?.start(60));
  }, [router]);

  // Tick once a second while the lockout is active so the mm:ss countdown
  // re-renders. We stop ticking when the lockout is cleared.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // Auto-clear lock when countdown hits 0 — moves the user back to /login.
  useEffect(() => {
    if (lockedUntil && now >= lockedUntil) {
      setLocked(false);
      setLockedUntil(null);
      setErrVariant('idle');
      setErrMessage(undefined);
      // Force the user to start from /login (their session token is dead).
      clearLoginSession();
      router.replace('/login');
    }
  }, [now, lockedUntil, router]);

  // ── Submit handler ────────────────────────────────────────────

  const onComplete = useCallback(
    async (code: string) => {
      if (!session || isVerifying || locked) return;
      setIsVerifying(true);
      setErrVariant('idle');
      setErrMessage(undefined);
      try {
        const res = await verifyCode({
          sessionToken: session.sessionToken,
          code,
        });
        const user: UserDto = res.user;
        // Prime cache so the role landing renders without a /me round-trip.
        qc.setQueryData(ME_QUERY_KEY, user);
        clearLoginSession();
        const role = user.role as Role;
        router.replace(landingFor(role));
      } catch (err) {
        if (err instanceof ApiResponseError) {
          if (err.status === 423) {
            const lockedForSec = getNumber(err.data, 'lockedForSec') ?? 300;
            setLocked(true);
            setLockedUntil(Date.now() + lockedForSec * 1000);
            setErrVariant('locked');
            // message gets recomputed every tick via render below
          } else if (err.status === 401) {
            const attemptsLeft = getNumber(err.data, 'attemptsLeft');
            setErrVariant('wrong');
            setErrMessage(
              attemptsLeft != null && attemptsLeft >= 0
                ? t('errorWrong', { attemptsLeft })
                : t('errorExpired'),
            );
            // reset boxes + refocus first
            setResetToken((n) => n + 1);
          } else {
            setErrVariant('network');
            setErrMessage(t('errorNetwork'));
          }
        } else {
          setErrVariant('network');
          setErrMessage(t('errorNetwork'));
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [session, isVerifying, locked, qc, router, t],
  );

  // ── Resend ────────────────────────────────────────────────────

  const onResend = useCallback(async () => {
    if (!session || isResending || locked) return;
    setIsResending(true);
    try {
      const res = await resendCode({ sessionToken: session.sessionToken });
      resendBtn.current?.start(res.cooldownSec);
      // refresh createdAt so the wizard's 10-min idle window resets
      const fresh = { ...session, createdAt: Date.now() };
      setSession(fresh);
      sessionStorage.setItem('mt_login_session', JSON.stringify(fresh));
      setResetToken((n) => n + 1);
      setErrVariant('idle');
      setErrMessage(undefined);
      toast.success(t('resendSuccess'));
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 429) {
          const cooldownSec = getNumber(err.data, 'cooldownSec') ?? 60;
          resendBtn.current?.start(cooldownSec);
          toast.warning(t('resendCooldown', { seconds: cooldownSec }));
        } else if (err.status === 423) {
          const lockedForSec = getNumber(err.data, 'lockedForSec') ?? 300;
          setLocked(true);
          setLockedUntil(Date.now() + lockedForSec * 1000);
          setErrVariant('locked');
        } else if (err.status === 401) {
          // Session expired — back to step 1.
          clearLoginSession();
          router.replace('/login');
        } else {
          setErrVariant('network');
          setErrMessage(t('errorNetwork'));
        }
      } else {
        setErrVariant('network');
        setErrMessage(t('errorNetwork'));
      }
    } finally {
      setIsResending(false);
    }
  }, [session, isResending, locked, router, t]);

  // ── Render ────────────────────────────────────────────────────

  if (!session) return null;

  const lockedRemainingSec = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil - now) / 1000))
    : 0;
  const lockedMessage =
    errVariant === 'locked'
      ? t('errorLocked', { time: formatMmSs(lockedRemainingSec) })
      : undefined;

  const finalMessage =
    errVariant === 'locked' ? lockedMessage : errMessage;

  return (
    <LoginCard title={t('title')} subtitle={t('subtitle')}>
      <EmailHintBanner
        intro={t('sentTo')}
        maskedEmail={session.maskedEmail}
        lifetime={t('codeLifetime')}
      />

      <div className="mb-4 text-center text-[12px] font-bold uppercase tracking-[0.5px] text-text-sub">
        {t('codeLabel')}
      </div>

      <CodeBoxGroup
        ariaLabel={t('codeLabel')}
        error={errVariant === 'wrong'}
        locked={locked}
        resetToken={resetToken}
        onComplete={onComplete}
      />

      <Button
        type="button"
        size="lg"
        className="w-full mt-6"
        disabled={isVerifying || locked}
        onClick={() => {
          // Manual submit just refocuses the first empty box — completion
          // handler is driven by CodeBoxGroup's auto-submit. If the user has
          // typed all six but somehow we got out of sync, this is a no-op.
        }}
      >
        {isVerifying ? t('submitting') : t('submit')}
      </Button>

      <LoginError variant={errVariant} message={finalMessage} />

      <div className="mt-4 flex items-center justify-center gap-4">
        <ResendButton
          ref={resendBtn}
          busy={isResending}
          onResend={onResend}
        />
        <button
          type="button"
          onClick={() => {
            clearLoginSession();
            router.replace('/login');
          }}
          className="text-[13px] text-text-sub hover:text-text inline-flex items-center gap-1 transition-colors"
        >
          {t('back')}
        </button>
      </div>
    </LoginCard>
  );
}
