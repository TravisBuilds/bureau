import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    
    if (!code) {
      return NextResponse.json({ error: 'Invite code required' }, { status: 400 });
    }
    
    // Check if invite exists and is valid
    const invite = await query<{ 
      code: string; 
      claimed_by: string | null;
      expires_at: Date;
    }>(
      `SELECT code, claimed_by, expires_at 
       FROM pilot_invites
       WHERE code = $1 AND expires_at > NOW() AND claimed_by IS NULL`,
      [code]
    );
    
    if (invite.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid or expired invite code',
        valid: false 
      }, { status: 400 });
    }
    
    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error('Error validating invite:', error);
    return NextResponse.json({ 
      error: 'Failed to validate invite code' 
    }, { status: 500 });
  }
}
