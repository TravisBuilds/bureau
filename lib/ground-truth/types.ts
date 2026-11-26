/** Shared types for ground-truth capture and work units (no LLM anywhere in this pipeline). */

export const TASK_TYPES = ['build', 'debug', 'review', 'design', 'copy', 'generate_media', 'publish', 'plan', 'research', 'other'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const WORK_STATUSES = ['in_progress', 'shipped', 'rendered', 'blocked', 'abandoned', 'needs_review'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export type BlockerCode = 'retry_loop' | 'stuck_keyword' | 'deploy_failed' | 'error_assigned' | 'render_failures' | 'review_wait';
export type SourceKind = 'webhook_truth' | 'api_sync' | 'agent_mcp' | 'heartbeat';
export type Confidence = 'verified_artifact' | 'correlated' | 'self_reported';
export type Discipline = 'engineering' | 'design' | 'studio';

export const PROVIDERS = ['github', 'vercel', 'linear', 'sentry', 'google_drive', 'elevenlabs', 'higgsfield'] as const;
export type Provider = (typeof PROVIDERS)[number];
export const WEBHOOK_PROVIDERS: Provider[] = ['github', 'vercel', 'linear', 'sentry'];
export const PERSONAL_PROVIDERS: Provider[] = ['google_drive', 'elevenlabs'];
export const SYNC_PROVIDERS: Provider[] = ['google_drive', 'elevenlabs', 'higgsfield'];

/** Who did it, as the vendor identifies them. Resolved to a Bureau person via identity links / email. */
export interface ActorRef {
  provider: string;            // identity namespace for externalIds (usually the integration provider)
  externalIds: string[];
  emails: string[];
  fallback?: ActorRef;         // e.g. Vercel deploy -> GitHub commit author login
}

/** One normalized observation. Adapters and the MCP log tool produce these; the stitcher merges them into units. */
export interface Signal {
  provider: string;            // 'github', 'vercel', ..., or 'agent' for AI requests
  sourceKind: SourceKind;
  externalId: string;          // vendor-unique id for dedupe (hashed before storage)
  occurredAt: Date;
  title: string;               // short, human-readable; secrets are scrubbed before encryption
  classifyText?: string;       // extra text used ONLY for classification, never stored
  tool: string;                // github, vercel, linear, sentry, drive, elevenlabs, higgsfield, claude, chatgpt, grok_bot, ...
  taskType?: TaskType | null;  // adapter override; otherwise classified from text
  project?: string | null;     // explicit project slug (e.g. agent passed project=)
  projectHints?: string[];     // repo names, team keys, folder or project names
  artifactLink?: string | null;
  status?: WorkStatus | null;  // ground truth status (merged -> shipped, deploy error -> blocked, ...)
  failed?: boolean;            // a failed attempt (deploy error, failed render) for retry-loop detection
  blocker?: BlockerCode | null;
  effort?: Record<string, number>;
  activityLogId?: string | null;
}

export interface ParsedSignal extends Signal {
  actor: ActorRef;
}

export const isGroundTruth = (k: SourceKind) => k === 'webhook_truth' || k === 'api_sync';
