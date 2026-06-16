// /login/forgot — Phase 9 §9.1–9.2 password-reset flow. Server component
// renders the LoginScreen shell + the client <ForgotPasswordFlow> island,
// which owns the three-step state machine (request → sent → enter-code).
// `force-dynamic` for the same per-request locale / cookie reasons as /login.

import { LoginScreen } from '@/components/auth/LoginScreen';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <LoginScreen>
      <ForgotPasswordFlow />
    </LoginScreen>
  );
}
