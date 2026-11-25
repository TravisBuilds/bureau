/** "travis.wu.bmc@x.com" -> "Travis". Empty string when nothing usable. */
export function firstNameFromEmail(email: string | null | undefined): string {
  const local = (email || '').split('@')[0] || '';
  const first = local.split(/[._+\-0-9]+/).find(Boolean) || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

/** Default agent name shown (and editable) on the consent and device screens. */
export function defaultAgentLabel(firstName: string, clientName: string | null | undefined): string {
  const bot = (clientName || 'AI agent').trim().slice(0, 60) || 'AI agent';
  return firstName ? `${firstName}'s ${bot}` : bot;
}
