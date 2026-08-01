'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, Copy, Check, Link as LinkIcon, X } from 'lucide-react';
import type { BucketCollaborator } from '@/lib/types';

interface Props {
  bucketId: number;
}

const ROLE_COLORS = {
  editor: 'bg-violet-100 text-violet-700',
  viewer: 'bg-slate-100 text-slate-600',
};

const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-700',
  active:   'bg-emerald-100 text-emerald-700',
  revoked:  'bg-slate-100 text-slate-400',
};

export default function CollaboratorsPanel({ bucketId }: Props) {
  const [collaborators, setCollaborators] = useState<BucketCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Invite form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [newInviteUrl, setNewInviteUrl] = useState('');

  // Copy state — keyed by collaborator id or 'new'
  const [copied, setCopied] = useState<string | null>(null);

  // Revoke state
  const [revoking, setRevoking] = useState<number | null>(null);

  const loadCollaborators = useCallback(async () => {
    setFetchError('');
    try {
      const res = await fetch(`/api/buckets/${bucketId}/collaborators`);
      if (!res.ok) throw new Error('Failed to load collaborators');
      const json = await res.json();
      setCollaborators(json.collaborators ?? []);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [bucketId]);

  useEffect(() => { loadCollaborators(); }, [loadCollaborators]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setNewInviteUrl('');
    setInviting(true);
    try {
      const res = await fetch(`/api/buckets/${bucketId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteError(json.error ?? 'Failed to send invite'); return; }
      setNewInviteUrl(json.invite_url ?? '');
      setEmail('');
      await loadCollaborators();
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(collabId: number) {
    setRevoking(collabId);
    try {
      await fetch(`/api/buckets/${bucketId}/collaborators/${collabId}`, { method: 'DELETE' });
      await loadCollaborators();
    } finally {
      setRevoking(null);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function buildInviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-700">Collaborators</h4>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Invite form */}
        <form onSubmit={handleInvite} className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-slate-500 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>
        </form>

        {inviteError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {inviteError}
          </p>
        )}

        {/* New invite URL callout */}
        {newInviteUrl && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <LinkIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-800 flex-1 truncate font-mono">{newInviteUrl}</span>
            <button
              onClick={() => copyToClipboard(newInviteUrl, 'new')}
              className="shrink-0 p-1 rounded-lg hover:bg-emerald-100 transition-colors"
              title="Copy invite link"
            >
              {copied === 'new' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-emerald-600" />
              )}
            </button>
            <button
              onClick={() => setNewInviteUrl('')}
              className="shrink-0 p-1 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <X className="w-3 h-3 text-emerald-500" />
            </button>
          </div>
        )}

        {/* Collaborators list */}
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : fetchError ? (
          <p className="text-xs text-red-500">{fetchError}</p>
        ) : collaborators.length === 0 ? (
          <p className="text-xs text-slate-400 py-1">No collaborators yet. Invite someone above.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {collaborators.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 py-2.5 ${c.status === 'revoked' ? 'opacity-40' : ''}`}
              >
                {/* Email */}
                <span className="flex-1 text-sm text-slate-700 truncate">{c.invited_email}</span>

                {/* Role badge */}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[c.role]}`}>
                  {c.role}
                </span>

                {/* Status badge */}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[c.status]}`}>
                  {c.status}
                </span>

                {/* Copy link (pending only) */}
                {c.status === 'pending' && (
                  <button
                    onClick={() => copyToClipboard(buildInviteUrl(c.invite_token), String(c.id))}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Copy invite link"
                  >
                    {copied === String(c.id) ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <LinkIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {/* Revoke (active or pending only) */}
                {c.status !== 'revoked' && (
                  <button
                    onClick={() => handleRevoke(c.id)}
                    disabled={revoking === c.id}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Revoke access"
                  >
                    {revoking === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
