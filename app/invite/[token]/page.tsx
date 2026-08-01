'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, ShieldAlert, LogIn } from 'lucide-react';

interface InviteInfo {
  invited_email: string;
  role: 'viewer' | 'editor';
  bucket_name: string;
  portfolio_name: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; info: InviteInfo }
  | { status: 'not_found' }
  | { status: 'revoked' }
  | { status: 'already_accepted' }
  | { status: 'error'; message: string };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setState({ status: 'not_found' }); return; }
        if (res.status === 410) { setState({ status: 'revoked' }); return; }
        if (res.status === 409) { setState({ status: 'already_accepted' }); return; }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setState({ status: 'error', message: j.error ?? 'Something went wrong' });
          return;
        }
        const data = await res.json();
        setState({ status: 'ok', info: data });
      })
      .catch(() => setState({ status: 'error', message: 'Network error' }));
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setAcceptError('');
    try {
      const res = await fetch(`/api/invite/${token}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          // Not signed in — redirect to login with return URL
          router.push(`/login?next=/invite/${token}`);
          return;
        }
        setAcceptError(json.error ?? 'Failed to accept invite');
        return;
      }
      // Redirect to dashboard after accepting
      router.push('/dashboard');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {state.status === 'loading' && (
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-sm text-slate-500">Loading invite…</p>
          </div>
        )}

        {state.status === 'not_found' && (
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-10 flex flex-col items-center gap-3 text-center">
            <XCircle className="w-10 h-10 text-slate-400" />
            <h1 className="text-lg font-bold text-slate-800">Invite not found</h1>
            <p className="text-sm text-slate-500">This invite link is invalid or has expired.</p>
          </div>
        )}

        {state.status === 'revoked' && (
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-10 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
            <h1 className="text-lg font-bold text-slate-800">Invite revoked</h1>
            <p className="text-sm text-slate-500">This invite has been revoked by the bucket owner.</p>
          </div>
        )}

        {state.status === 'already_accepted' && (
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-10 flex flex-col items-center gap-3 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
            <h1 className="text-lg font-bold text-slate-800">Already accepted</h1>
            <p className="text-sm text-slate-500">This invite has already been accepted.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Go to dashboard
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-10 flex flex-col items-center gap-3 text-center">
            <XCircle className="w-10 h-10 text-red-400" />
            <h1 className="text-lg font-bold text-slate-800">Something went wrong</h1>
            <p className="text-sm text-slate-500">{state.message}</p>
          </div>
        )}

        {state.status === 'ok' && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <LogIn className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">You've been invited</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-2">
                {state.info.bucket_name}
              </h1>
              {state.info.portfolio_name && (
                <p className="text-sm text-slate-500 mt-0.5">in {state.info.portfolio_name}</p>
              )}
            </div>

            {/* Details */}
            <div className="px-8 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Your role</span>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                    state.info.role === 'editor'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {state.info.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Invited email</span>
                <span className="text-sm font-medium text-slate-800">{state.info.invited_email}</span>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                You must be signed in as <strong>{state.info.invited_email}</strong> to accept this invite.
              </div>

              {acceptError && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-600">
                  {acceptError}
                </div>
              )}
            </div>

            {/* Action */}
            <div className="px-8 pb-6">
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {accepting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Accepting…
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Accept Invite
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
