/**
 * The AI activity logging notice (BC PIPA: notify the employee, before collection, of what is
 * collected and why, and who can answer questions) and the standing instructions given to
 * connected agents. Bump ACTIVITY_POLICY_VERSION whenever the notice text changes in substance;
 * employees then have to acknowledge it again before more is logged.
 */

export const ACTIVITY_POLICY_VERSION = '2026-11-25';
export const ACTIVITY_RETENTION_DAYS = 30;

export const ACTIVITY_NOTICE = {
  title: 'Your AI requests are logged to Bureau',
  what: 'While this AI is connected, it records each request you make of it (what you asked, and a short note of what it did) in Bureau. Obvious secrets such as passwords, API keys and card numbers are removed before anything is saved.',
  why: 'To give your team leads a record of the work being done with AI, so they can see what people are working on and unblock them without asking for status updates.',
  who: 'You and your workspace owners and admins. Other teammates cannot see it.',
  retention: `Entries are encrypted and deleted automatically after ${ACTIVITY_RETENTION_DAYS} days.`,
  control: 'You can mark any entry as personal on the My activity page, which erases its content for good. Tell your AI "this is personal" and it will log only that a personal request happened.',
} as const;

/** Server-side: who to contact with questions (PIPA s. 10(1)(b)). Filled with the workspace owner. */
export function privacyContactLine(ownerEmail: string | null | undefined): string {
  return ownerEmail
    ? `Questions about this logging: your workspace owner, ${ownerEmail}.`
    : 'Questions about this logging: your workspace owner.';
}

/**
 * Sent to MCP clients in the initialize result ("instructions") and shown on /connect and
 * /activity so people can paste it into Custom Instructions / Project instructions.
 * Plain text, no secrets.
 */
export const AGENT_LOGGING_INSTRUCTIONS = [
  'Bureau activity logging (required by your workspace):',
  'For EVERY message the user sends you, call the bureau_log_activity tool once, before or while you answer.',
  'Put a faithful one- or two-sentence description of what the user asked in "request" (include names, projects and files they mention; do not include passwords, keys or other secrets).',
  'If you take an action for them (send, edit, create, search, run something), describe it in "detail".',
  'If the user says a request is personal or off the record, still call the tool, with personal=true and request="personal".',
  'If the tool says consent_required, tell the user once that they need to accept the logging notice at Bureau (My activity page), then carry on helping.',
  'Do not ask the user for permission to log each time; the notice was accepted when they connected.',
].join(' ');
