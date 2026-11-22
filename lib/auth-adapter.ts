/**
 * Bureau Auth Adapter
 * 
 * Abstracts auth behind an adapter interface.
 * Local dev: email magic links logged to console, sessions in our DB
 * Production: Supabase Auth
 */

import crypto from 'crypto';
import { query, execute } from './db';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

/**
 * Local development auth implementation
 * Magic links logged to console, sessions in database
 */
export class LocalAuthAdapter {
  /**
   * Send magic link (logs to console in dev)
   */
  async sendMagicLink(email: string): Promise<{ success: boolean; magicLink?: string }> {
    // Find or create user
    let users = await query<{ id: string; email: string }>(
      'SELECT id, email FROM auth.users WHERE email = $1',
      [email]
    );
    let user = users[0];

    if (!user) {
      // Create new user
      const result = await query<{ id: string; email: string }>(
        'INSERT INTO auth.users (email) VALUES ($1) RETURNING id, email',
        [email]
      );
      user = result[0];
    }

    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store session
    await execute(
      'INSERT INTO auth.sessions (user_id, token, expires_at) VALUES ($1::uuid, $2, $3)',
      [user.id, token, expiresAt]
    );

    const magicLink = `http://localhost:3000/auth/verify?token=${token}`;

    // Log to console (dev only)
    console.log('\n' + '='.repeat(80));
    console.log('🔐 MAGIC LINK (Local Dev)');
    console.log('='.repeat(80));
    console.log(`To: ${email}`);
    console.log(`Link: ${magicLink}`);
    console.log(`Expires: ${expiresAt.toLocaleString()}`);
    console.log('='.repeat(80) + '\n');

    return { success: true, magicLink };
  }

  /**
   * Verify magic link token
   */
  async verifyToken(token: string): Promise<AuthSession | null> {
    const result = await query<{
      session_id: string;
      user_id: string;
      email: string;
      expires_at: Date;
    }>(
      `SELECT s.id as session_id, s.user_id, u.email, s.expires_at
       FROM auth.sessions s
       JOIN auth.users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (result.length === 0) {
      return null;
    }

    const session = result[0];

    return {
      user: {
        id: session.user_id,
        email: session.email,
        createdAt: new Date(),
      },
      token,
      expiresAt: session.expires_at,
    };
  }

  /**
   * Get session by token
   */
  async getSession(token: string): Promise<AuthSession | null> {
    return this.verifyToken(token);
  }

  /**
   * Create session (for OAuth or other flows)
   */
  async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await execute(
      'INSERT INTO auth.sessions (user_id, token, expires_at) VALUES ($1::uuid, $2, $3)',
      [userId, token, expiresAt]
    );

    return { token, expiresAt };
  }

  /**
   * Delete session (logout)
   */
  async deleteSession(token: string): Promise<void> {
    await execute('DELETE FROM auth.sessions WHERE token = $1', [token]);
  }

  /**
   * Set auth.uid() for RLS testing
   */
  async setAuthContext(userId: string): Promise<void> {
    await execute('SELECT auth.set_user($1::uuid)', [userId]);
  }
}

/**
 * Supabase Auth adapter (future production)
 */
export class SupabaseAuthAdapter {
  // TODO: Implement Supabase Auth integration
  // Will use @supabase/ssr for server-side auth
  async sendMagicLink(email: string): Promise<{ success: boolean }> {
    throw new Error('Supabase Auth not yet implemented');
  }

  async verifyToken(token: string): Promise<AuthSession | null> {
    throw new Error('Supabase Auth not yet implemented');
  }

  async getSession(token: string): Promise<AuthSession | null> {
    throw new Error('Supabase Auth not yet implemented');
  }

  async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    throw new Error('Supabase Auth not yet implemented');
  }

  async deleteSession(token: string): Promise<void> {
    throw new Error('Supabase Auth not yet implemented');
  }

  async setAuthContext(userId: string): Promise<void> {
    throw new Error('Supabase Auth not yet implemented');
  }
}

/**
 * Get auth adapter based on environment
 */
export function getAuthAdapter(): LocalAuthAdapter | SupabaseAuthAdapter {
  // For now, always use local adapter
  // In production, check env var and return SupabaseAuthAdapter
  return new LocalAuthAdapter();
}

export const auth = getAuthAdapter();
