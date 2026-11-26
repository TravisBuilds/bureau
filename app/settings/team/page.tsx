'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SlackCard from './SlackCard';

interface Member {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
  last_seen_at: string | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  invited_at: string;
  expires_at: string;
}

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      const res = await fetch('/api/team/members');
      if (!res.ok) {
        throw new Error('Failed to load members');
      }
      const data = await res.json();
      setMembers(data.members || []);
      setInvites(data.invites || []);
      setLoading(false);
    } catch (err) {
      setError('Failed to load members');
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setInviting(true);

    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.toLowerCase(), role: inviteRole })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send invite');
        setInviting(false);
        return;
      }

      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('member');
      await loadMembers();
      setInviting(false);
    } catch (err) {
      setError('Failed to send invite');
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string, email: string) {
    if (!confirm(`Remove ${email} from workspace? This will revoke all their connections.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/team/members/${userId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to remove member');
        return;
      }

      setSuccess(`${email} removed from workspace`);
      await loadMembers();
    } catch (err) {
      setError('Failed to remove member');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">Team Members</h1>
            <p className="text-gray-600 mt-2">Manage workspace members and invitations</p>
          </div>
          <Link
            href="/settings"
            className="text-blue-600 hover:underline"
          >
            ← Back to Settings
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        <SlackCard />

        {/* Invite Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Invite Member</h2>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
          <div className="mt-4 text-sm text-gray-500">
            <p><strong>Roles:</strong></p>
            <ul className="mt-2 space-y-1 ml-4 list-disc">
              <li><strong>Member:</strong> Can manage their own connections and clones</li>
              <li><strong>Admin:</strong> Can invite members and manage team settings</li>
              <li><strong>Owner:</strong> Can remove members and assign admin role</li>
            </ul>
          </div>
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Pending Invites</h2>
            <div className="space-y-3">
              {invites.map(invite => (
                <div key={invite.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-gray-500">
                      Role: {invite.role} · Sent {new Date(invite.invited_at).toLocaleDateString()} · 
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm text-yellow-600 font-medium">Pending</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Members */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Current Members ({members.length})</h2>
          <div className="space-y-3">
            {members.map(member => (
              <div key={member.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div>
                  <p className="font-medium">{member.email}</p>
                  <p className="text-sm text-gray-500">
                    {member.role} · Joined {new Date(member.joined_at).toLocaleDateString()}
                    {member.last_seen_at && (
                      <> · Last seen {new Date(member.last_seen_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                {member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.user_id, member.email)}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
