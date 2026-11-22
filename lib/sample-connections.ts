/**
 * Sample connections for prototype
 * Shows various connection states and methods
 */

import { Connection, ConnectionAuditEntry } from './connection-types';

export const SAMPLE_CONNECTIONS: Connection[] = [
  // X (Twitter) - OAuth, used by Elon stream
  {
    id: 'conn-x-1',
    provider: 'x-twitter',
    method: 'oauth',
    status: 'connected',
    connectedAt: '2026-11-15T10:00:00Z',
    lastSyncAt: '2026-11-22T03:30:00Z',
    scopes: ['read'],
    scopeDetails: 'Read followers, tweets, and engagement metrics',
    connectedBy: 'user-travis',
    connectedByName: 'Travis Wu',
    streamsUsing: [
      {
        streamId: 'elon',
        streamName: 'Elon',
      },
    ],
    oauthProvider: 'x-twitter',
    oauthAccountId: '@traviswu',
    oauthAccountName: 'Travis Wu',
  },

  // ElevenLabs - API key, shared by Ember and DuckDuckGoose
  {
    id: 'conn-elevenlabs-1',
    provider: 'elevenlabs',
    method: 'api-key',
    status: 'connected',
    connectedAt: '2026-11-10T14:00:00Z',
    lastSyncAt: '2026-11-22T02:00:00Z',
    scopes: ['read'],
    scopeDetails: 'Read API usage, credits, and voice library',
    connectedBy: 'user-travis',
    connectedByName: 'Travis Wu',
    streamsUsing: [
      {
        streamId: 'ember',
        streamName: 'Ember',
        attributionRule: 'project:ember',
      },
      {
        streamId: 'duckduckgoose',
        streamName: 'DuckDuckGoose',
        attributionRule: 'project:duckduckgoose',
      },
    ],
    apiKeyType: 'read-only',
    apiKeyHint: '...k7j9',
  },

  // YouTube - OAuth, used by Ember
  {
    id: 'conn-youtube-1',
    provider: 'youtube',
    method: 'oauth',
    status: 'connected',
    connectedAt: '2026-11-12T09:00:00Z',
    lastSyncAt: '2026-11-21T18:00:00Z',
    scopes: ['read'],
    scopeDetails: 'Read video views, subscribers, watch time',
    connectedBy: 'user-travis',
    connectedByName: 'Travis Wu',
    streamsUsing: [
      {
        streamId: 'ember',
        streamName: 'Ember',
      },
    ],
    oauthProvider: 'google',
    oauthAccountId: 'yellow.duck.labs@gmail.com',
    oauthAccountName: 'Yellow Duck Labs',
  },

  // Higgsfield - API key, used by Studio Peak Glow Up
  {
    id: 'conn-higgsfield-1',
    provider: 'higgsfield',
    method: 'api-key',
    status: 'connected',
    connectedAt: '2026-11-18T16:00:00Z',
    lastSyncAt: '2026-11-22T01:00:00Z',
    scopes: ['read'],
    scopeDetails: 'Read API usage, credit balance, generation history',
    connectedBy: 'user-travis',
    connectedByName: 'Travis Wu',
    streamsUsing: [
      {
        streamId: 'studio-peak-glow-up',
        streamName: 'Studio · Peak Glow Up',
        attributionRule: 'project:peak-glow-up',
      },
    ],
    apiKeyType: 'read-only',
    apiKeyHint: '...m3p8',
  },

  // OpenAI - Not connected yet
  {
    id: 'conn-openai-1',
    provider: 'openai',
    method: 'api-key',
    status: 'revoked',
    connectedAt: '2026-11-05T12:00:00Z',
    lastSyncAt: '2026-11-08T15:00:00Z',
    scopes: ['read'],
    scopeDetails: 'Read token usage and API costs',
    connectedBy: 'user-travis',
    connectedByName: 'Travis Wu',
    streamsUsing: [],
    apiKeyType: 'read-only',
    apiKeyHint: '...x2d4',
  },

  // GitHub - OAuth, could be used for various streams
  {
    id: 'conn-github-1',
    provider: 'github',
    method: 'oauth',
    status: 'connected',
    connectedAt: '2026-11-01T08:00:00Z',
    lastSyncAt: '2026-11-22T00:00:00Z',
    scopes: ['read'],
    scopeDetails: 'Read commits, PRs, CI status',
    connectedBy: 'user-travis',
    connectedByName: 'Travis Wu',
    streamsUsing: [
      {
        streamId: 'duckduckgoose',
        streamName: 'DuckDuckGoose',
      },
    ],
    oauthProvider: 'github',
    oauthAccountId: 'traviswu',
    oauthAccountName: 'Travis Wu',
  },
];

export const SAMPLE_CONNECTION_AUDIT: ConnectionAuditEntry[] = [
  {
    id: 'audit-1',
    connectionId: 'conn-x-1',
    provider: 'x-twitter',
    action: 'connected',
    timestamp: '2026-11-15T10:00:00Z',
    userId: 'user-travis',
    userName: 'Travis Wu',
    details: 'Connected X (Twitter) with OAuth for Elon stream',
    scopesAfter: ['read'],
  },
  {
    id: 'audit-2',
    connectionId: 'conn-elevenlabs-1',
    provider: 'elevenlabs',
    action: 'connected',
    timestamp: '2026-11-10T14:00:00Z',
    userId: 'user-travis',
    userName: 'Travis Wu',
    details: 'Connected ElevenLabs API key (read-only)',
    scopesAfter: ['read'],
  },
  {
    id: 'audit-3',
    connectionId: 'conn-elevenlabs-1',
    provider: 'elevenlabs',
    action: 'stream-added',
    timestamp: '2026-11-16T11:00:00Z',
    userId: 'user-travis',
    userName: 'Travis Wu',
    details: 'Added DuckDuckGoose stream to ElevenLabs connection',
    streamId: 'duckduckgoose',
  },
  {
    id: 'audit-4',
    connectionId: 'conn-openai-1',
    provider: 'openai',
    action: 'revoked',
    timestamp: '2026-11-08T15:30:00Z',
    userId: 'user-travis',
    userName: 'Travis Wu',
    details: 'Revoked OpenAI connection',
    scopesBefore: ['read'],
  },
  {
    id: 'audit-5',
    connectionId: 'conn-x-1',
    provider: 'x-twitter',
    action: 'sync-success',
    timestamp: '2026-11-22T03:30:00Z',
    userId: 'system',
    userName: 'System',
    details: 'Successfully synced X metrics',
  },
];
