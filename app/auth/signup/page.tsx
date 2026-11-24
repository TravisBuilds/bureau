'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [signInUrl, setSignInUrl] = useState('');

  // /auth/callback sends signed-in users with no workspace here (?error=invite-required).
  // Without this they saw the blank sign-up form with no explanation.
  useEffect(() => {
    if (searchParams.get('error') === 'invite-required') {
      setError(
        "You're signed in, but this email isn't a member of a Bureau workspace yet. " +
        'Enter your invite code below, then open the new magic link in this same browser.'
      );
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSignInUrl('');
    
    try {
      // Validate invite code
      const validateResponse = await fetch('/api/auth/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode }),
      });
      
      if (!validateResponse.ok) {
        const data = await validateResponse.json();
        setError(data.error || 'Invalid invite code');
        // Bot-connect code typed into the invite box: offer the sign-in link that keeps it
        if (data.isDeviceCode && typeof data.signInUrl === 'string' && data.signInUrl.startsWith('/auth/signin')) {
          setSignInUrl(data.signInUrl);
        }
        setLoading(false);
        return;
      }
      
      // Send magic link
      const authResponse = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inviteCode }),
      });
      
      if (!authResponse.ok) {
        const data = await authResponse.json();
        setError(data.error || 'Failed to send magic link');
        setLoading(false);
        return;
      }
      
      setSent(true);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-highstreet-purple/5 via-white to-highstreet-pink/5 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-600 mb-6">
            We sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-slate-500">
            Click the link in the email to sign in. The link expires in 10 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-highstreet-purple/5 via-white to-highstreet-pink/5 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Welcome to Bureau</h1>
          <p className="text-slate-600">Your team's command center: what needs you today, and what your agents can handle.</p>
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Join Bureau</h2>
            <button
              type="button"
              onClick={() => router.push('/auth/signin')}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Sign in
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple/50"
              required
              disabled={loading}
            />
          </div>
          
          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-slate-700 mb-1">
              Invite code
            </label>
            <input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="BUREAU_PILOT_001"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple/50 font-mono"
              required
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
              {signInUrl && (
                <a href={signInUrl} className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
                  Sign in and connect this bot
                </a>
              )}
            </div>
          )}
          
          <button
            type="submit"
            className="w-full px-4 py-3 bg-highstreet-purple text-white rounded-lg font-medium hover:bg-highstreet-purple/90 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </form>
        
          <div className="mt-6 text-center text-sm text-slate-500">
            <p>
              Pilot access only. Free: 2 streams, manual cost ledger.
              <br />
              Plus ($9/mo): unlimited streams, API connectors.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SignUpForm />
    </Suspense>
  );
}
