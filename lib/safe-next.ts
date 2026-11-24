/**
 * Sanitize a post-login "next" target. Only same-origin relative paths are allowed:
 * must start with a single "/", no "//" or "/\" prefix, no backslashes, no control
 * characters, and it must resolve to the same origin. Returns pathname+search+hash,
 * or null when unsafe.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2048) return null;
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  if (/%(0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(s)) return null; // encoded control chars or backslash
  try {
    const base = 'http://bureau.invalid';
    const u = new URL(s, base);
    if (u.origin !== base) return null;
    const out = u.pathname + u.search + u.hash;
    // Never bounce back into the auth flow itself
    if (out.startsWith('/auth/callback')) return null;
    return out;
  } catch {
    return null;
  }
}

export const NEXT_COOKIE = 'bureau_next';
