/**
 * The AI activity logging notice (BC PIPA: notify the employee, before collection, of what is
 * collected and why, and who can answer questions) and the standing instructions given to
 * connected agents. Bump ACTIVITY_POLICY_VERSION whenever the notice text changes in substance;
 * employees then have to acknowledge it again before more is logged.
 */

// 2026-11-27: work-only logging (one entry per task, not per message), the user's instruction
// wins, Slack, and hard-delete on the dashboard. Bumping the version re-prompts every member.
export const ACTIVITY_POLICY_VERSION = '2026-11-27';
export const ACTIVITY_RETENTION_DAYS = 30;

export const ACTIVITY_NOTICE = {
  title: 'Your work activity is logged to Bureau',
  what: 'While this AI is connected, it records work you ask it to do for this team (what you asked, and a short note of what it did): one entry per piece of work, not every message. Personal matters, small talk and quick follow-ups are skipped. If you tell your AI not to log something, it will not. Bureau also records work you do in tools your workspace connects (for example commits and pull requests in GitHub, deploys in Vercel, issues in Linear and Sentry, file edits in Google Drive, voice or video generations in ElevenLabs and Higgsfield, and requests you make of Bureau in Slack): the title, link, status and simple counts, never file contents or your generation prompts. Obvious secrets such as passwords, API keys and card numbers are removed before anything is saved.',
  why: 'To give your team leads a record of the work being done, so they can see what people are working on and unblock them without asking for status updates.',
  who: 'You and your workspace owners and admins. Other teammates cannot see it.',
  retention: `Entries are encrypted and deleted automatically after ${ACTIVITY_RETENTION_DAYS} days.`,
  control: 'If something personal is logged by mistake, you can delete it on the My activity page. Deleting erases it for good, not just hides it. You can also mark an entry or work item as personal, which erases its content and leaves only the time. You can see there exactly what your owners and admins see about you and which tools are connected.',
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
  'Log only work requests for this team. Call the bureau_log_activity tool once per piece of work, not once per message.',
  'Skip personal matters, small talk and quick follow-ups.',
  "If the user tells you not to log something, or that it is personal or off the record, do not call this tool for it — the user's own instruction wins.",
  'Put a faithful one- or two-sentence description of the work in "request" (include names, projects and files they mention; do not include passwords, keys or other secrets).',
  'If you take an action for them (send, edit, create, search, run something), describe it in "detail".',
  'If you know which project it is for, pass "project"; if you produced something with a link (PR, deploy, doc, render), pass it in "artifact_url".',
  'Only as a fallback, if you are already logging and the user marks it personal, call with personal=true and request="personal", which stores only that a personal request happened.',
  'If the tool says consent_required, tell the user once that they need to accept the logging notice at Bureau (My activity page), then carry on helping.',
  'Do not ask the user for permission to log each time; the notice was accepted when they connected.',
].join(' ');
