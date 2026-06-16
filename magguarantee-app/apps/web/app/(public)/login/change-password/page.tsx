// /login/change-password — Phase 9 §9.3 forced-change interstitial.
//
// Shown post-2FA when the session carries mustChangePassword=true (set on every
// admin-issued password). NON-DISMISSIBLE: no ✕, no app nav, Esc no-op — the
// only escape hatch is "Wyloguj się". The gate is enforced server-side by the
// middleware (which re-redirects any gated path here while the flag holds); this
// page renders nothing but the form so the UI presents no escape to the app.

import { LoginScreen } from '@/components/auth/LoginScreen';
import { ChangePasswordForm } from './ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default function ChangePasswordPage() {
  return (
    <LoginScreen>
      <ChangePasswordForm />
    </LoginScreen>
  );
}
