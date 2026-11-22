'use client';

import { useState } from 'react';
import { StreamShareSettings } from '@/lib/audit-types';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';

interface Props {
  streamId: string;
  streamName: string;
  settings: StreamShareSettings;
  onUpdate: (settings: StreamShareSettings) => void;
}

export default function ShareSettingsPanel({ streamId, streamName, settings, onUpdate }: Props) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [showPreview, setShowPreview] = useState(false);

  const handleVisibilityChange = (visibility: StreamShareSettings['visibility']) => {
    const updated = { ...localSettings, visibility };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  const handleFieldToggle = (field: keyof StreamShareSettings['publicFields']) => {
    const updated = {
      ...localSettings,
      publicFields: {
        ...localSettings.publicFields,
        [field]: !localSettings.publicFields[field],
      },
    };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  const isPublic = localSettings.visibility !== 'private';
  const publicUrl = `/s/${streamId}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Share Settings</h3>
          <p className="text-sm text-slate-500 mt-1">Control what data is visible to investors</p>
        </div>
        {isPublic && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-highstreet-purple hover:bg-highstreet-purple hover:text-white rounded-lg border border-highstreet-purple transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Public Page
          </a>
        )}
      </div>

      {/* Visibility Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Visibility
        </label>
        <div className="space-y-2">
          <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
            style={{ borderColor: localSettings.visibility === 'private' ? '#6253F1' : '#e2e8f0' }}>
            <input
              type="radio"
              name="visibility"
              checked={localSettings.visibility === 'private'}
              onChange={() => handleVisibilityChange('private')}
              className="mr-3"
            />
            <div className="flex items-center gap-2 flex-1">
              <EyeOff className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium text-slate-900">Private</div>
                <div className="text-xs text-slate-500">Only you can see this stream</div>
              </div>
            </div>
          </label>

          <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
            style={{ borderColor: localSettings.visibility === 'public-preview' ? '#6253F1' : '#e2e8f0' }}>
            <input
              type="radio"
              name="visibility"
              checked={localSettings.visibility === 'public-preview'}
              onChange={() => handleVisibilityChange('public-preview')}
              className="mr-3"
            />
            <div className="flex items-center gap-2 flex-1">
              <Eye className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium text-slate-900">Public Preview</div>
                <div className="text-xs text-slate-500">Anyone with the link can view selected data</div>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Field Selection (only show if public) */}
      {isPublic && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Public Fields
          </label>
          <div className="space-y-2">
            {Object.entries({
              monthlyIncome: 'Monthly income',
              monthlyCosts: 'Monthly costs breakdown',
              monthlyHours: 'Hours worked',
              userMetrics: 'User count and growth',
              decisions: 'Decision history',
              auditTrail: 'Full audit trail',
              effectiveHourlyRate: 'Income per hour',
              recentActivity: 'Recent updates',
            }).map(([field, label]) => (
              <label
                key={field}
                className="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={localSettings.publicFields[field as keyof typeof localSettings.publicFields]}
                  onChange={() => handleFieldToggle(field as keyof StreamShareSettings['publicFields'])}
                  className="mr-3"
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>

          {/* Preview Button */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="mt-4 w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {showPreview ? 'Hide' : 'Show'} Preview
          </button>

          {/* Preview */}
          {showPreview && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-medium text-slate-500 mb-2">PUBLIC VIEW PREVIEW</div>
              <div className="text-sm text-slate-600">
                <div className="mb-2 font-semibold">{streamName}</div>
                {localSettings.publicFields.monthlyIncome && <div>✓ Monthly income visible</div>}
                {localSettings.publicFields.monthlyCosts && <div>✓ Costs visible</div>}
                {localSettings.publicFields.monthlyHours && <div>✓ Hours visible</div>}
                {localSettings.publicFields.userMetrics && <div>✓ User metrics visible</div>}
                {localSettings.publicFields.decisions && <div>✓ Decision history visible</div>}
                {localSettings.publicFields.auditTrail && <div>✓ Full audit trail visible</div>}
                {!Object.values(localSettings.publicFields).some(v => v) && (
                  <div className="text-slate-400 italic">No fields selected for public view</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warning */}
      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="text-sm text-amber-900">
          <strong>Note:</strong> Public views read only from your auditable record with timestamps and sources.
          Changes you make will be reflected immediately in the public view.
        </div>
      </div>
    </div>
  );
}
