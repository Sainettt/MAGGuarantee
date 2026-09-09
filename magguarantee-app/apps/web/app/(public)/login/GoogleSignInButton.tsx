'use client';

// "Zaloguj przez Google" on the login screen (docs/24 §A3).
//
// Google Identity Services runs the whole flow in the browser and hands us a
// signed `id_token`; the api verifies it and sets the same cookies a completed
// 2FA would. There is no redirect, no `state`, no callback route.
//
// Three things about this component are deliberate:
//
//   * **It renders nothing without a client id.** `NEXT_PUBLIC_*` is baked in
//     at BUILD time, so an image built without the id genuinely cannot do
//     Google sign-in — showing a button that always 503s would be worse than
//     showing none.
//   * **The script is loaded, not bundled.** GIS refuses to work from a copy;
//     it must come from accounts.google.com. `next/script` with
//     `afterInteractive` keeps it off the critical path. No CSP is configured
//     in `next.config.mjs`, so nothing else is needed.
//   * **On success it does a FULL page navigation**, exactly as
//     `VerifyForm` does — see the comment at the redirect below.

import { useTranslations } from 'next-intl';
import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { loginWithGoogle } from '@/lib/api/auth';
import { ApiResponseError } from '@/lib/api/client';
import { resolveNext } from '@/lib/roles';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Minimal shape of the GIS surface we use. */
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: Record<string, string | number>,
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

/**
 * Maps an api refusal onto a localised message. Every branch reads
 * `extensions.code` — the same convention the carrier screens use — never the
 * human `detail`, which is a fallback for logs and not a contract.
 */
function useSsoErrorMessage(): (err: unknown) => string {
  const t = useTranslations('login.sso');
  return useCallback(
    (err: unknown): string => {
      if (!(err instanceof ApiResponseError)) return t('errorNetwork');
      const extensions = (err.data as { extensions?: unknown } | undefined)?.extensions;
      const code =
        extensions && typeof extensions === 'object'
          ? (extensions as { code?: unknown }).code
          : undefined;
      switch (code) {
        case 'SSO_DOMAIN_NOT_ALLOWED':
          return t('errorDomain');
        case 'SSO_NOT_EMPLOYEE':
          return t('errorNotEmployee');
        case 'SSO_INACTIVE':
          return t('errorInactive');
        case 'SSO_NO_ROLE':
          return t('errorNoRole');
        case 'SSO_NOT_FOR_CARRIER':
          return t('errorCarrier');
        case 'SSO_DIRECTORY_UNAVAILABLE':
        case 'SSO_NOT_CONFIGURED':
          return t('errorUnavailable');
        default:
          return t('errorNetwork');
      }
    },
    [t],
  );
}

export function GoogleSignInButton({
  next,
  onError,
  onBusyChange,
}: {
  /** `?next=` from the middleware redirect; validated against the role after login. */
  next: string | null;
  onError: (message: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations('login.sso');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  const containerId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const toMessage = useSsoErrorMessage();

  // Everything the GIS callback closes over goes through a ref.
  //
  // Two reasons, and both bite. The callback is registered ONCE with Google, so
  // a stale closure over `next` would send someone to the wrong page after
  // login. And the parent passes `onError` as an inline arrow, whose identity
  // changes on every render — if the effect below depended on it directly,
  // typing in the password field would tear down and re-render the Google
  // iframe on every keystroke.
  const nextRef = useRef(next);
  nextRef.current = next;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const toMessageRef = useRef(toMessage);
  toMessageRef.current = toMessage;

  const handleCredential = useCallback(async (credential: string) => {
    onErrorRef.current(null);
    onBusyChangeRef.current(true);
    try {
      const { user } = await loginWithGoogle(credential);
      // FULL navigation, not `router.replace` — the client router cache
      // otherwise replays a stale RSC payload whose `redirect('/login')` puts
      // the user straight back on this screen. Same reasoning, and the same
      // fix, as VerifyForm.
      window.location.assign(resolveNext(nextRef.current, user.role));
    } catch (err) {
      onErrorRef.current(toMessageRef.current(err));
      onBusyChangeRef.current(false);
    }
  }, []);

  useEffect(() => {
    if (!clientId || !scriptReady || !containerRef.current) return;
    const gis = window.google;
    if (!gis) return;

    gis.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          onErrorRef.current(t('errorNetwork'));
          return;
        }
        void handleCredential(response.credential);
      },
      // No One Tap: this is an explicit button on a login screen, and an
      // auto-selected account is a surprising way to change who you are.
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    gis.accounts.id.renderButton(containerRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      // GIS renders into an iframe of a fixed pixel width; the card is 420px
      // wide with 32px of padding, so 356 fills it without overflowing.
      width: 356,
    });
    // Deliberately narrow: only these three can change what is rendered.
    // `handleCredential` is stable, and the callbacks are read through refs.
  }, [clientId, scriptReady, handleCredential, t]);

  // Nothing to render — this build has no Google client id.
  if (!clientId) return null;

  return (
    <div className="space-y-4">
      <Script
        src={GIS_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => onErrorRef.current(t('errorScript'))}
      />
      {/* GIS replaces the contents of this node with its own iframe. */}
      <div
        id={containerId}
        ref={containerRef}
        className="flex justify-center min-h-[44px]"
      />
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-sub">
          {t('divider')}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
