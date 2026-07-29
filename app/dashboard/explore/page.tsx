'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Layers, TrendingUp, Download, Loader2, Search } from 'lucide-react';
import type { PublicPortfolio } from '@/lib/types';

function fmt(n: number | undefined) {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
}

export default function ExplorePage() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<PublicPortfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/portfolios/public')
      .then(r => r.json())
      .then(data => { setPortfolios(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('Failed to load public portfolios'); setLoading(false); });
  }, []);

  async function handleImport(p: PublicPortfolio) {
    setImporting(p.id);
    setError('');
    try {
      const res = await fetch('/api/portfolios/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_id: p.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      router.push(`/dashboard/portfolio/${json.id}`);
    } catch (e: any) {
      setError(e.message);
      setImporting(null);
    }
  }

  const filtered = portfolios.filter(p =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.description?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Explore Public Portfolios</h1>
          <p className="text-sm text-slate-400 mt-0.5">Discover portfolios shared by other users and import them as a starting point</p>
        </div>
        <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center">
          <Globe className="w-4 h-4 text-violet-600" />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search portfolios…"
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4 mb-6">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
          <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {query ? 'No portfolios match your search' : 'No public portfolios yet'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {!query && 'Be the first to share one — set visibility to Public when saving.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(p => (
            <div
              key={p.id}
              className="bg-white border border-slate-200 rounded-2xl p-6 flex items-start gap-4"
            >
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 truncate">{p.name}</h3>
                {p.description && (
                  <p className="text-sm text-slate-400 mt-0.5 truncate">{p.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {p.bucket_count} {p.bucket_count === 1 ? 'bucket' : 'buckets'}
                  </span>
                  <span>{p.holding_count} holdings</span>
                  {p.avg_return != null && (
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <TrendingUp className="w-3 h-3" />
                      {fmt(p.avg_return)} avg target
                    </span>
                  )}
                  <span className="text-slate-400">
                    {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleImport(p)}
                disabled={importing === p.id}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {importing === p.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />}
                {importing === p.id ? 'Importing…' : 'Import'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
