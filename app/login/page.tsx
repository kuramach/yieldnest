'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TrendingUp, Mail, ArrowRight } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const supabase = createClient();

  const errorCode = searchParams.get('error');
  const errorDesc = searchParams.get('desc');
  const authErrorMessage =
    errorCode === 'otp_expired'
      ? 'Your sign-in link has expired. Links are only valid for 1 hour — please request a new one below.'
      : errorCode === 'access_denied'
      ? 'Sign-in was denied. Please try again.'
      : errorCode
      ? (errorDesc ?? 'Something went wrong. Please try again.')
      : null;

  const [error, setError] = useState(authErrorMessage ?? '');

  useEffect(() => {
    if (errorCode) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(next);
    });
  }, [errorCode, next, router, supabase]);

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.refresh();
      router.push(next);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <TrendingUp className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">YieldNest</h1>
          <p className="text-slate-400 text-sm mt-1">by EazyBudget</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">

          {sent ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-500/20 mb-4">
                <Mail className="w-7 h-7 text-violet-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
              <p className="text-slate-400 text-sm mb-1">We sent a sign-in link to</p>
              <p className="text-white font-medium text-sm mb-4">{email}</p>
              <p className="text-slate-400 text-xs mb-2">Click the link to sign in. It expires in 1 hour.</p>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 text-left">
                <p className="text-amber-400 text-xs font-semibold mb-0.5">📬 Don&apos;t see it?</p>
                <p className="text-amber-300/80 text-xs leading-relaxed">Check your <strong>Junk</strong> or <strong>Spam</strong> folder — the email occasionally lands there on first send.</p>
              </div>
              <button
                onClick={() => { setSent(false); setEmail(''); setShowEmail(false); }}
                className="mt-6 text-sm text-slate-400 hover:text-white transition-colors"
              >
                ← Try a different method
              </button>
            </div>

          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-1">Welcome back</h2>
              <p className="text-slate-400 text-sm mb-6">Sign in to manage your portfolios</p>

              {/* Google */}
              <button
                onClick={signInWithGoogle}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-sm transition-colors disabled:opacity-60 shadow-sm mb-4"
              >
                {googleLoading
                  ? <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  : <GoogleIcon />}
                Continue with Google
              </button>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-600" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-800 px-3 text-xs text-slate-500">or</span>
                </div>
              </div>

              {!showEmail && !showPassword ? (
                <>
                  <button
                    onClick={() => setShowEmail(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium transition-colors mb-2"
                  >
                    <Mail size={15} />
                    Continue with email link
                  </button>
                  <button
                    onClick={() => setShowPassword(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                  >
                    <ArrowRight size={15} />
                    Sign in with email + password
                  </button>
                </>
              ) : showPassword ? (
                <form onSubmit={signInWithPassword} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={loading || !email.trim() || !password}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ArrowRight size={15} />}
                    {loading ? 'Signing in…' : 'Sign in'}
                  </button>
                  <button type="button" onClick={() => { setShowPassword(false); setError(''); }} className="w-full text-sm text-slate-400 hover:text-white transition-colors">
                    ← Other sign-in options
                  </button>
                </form>
              ) : (
                <form onSubmit={sendMagicLink} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ArrowRight size={15} />}
                    {loading ? 'Sending…' : 'Send magic link'}
                  </button>
                  <button type="button" onClick={() => { setShowEmail(false); setError(''); }} className="w-full text-sm text-slate-400 hover:text-white transition-colors">
                    ← Other sign-in options
                  </button>
                </form>
              )}

              {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

              <p className="text-xs text-slate-500 text-center mt-6">
                Your 360 Retirement account works here too —{' '}
                <span className="text-slate-400">same login, connected.</span>
              </p>
            </>
          )}
        </div>

        <div className="mt-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            🔒 Your data is encrypted at rest and in transit. Row-level security ensures only you can access your portfolios.
          </p>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">
          © {new Date().getFullYear()} EazyBudget · eazybudget.com
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginForm />
    </Suspense>
  );
}
