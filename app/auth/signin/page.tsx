import { getDefaultWorkspaceId } from '@/lib/post-login';
import SignInClient from './signin-form';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  const autoJoinEnabled = Boolean(getDefaultWorkspaceId());
  return <SignInClient autoJoinEnabled={autoJoinEnabled} />;
}
