import { NextRequest, NextResponse } from 'next/server';
import { LocalAuthAdapter } from '@/lib/auth-adapter';

const auth = new LocalAuthAdapter();

export async function POST(request: NextRequest) {
  try {
    const { email, inviteCode } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    
    // Send magic link (creates user if doesn't exist)
    const result = await auth.sendMagicLink(email);
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Failed to send magic link' 
      }, { status: 500 });
    }
    
    // In development, also return the magic link
    if (process.env.NODE_ENV === 'development' && result.magicLink) {
      console.log('\n🔐 MAGIC LINK (Local Dev)');
      console.log(`Link: ${result.magicLink}\n`);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending magic link:', error);
    return NextResponse.json({ 
      error: 'Failed to send magic link' 
    }, { status: 500 });
  }
}
