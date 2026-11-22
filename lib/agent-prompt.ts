/**
 * Bureau - Agent Connection Prompt
 * Prompt that founders copy to their project agents
 */

export function generateAgentPrompt(bureauApiUrl: string): string {
  return `You are the project agent for [PROJECT NAME]. Report your project status to Bureau, the founder's decision-making command center.

**Your task:** Gather the following information and POST it to Bureau as JSON.

**Bureau API endpoint:**
${bureauApiUrl}/api/reports

**JSON Schema:**
See complete types at: ${bureauApiUrl}/api/reports/schema

**Required fields:**

\`\`\`json
{
  "projectName": "Your Project Name",
  "reportDate": "2026-11-21T00:00:00Z",  // ISO 8601
  "productDescription": "1-2 sentence description",
  
  "releaseState": {
    "platform": ["Android", "iOS", "Web"],  // what platforms exist
    "version": "v1.2.3",  // current version
    "distribution": "app-store" | "private-preview" | "beta" | "unreleased" | "live",
    "location": "Google Drive APK" | "App Store" | "TestFlight" | etc,
    "invitedTesters": 0,  // number of invited beta testers
    "launchDate": "2026-12-01",  // if set
    "notes": "Any relevant details"
  },
  
  "userMetrics": {
    "total": 26,  // total auth users
    "founder": {
      "accountIds": ["founder-account-id"],
      "activeOverDays": 33  // how many days founder has used it
    },
    "nonFounder": {
      "total": 25,  // total non-founder users
      "active": 6,  // users with meaningful behavior (saves, posts, etc)
      "withBehavior": 6  // users who did something
    },
    "activeDaysThreshold": 1  // what counts as "active on >1 day"
  },
  
  "eventTracking": {
    "tracked": [
      "saves - stored in Supabase",
      "sessions - stored in Supabase"
    ],
    "notTracked": [
      "button X tap - PostHog has no key",
      "event Y - no event exists yet"
    ],
    "blockers": [
      "Later-day return - NOT measurable without tracking X",
      "Retention - cannot measure without event Y"
    ]
  },
  
  "costs": [
    {
      "source": "Google Places API",
      "amountUSD": 8.72,
      "period": "Nov 2026",
      "isEstimate": true,  // true = from logs, false = actual invoice
      "notes": "Estimate from app logs"
    }
  ],
  
  "revenue": 0,  // monthly revenue in USD
  
  "openWork": {
    "unpushedCommits": 3,  // git: how many commits ahead of origin
    "openPRs": 2,  // number of open pull requests
    "branches": ["feature-x"]  // active branches
  },
  
  "pendingWork": [
    {
      "description": "Return-tracking fix: app_events table + button",
      "type": "approval" | "build" | "decision" | "migration" | "other",
      "estimatedMinutes": 60,  // how long for founder or agent to complete
      "reasoning": "Blocks measuring retention, which blocks go/no-go decision",
      "agentDesigned": true,  // if agent already designed the solution
      "requiredApproval": "What founder must approve (e.g. 'Apply migration to live DB')"
    }
  ],
  
  "founderTimeUnknown": true,  // if founder hasn't tracked time
  "dataSource": "Plum List agent (Grok Bot)"
}
\`\`\`

**How to gather this data:**
1. Check the codebase for release state, version, platforms
2. Query the database for user counts (separate founder from non-founder)
3. List tracked vs untracked events (check analytics setup)
4. Identify what metrics are NOT measurable due to missing tracking
5. Sum costs from logs or invoices (flag estimates vs actuals)
6. Check git for unpushed commits: \`git log origin/main..HEAD --oneline | wc -l\`
7. List any pending work awaiting founder approval

**After gathering data:**
- POST the JSON to ${bureauApiUrl}/api/reports
- OR save it as a file and import it via Bureau's UI

**What Bureau will do:**
- Analyze your report
- Derive 1-3 decisions only the founder can make
- Rank them by priority and cost of waiting
- Generate agent-readable task briefs for what to do after approval

**Example file export (alternative to API):**
Save as \`project-report.json\` and import via Bureau's "Import Report" button.`;
}

/**
 * Short version for onboarding screen
 */
export function generateAgentPromptShort(bureauApiUrl: string): string {
  return `Report your project status to Bureau. POST this JSON to ${bureauApiUrl}/api/reports or save as a file for import.

Required fields: projectName, reportDate, productDescription, releaseState, userMetrics, eventTracking, costs, revenue, openWork, pendingWork, founderTimeUnknown.

Full schema: ${bureauApiUrl}/api/reports/schema

Example:
{
  "projectName": "My App",
  "reportDate": "2026-11-21T00:00:00Z",
  "productDescription": "AI-powered productivity tool",
  "releaseState": { "platform": ["iOS"], "distribution": "beta", "version": "v1.0" },
  "userMetrics": { "total": 50, "founder": {...}, "nonFounder": {...} },
  "eventTracking": { "tracked": [...], "notTracked": [...], "blockers": [...] },
  "costs": [ { "source": "API", "amountUSD": 10, "isEstimate": true } ],
  "revenue": 0,
  "openWork": { "unpushedCommits": 0, "openPRs": 0 },
  "pendingWork": [],
  "founderTimeUnknown": true
}

Bureau will analyze this and tell you exactly what decisions need your approval.`;
}
