/* eslint-disable @typescript-eslint/no-explicit-any -- vendor JSON and pg rows are untyped; every field is narrowed before use */
/**
 * Google Drive Activity API v2 -> signals (personal integration: the person connects their own
 * Google account with the drive.activity.readonly scope).
 *  - Token: POST https://oauth2.googleapis.com/token (grant_type=refresh_token) with
 *    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 *  - Query: POST https://driveactivity.googleapis.com/v2/activity:query with filter
 *    'time > "<RFC3339>" AND detail.action_detail_case:(CREATE EDIT RENAME COMMENT)' and optional
 *    ancestorName "items/<folderId>" (https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/query).
 *  - Each DriveActivity has primaryActionDetail, actors[].user.knownUser.isCurrentUser,
 *    targets[].driveItem{name,title,mimeType}, timestamp | timeRange.endTime.
 * Only actions by the connected person (isCurrentUser) are kept: file title, action, link. File
 * contents are never read.
 */
import type { ParsedSignal, TaskType } from '../types';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const DRIVE_ACTIVITY_URL = 'https://driveactivity.googleapis.com/v2/activity:query';
export const DRIVE_ACTIVITY_SCOPE = 'https://www.googleapis.com/auth/drive.activity.readonly';
const MAX_PAGES = 5;

const ACTION_VERBS: Record<string, string> = { create: 'Created', edit: 'Edited', rename: 'Renamed', comment: 'Commented on' };

function taskForMime(mime: string): TaskType | null {
  if (mime === 'application/vnd.google-apps.document') return 'copy';
  if (mime === 'application/vnd.google-apps.presentation') return 'design';
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'plan';
  if (mime.startsWith('image/')) return 'design';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'generate_media';
  return null;
}

export function driveActivityToSignal(a: any): ParsedSignal | null {
  const detail = a?.primaryActionDetail || {};
  const action = Object.keys(ACTION_VERBS).find(k => k in detail);
  if (!action) return null;
  const mine = Array.isArray(a.actors) && a.actors.some((x: any) => x?.user?.knownUser?.isCurrentUser === true);
  if (!mine) return null;
  const target = (Array.isArray(a.targets) ? a.targets : []).find((t: any) => t?.driveItem?.name);
  if (!target) return null;
  const item = target.driveItem;
  const id = String(item.name).replace(/^items\//, '');
  if (!/^[A-Za-z0-9_-]{5,200}$/.test(id)) return null;
  const ts = a.timestamp || a.timeRange?.endTime;
  const when = Date.parse(String(ts || ''));
  if (Number.isNaN(when)) return null;
  const mime = String(item.mimeType || '');
  return {
    provider: 'google_drive', sourceKind: 'api_sync', tool: 'drive',
    externalId: `${id}:${action}:${when}`,
    occurredAt: new Date(when),
    title: `${ACTION_VERBS[action]} ${String(item.title || 'a file').slice(0, 200)}`,
    taskType: taskForMime(mime),
    artifactLink: `https://drive.google.com/open?id=${id}`,
    status: null,
    effort: { drive_edits: 1 },
    actor: { provider: 'google_drive', externalIds: [], emails: [] },
  };
}

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('Google Drive capture is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (!res.ok) throw new Error(`Google token refresh returned ${res.status}`);
  const body: any = await res.json();
  if (!body?.access_token) throw new Error('Google token refresh returned no access token');
  return String(body.access_token);
}

export async function fetchDrive(refreshToken: string, cursorIso: string | null, folderId?: string | null, now = Date.now()): Promise<{ signals: ParsedSignal[]; cursor: string }> {
  const accessToken = await googleAccessToken(refreshToken);
  const since = cursorIso && !Number.isNaN(Date.parse(cursorIso)) ? new Date(cursorIso).toISOString() : new Date(now - 24 * 3600_000).toISOString();
  const signals: ParsedSignal[] = [];
  let cursor = since;
  let pageToken: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body: Record<string, unknown> = {
      pageSize: 100,
      filter: `time > "${since}" AND detail.action_detail_case:(CREATE EDIT RENAME COMMENT)`,
      ...(folderId ? { ancestorName: `items/${folderId}` } : {}),
      ...(pageToken ? { pageToken } : {}),
    };
    const res = await fetch(DRIVE_ACTIVITY_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Drive Activity returned ${res.status}`);
    const out: any = await res.json();
    for (const a of Array.isArray(out?.activities) ? out.activities : []) {
      const s = driveActivityToSignal(a);
      if (s) {
        signals.push(s);
        if (s.occurredAt.toISOString() > cursor) cursor = s.occurredAt.toISOString();
      }
    }
    if (!out?.nextPageToken) break;
    pageToken = String(out.nextPageToken);
  }
  return { signals, cursor };
}
