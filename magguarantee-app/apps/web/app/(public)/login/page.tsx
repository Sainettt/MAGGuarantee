// /login — step 1 of the auth wizard. Server component renders the
// LoginScreen shell + a client-side <LoginForm> island. Marked with
// `dynamic = 'force-dynamic'` because next-intl's locale-resolution is per
// request and the page also reads cookies through middleware.

import { LoginScreen } from '@/components/auth/LoginScreen';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <LoginScreen>
      <LoginForm />
    </LoginScreen>
  );
}
