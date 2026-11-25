/**
 * Deterministic secret scrubber (no LLM). Runs before anything is encrypted and stored, so
 * Bureau never becomes a store of pasted credentials. Each match becomes "[REDACTED:<kind>]".
 */

interface Rule { kind: string; re: RegExp; keepPrefix?: (m: RegExpExecArray) => string }

const RULES: Rule[] = [
  { kind: 'private_key', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'anthropic_key', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { kind: 'openai_key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { kind: 'stripe_key', re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: 'slack_token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: 'slack_webhook', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g },
  { kind: 'github_token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g },
  { kind: 'gitlab_token', re: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { kind: 'aws_access_key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'bureau_token', re: /\bbureau_(?:at_|rt_)?[0-9a-f]{32,}\b/g },
  { kind: 'vercel_token', re: /\b(?:vercel_|vc_)[A-Za-z0-9]{20,}\b/g },
  { kind: 'supabase_key', re: /\bsb(?:p|_secret|_publishable)_[A-Za-z0-9_-]{20,}/g },
  // scheme://user:password@host  -> keep scheme and user, drop the password
  { kind: 'url_password', re: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, keepPrefix: m => m[1] },
  // Authorization: Bearer xxx / Basic xxx
  { kind: 'auth_header', re: /\b(authorization\s*[:=]\s*(?:bearer|basic|token)\s+)[A-Za-z0-9._~+/=-]{8,}/gi, keepPrefix: m => m[1] },
  { kind: 'bearer_token', re: /\b(bearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi, keepPrefix: m => m[1] },
  // password = "..." / api_key: ... / secret=... / token=...
  {
    kind: 'credential_assignment',
    re: /\b((?:password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',;]{4,}/gi,
    keepPrefix: m => m[1],
  },
];

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export interface ScrubResult { text: string; count: number; kinds: string[] }

export function scrubSecrets(input: string): ScrubResult {
  let text = String(input ?? '');
  let count = 0;
  const kinds = new Set<string>();
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      const m = Object.assign(groups, { index: 0, input: text }) as unknown as RegExpExecArray;
      count++;
      kinds.add(rule.kind);
      return `${rule.keepPrefix ? rule.keepPrefix(m) : ''}[REDACTED:${rule.kind}]`;
    });
  }
  // Payment card numbers (13-19 digits, optional spaces/dashes, Luhn-valid)
  text = text.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (match) => {
    const digits = match.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    count++;
    kinds.add('card_number');
    return '[REDACTED:card_number]';
  });
  return { text, count, kinds: [...kinds] };
}
