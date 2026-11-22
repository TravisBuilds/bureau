'use client';

import { useState } from 'react';
import { X, Shield, AlertCircle, ExternalLink, Key, FileText } from 'lucide-react';
import { ConnectionRequirement, PROVIDER_DEFINITIONS } from '@/lib/connection-types';

interface Props {
  streamName: string;
  metricLabel?: string;
  requirement: ConnectionRequirement;
  onConnect: (method: 'oauth' | 'api-key' | 'agent' | 'manual') => void;
  onSkip: () => void;
}

export default function ConnectionPrompt({
  streamName,
  metricLabel,
  requirement,
  onConnect,
  onSkip,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const provider = PROVIDER_DEFINITIONS[requirement.provider];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{provider.icon}</div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Connect {provider.name}
                </h2>
                <p className="text-sm text-slate-500">
                  {metricLabel ? `To show ${metricLabel}` : `For ${streamName}`}
                </p>
              </div>
            </div>
            <button
              onClick={onSkip}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* What Bureau will read */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start gap-3 mb-4">
            <Shield className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-slate-900 mb-2">
                Bureau will read:
              </h3>
              <ul className="text-sm text-slate-600 space-y-1">
                {provider.whatBureauReads.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-slate-900 mb-2">
                Bureau will never:
              </h3>
              <ul className="text-sm text-slate-500 space-y-1">
                {provider.whatBureauNeverDoes.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>

          {requirement.requiredScopes.includes('write') || requirement.requiredScopes.includes('act') ? (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                ⚠️ <strong>Write access:</strong> This connection will allow Bureau to take actions.
                All actions require your approval and are logged.
              </p>
            </div>
          ) : null}
        </div>

        {/* Connection methods */}
        <div className="p-6 space-y-3">
          {provider.supportsOAuth && requirement.method.includes('oauth') && (
            <button
              onClick={() => onConnect('oauth')}
              className="w-full p-4 border-2 border-highstreet-purple bg-highstreet-purple/5 rounded-lg hover:bg-highstreet-purple/10 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900 mb-1">
                    Connect with {provider.name}
                  </div>
                  <div className="text-sm text-slate-600">
                    Secure OAuth • Read-only access
                  </div>
                </div>
                <ExternalLink className="w-5 h-5 text-highstreet-purple" />
              </div>
            </button>
          )}

          {provider.supportsApiKey && requirement.method.includes('api-key') && (
            <button
              onClick={() => onConnect('api-key')}
              className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-slate-300 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900 mb-1">
                    Use API key
                  </div>
                  <div className="text-sm text-slate-600">
                    {provider.apiKeyInstructions}
                  </div>
                  {provider.apiKeyLink && (
                    <a
                      href={provider.apiKeyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-highstreet-purple hover:underline mt-1 inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Get your API key <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <Key className="w-5 h-5 text-slate-400" />
              </div>
            </button>
          )}

          {requirement.method.includes('agent-intake') && (
            <button
              onClick={() => onConnect('agent')}
              className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-slate-300 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900 mb-1">
                    Connect through agent
                  </div>
                  <div className="text-sm text-slate-600">
                    Agent fetches and you review
                  </div>
                </div>
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
            </button>
          )}

          {requirement.manualEntryAvailable && (
            <button
              onClick={() => onConnect('manual')}
              className="w-full p-4 border-2 border-slate-200 rounded-lg hover:border-slate-300 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-900 mb-1">
                    Enter manually
                  </div>
                  <div className="text-sm text-slate-600">
                    Update the numbers yourself
                  </div>
                </div>
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onSkip}
            className="w-full text-sm text-slate-500 hover:text-slate-700"
          >
            Skip for now
          </button>
        </div>

        {/* Security note */}
        <div className="px-6 pb-6 text-xs text-slate-400">
          <Shield className="w-3 h-3 inline mr-1" />
          Credentials are encrypted server-side and never shown after save.
          Used by: {streamName}
        </div>
      </div>
    </div>
  );
}
