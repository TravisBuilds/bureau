import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import TopFloorPageContent from './page-content';

export default async function TopFloorPage() {
  // Check authentication
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    // Production: check Supabase session
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      redirect('/auth/signin');
    }
  } else {
    // Local dev: check bureau_session cookie
    const cookieStore = await cookies();
    const session = cookieStore.get('bureau_session');
    
    if (!session) {
      redirect('/auth/signin');
    }
  }

  return <TopFloorPageContent />;
}
