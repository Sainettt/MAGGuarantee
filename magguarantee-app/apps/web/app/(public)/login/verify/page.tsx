import { LoginScreen } from '@/components/auth/LoginScreen';
import { VerifyForm } from './VerifyForm';

export const dynamic = 'force-dynamic';

export default function VerifyPage() {
  return (
    <LoginScreen>
      <VerifyForm />
    </LoginScreen>
  );
}
