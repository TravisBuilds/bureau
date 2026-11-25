'use client';

import { useEffect, useState } from 'react';
import { ACTIVITY_NOTICE } from '@/lib/activity-policy';

/**
 * The AI activity logging notice shown before connecting an AI (BC PIPA: tell people what is
 * collected, why, who sees it, how long it is kept, and who to ask). The parent disables its
 * Approve button until `checked` is true and sends activity_notice_accepted with the approval.
 */
export default function ActivityNotice({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/activity/consent')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setContact(d?.contact ?? null))
      .catch(() => setContact(null));
  }, []);

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-gray-800" data-testid="activity-notice">
      <p className="font-semibold mb-2">{ACTIVITY_NOTICE.title}</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>What:</strong> {ACTIVITY_NOTICE.what}</li>
        <li><strong>Why:</strong> {ACTIVITY_NOTICE.why}</li>
        <li><strong>Who can see it:</strong> {ACTIVITY_NOTICE.who}</li>
        <li><strong>How long:</strong> {ACTIVITY_NOTICE.retention}</li>
        <li><strong>Your control:</strong> {ACTIVITY_NOTICE.control}</li>
      </ul>
      {contact && <p className="mt-2 text-gray-600">{contact}</p>}
      <label className="mt-3 flex items-start gap-2 font-medium">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label="I have read this notice and understand my AI requests will be logged"
        />
        <span>I have read this and understand my AI requests will be logged to Bureau.</span>
      </label>
    </div>
  );
}
