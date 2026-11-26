/**
 * Run work after the HTTP response has been sent (Slack wants a 2xx within 3 seconds).
 * In a Next.js request this is `after()`; outside a request scope (unit tests, scripts) the task
 * runs immediately and is tracked so tests can await it with drainBackground().
 */
import { after } from 'next/server';

const pending = new Set<Promise<void>>();

export function runInBackground(task: () => Promise<void>): void {
  const run = async () => {
    try { await task(); } catch (err) { console.error('[slack] background task failed:', err instanceof Error ? err.message : 'error'); }
  };
  try {
    after(run);
  } catch {
    const p = run().finally(() => pending.delete(p));
    pending.add(p);
  }
}

/** Test helper: wait for background tasks started outside a request scope. */
export async function drainBackground(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}
