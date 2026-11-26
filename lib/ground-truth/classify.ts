/**
 * Deterministic, rule-based classification of signals into project / task type / discipline /
 * blocker. No LLM calls (BUREAU_ENABLE_LLM_REVIEW stays unset): every rule here is a dictionary
 * or regex so the same input always gives the same answer and costs nothing.
 */
import type { BlockerCode, Discipline, TaskType } from './types';

/**
 * Built-in project aliases for this workspace's known streams (from Bureau's stream notes:
 * DuckDuckGoose, Studio - Peak Glow Up, Ember, Bureau). Integrations can add exact mappings in
 * config.project_map (e.g. {"travisbuilds/bureau": "bureau"}), which always win.
 */
export const DEFAULT_PROJECT_ALIASES: Record<string, string[]> = {
  duckduckgoose: ['duckduckgoose', 'duck duck goose', 'ddg'],
  'studio-peak-glow-up': ['peak glow up', 'peak-glow-up', 'peakglowup', 'glow up'],
  ember: ['ember', 'bedtimewithember'],
  bureau: ['bureau'],
};

export const slugProject = (s: string): string => {
  const slug = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return /^[a-z0-9][a-z0-9-]{0,59}$/.test(slug) ? slug : 'unassigned';
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordMatch = (hay: string, needle: string) => new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}($|[^a-z0-9])`, 'i').test(hay);

export function resolveProject(opts: {
  explicit?: string | null;
  hints?: string[];
  text?: string;
  projectMap?: Record<string, string>;
  aliases?: Record<string, string[]>;
}): string {
  if (opts.explicit && opts.explicit.trim()) {
    const ex = opts.explicit.trim().toLowerCase();
    const aliases = opts.aliases || DEFAULT_PROJECT_ALIASES;
    for (const [project, list] of Object.entries(aliases)) {
      if (project === slugProject(ex) || list.some(a => a === ex)) return project;
    }
    return slugProject(ex);
  }
  const map = Object.fromEntries(Object.entries(opts.projectMap || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const hints = (opts.hints || []).filter(Boolean).map(h => h.toLowerCase());
  for (const h of hints) if (map[h]) return slugProject(map[h]);
  const aliases = opts.aliases || DEFAULT_PROJECT_ALIASES;
  const search = (hay: string): string | null => {
    for (const [project, list] of Object.entries(aliases)) {
      if (list.some(a => wordMatch(hay, a))) return project;
    }
    return null;
  };
  for (const h of hints) {
    const hit = search(h.replace(/[/_.]/g, ' '));
    if (hit) return hit;
  }
  const t = String(opts.text || '').toLowerCase();
  return (t && search(t)) || 'unassigned';
}

// Ordered: first match wins. Debug before build so "fix the migration" is debug.
const TASK_RULES: Array<[TaskType, RegExp]> = [
  ['review', /\b(code review|review (the |this |my |pr|pull)|pr review|approve (the )?pr|look over (the |this )?(diff|pr))\b/i],
  ['debug', /\b(fix(es|ed|ing)?|bug|error|exception|stack ?trace|crash(es|ed)?|failing|fails|failed|timeout|timing out|broken|debug(ging)?|regression|not working|why is|500s?)\b/i],
  ['generate_media', /\b(render(s|ed|ing)?|seedance|kling|higgsfield|elevenlabs|midjourney|runway|voice ?over|vo takes?|narrator|narration takes?|tts|keyframes?|stills?|lookdev|image batch|video clip|generate (an? |\d+ )?(image|video|voice|clip|still|take)s?)\b/i],
  ['design', /\b(figma|wireframes?|mock ?ups?|layouts?|ui|ux|frames?|design system|contrast|spacing|typography|thumbnails?|redlines?|prototype)\b/i],
  ['publish', /\b(publish(ed|ing)?|upload(ed|ing)?|schedul(e|ed|ing) (the |a )?(short|video|post)|go live|youtube|shorts? (titles?|descriptions?))\b/i],
  ['copy', /\b(rewrite|copy ?writing|headlines?|captions?|scripts?|hooks?|taglines?|wording|changelog|release notes?|draft (an? )?(email|post|message|announcement))\b/i],
  ['build', /\b(implement|build|migration|refactor|add (a |an )?(feature|endpoint|route|table|column)|commit|merge|deploy(ed|ing|ment)?|pull request|endpoint|schema|typescript|sql|api route)\b/i],
  ['plan', /\b(plan(ning)?|roadmap|spec|prd|estimate|prioriti[sz]e|brief|outline|tickets?|backlog)\b/i],
  ['research', /\b(research|compare|what is|how does|find out|look up|summari[sz]e|explain|investigate)\b/i],
];

const TOOL_DEFAULTS: Record<string, TaskType> = {
  github: 'build', vercel: 'build', linear: 'build', sentry: 'debug', cursor: 'build',
  figma: 'design', drive: 'other', notion: 'plan',
  higgsfield: 'generate_media', elevenlabs: 'generate_media', runway: 'generate_media', midjourney: 'generate_media',
  youtube: 'publish',
};

export function classifyTaskType(text: string, tool: string): TaskType {
  const t = String(text || '');
  for (const [type, re] of TASK_RULES) if (re.test(t)) return type;
  return TOOL_DEFAULTS[tool] || 'other';
}

export function disciplineFor(taskType: TaskType, tool: string): Discipline | null {
  if (['higgsfield', 'elevenlabs', 'runway', 'midjourney', 'youtube'].includes(tool) || taskType === 'generate_media' || taskType === 'publish') return 'studio';
  if (tool === 'figma' || taskType === 'design') return 'design';
  if (['github', 'vercel', 'linear', 'sentry', 'cursor'].includes(tool) || taskType === 'build' || taskType === 'debug' || taskType === 'review') return 'engineering';
  return null;
}

const STUCK_RE = /\b(blocked|stuck|can'?t get|cannot get|still (failing|broken|drifting|not working)|keeps? (failing|drifting|breaking|crashing)|drift(s|ing)?|no luck|giving up|waiting on)\b/i;
const FAILURE_RE = /\b(fail(s|ed|ing)?|error|broken|crash(es|ed)?|timeout|timing out|not working|drift(s|ing)?|wrong|again)\b/i;

export function detectStuck(text: string): BlockerCode | null {
  return STUCK_RE.test(String(text || '')) ? 'stuck_keyword' : null;
}

/** Text that reads like another attempt at something that failed (counts toward the retry-loop rule). */
export const looksLikeFailure = (text: string): boolean => FAILURE_RE.test(String(text || ''));

/** Retry-loop rule: this many failed attempts inside RETRY_WINDOW_MIN marks the unit blocked. */
export const RETRY_THRESHOLD = 3;
export const RETRY_WINDOW_MIN = 30;
/** Session stitching: same person + project + task type within this many minutes is one unit. */
export const STITCH_WINDOW_MIN = 30;
/** A tool artifact attaches to a prompt-only unit for the same person + project within this window. */
export const CORRELATE_WINDOW_MIN = 120;
