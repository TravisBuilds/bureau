'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to /connect
export default function OnboardingV2Redirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/connect');
  }, [router]);
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to connect...</p>
      </div>
    </div>
  );
}
