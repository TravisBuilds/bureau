'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AskTeamBox from '@/components/AskTeamBox';

interface HeartbeatData {
  id: string;
  clone_id: string;
  date: string;
  top_priority: string;
  active: string[];
  blocked: string[];
  decisions_waiting_on_me: string[];
  waiting_on_others: Array<{ person: string; what: string }>;
  shipped_since_last: string[];
  helping: Array<{ person: string; what: string }>;
  out_of_office: boolean;
  confidence: string;
}

interface ProfileData {
  responsibilities?: string | null;
  active_work?: string | null;
  decisions_pending?: string | null;
  recent_output?: string | null;
  availability?: string | null;
}

interface CloneHealth {
  clone_id: string;
  display_name: string;
  handle: string;
  owner_email: string;
  is_stale: boolean;
  last_seen_at: string | null;
  latest_heartbeat: HeartbeatData | null;
  profile: ProfileData | null;
}

export default function TeamHealthPage() {
  const [clones, setClones] = useState<CloneHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeamHealth();
  }, []);

  async function loadTeamHealth() {
    try {
      const res = await fetch('/api/team-health');
      if (!res.ok) {
        throw new Error('Failed to load team health');
      }
      const data = await res.json();
      setClones(data.clones || []);
      setLoading(false);
    } catch (err) {
      setError('Failed to load team health data');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading team health...</p>
          </div>
        </div>
      </div>
    );
  }

  const activeClones = clones.filter(c => !c.is_stale && c.latest_heartbeat);
  const staleClones = clones.filter(c => c.is_stale);
  
  const allBlockers = clones
    .filter(c => c.latest_heartbeat?.blocked && c.latest_heartbeat.blocked.length > 0)
    .flatMap(c => c.latest_heartbeat!.blocked.map(b => ({ clone: c.display_name, blocker: b })));
  
  const allDecisions = clones
    .filter(c => c.latest_heartbeat?.decisions_waiting_on_me && c.latest_heartbeat.decisions_waiting_on_me.length > 0)
    .flatMap(c => c.latest_heartbeat!.decisions_waiting_on_me.map(d => ({ clone: c.display_name, decision: d })));

  const helpingRelationships = clones
    .filter(c => c.latest_heartbeat?.helping && c.latest_heartbeat.helping.length > 0)
    .flatMap(c => c.latest_heartbeat!.helping.map(h => ({
      helper: c.display_name,
      helping: h.person,
      what: h.what
    })));

  // Fresh clones get a card even before their first heartbeat (they'd otherwise vanish)
  const freshClones = clones.filter(c => !c.is_stale);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">Team Health Dashboard</h1>
            <p className="text-gray-600 mt-2">Real-time status across all digital clones</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/activity" className="text-blue-600 hover:underline">Activity</Link>
            <Link href="/top-floor" className="text-blue-600 hover:underline">
              ← Back to Top Floor
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <AskTeamBox />

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Active Clones</p>
            <p className="text-3xl font-bold">{activeClones.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Team Blockers</p>
            <p className="text-3xl font-bold text-red-600">{allBlockers.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Decisions Needed</p>
            <p className="text-3xl font-bold text-yellow-600">{allDecisions.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Stale Clones</p>
            <p className="text-3xl font-bold text-gray-400">{staleClones.length}</p>
          </div>
        </div>

        {/* Team Blockers */}
        {allBlockers.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">🚨 Team Blockers</h2>
            <div className="space-y-2">
              {allBlockers.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-3 p-3 bg-red-50 rounded-md">
                  <span className="font-medium text-red-900">{item.clone}:</span>
                  <span className="text-red-800">{item.blocker}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decisions Needed */}
        {allDecisions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">⚠️ Decisions Waiting</h2>
            <div className="space-y-2">
              {allDecisions.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-md">
                  <span className="font-medium text-yellow-900">{item.clone}:</span>
                  <span className="text-yellow-800">{item.decision}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Helping Relationships */}
        {helpingRelationships.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">🤝 Who's Helping Whom</h2>
            <div className="space-y-2">
              {helpingRelationships.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-md">
                  <span className="font-medium text-blue-900">{item.helper}</span>
                  <span className="text-blue-700">→</span>
                  <span className="font-medium text-blue-900">{item.helping}</span>
                  <span className="text-blue-700">:</span>
                  <span className="text-blue-800">{item.what}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-Clone Cards */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Clone Status</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {freshClones.map(clone => (
              <div key={clone.clone_id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold">{clone.display_name}</h3>
                    <p className="text-sm text-gray-500">@{clone.handle} · {clone.owner_email}</p>
                  </div>
                  {clone.last_seen_at && (
                    <span className="text-xs text-green-600 font-medium">
                      Active {new Date(clone.last_seen_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {clone.latest_heartbeat && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Top Priority</p>
                      <p className="text-sm text-gray-900">{clone.latest_heartbeat.top_priority}</p>
                    </div>

                    {clone.latest_heartbeat.active && clone.latest_heartbeat.active.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Active</p>
                        <ul className="text-sm text-gray-900 list-disc ml-5">
                          {clone.latest_heartbeat.active.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {clone.latest_heartbeat.shipped_since_last && clone.latest_heartbeat.shipped_since_last.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Shipped Recently</p>
                        <ul className="text-sm text-green-900 list-disc ml-5">
                          {clone.latest_heartbeat.shipped_since_last.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {clone.latest_heartbeat.confidence && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Confidence</p>
                        <p className="text-sm text-gray-900">{clone.latest_heartbeat.confidence}</p>
                      </div>
                    )}
                  </div>
                )}

                {!clone.latest_heartbeat && (
                  <p className="text-sm text-gray-500">No recent heartbeat</p>
                )}

                {clone.profile && (clone.profile.responsibilities || clone.profile.availability) && (
                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-1 text-sm">
                    {clone.profile.responsibilities && (
                      <p><span className="font-medium text-gray-700">Responsible for:</span> {clone.profile.responsibilities}</p>
                    )}
                    {clone.profile.availability && (
                      <p><span className="font-medium text-gray-700">Availability:</span> {clone.profile.availability}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stale Clones */}
        {staleClones.length > 0 && (
          <div className="bg-gray-100 rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">⏰ Stale Clones (&gt;26h)</h2>
            <div className="space-y-2">
              {staleClones.map(clone => (
                <div key={clone.clone_id} className="flex items-center justify-between p-3 bg-white rounded-md">
                  <div>
                    <p className="font-medium">{clone.display_name} (@{clone.handle})</p>
                    <p className="text-sm text-gray-500">{clone.owner_email}</p>
                  </div>
                  {clone.last_seen_at && (
                    <span className="text-sm text-gray-400">
                      Last seen {new Date(clone.last_seen_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
