/**
 * Sources from the design that are NOT built in this phase. Each entry says what is verified and
 * what is still unknown, so the next phase starts from facts, not guesses.
 *
 * TODO(figma, Phase D): GET /v1/files/:key/versions (scope file_versions:read) and Webhooks v2
 *   (POST /v2/webhooks, scope webhooks:write; FILE_VERSION_UPDATE / FILE_COMMENT events) are
 *   documented at https://developers.figma.com/docs/rest-api/. Needs a Figma OAuth app (Travis's
 *   OK) and a per-team webhook passcode; org-wide Activity Logs need Figma Enterprise.
 * TODO(youtube): channels?part=contentDetails -> playlistItems.list on the uploads playlist
 *   (https://developers.google.com/youtube/data/guides/implementation/videos). Public uploads only
 *   need an API key; attribution to a person needs a channel -> person mapping that does not exist yet.
 * TODO(runway): the Dev API only returns tasks submitted through the API (GET /v1/tasks/{id});
 *   there is no documented "list my web-app generations" endpoint. [Unverified] Not built.
 * TODO(midjourney): no official API exists and the ToS forbid automation. Not built; only the
 *   managed browser extension (Phase C) could see it.
 * TODO(slack): see /workspace/bureau/slack-connect-plan.md (separate approval).
 */
export const UNBUILT_SOURCES = ['figma', 'youtube', 'runway', 'midjourney', 'slack'] as const;
