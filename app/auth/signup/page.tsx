import { redirect } from 'next/navigation';
import { getDefaultWorkspaceId } from '@/lib/post-login';
import SignUpForm from './signup-form';

export const dynamic = 'force-dynamic';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (getDefaultWorkspaceId()) {
    const params = await searchParams;
    const next = params?.next;
    redirect(next ? `/auth/signin?next=${encodeURIComponent(next)}` : '/auth/signin');
  }
  return <SignUpForm />;
}
