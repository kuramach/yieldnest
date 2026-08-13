'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react';
import type { BucketGroup, AccountType } from '@/lib/types';

interface Scenario { id: number; name: string; is_baseline: number }

export default function NewPortfolioPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [bucketGroup, setBucketGroup] = useState<BucketGroup | null>(null);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setScenarios(data); })
      .catch(() => {})
      .finally(() => setLoadingScenarios(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Portfolio name is required'); return; }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          linked_360r_scenario_id: scenarioId ? parseInt(scenarioId) : undefined,
          bucket_group: bucketGroup ?? undefined,
          account_type: accountType ?? undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to create portfolio');
        return;
      }

      const portfolio = await res.json();
      router.push(`/dashboard/portfolio/${portfolio.id}`);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Create Portfolio</h1>
      <p className="text-sm text-slate-400 mb-8">Name your portfolio, tag it with a bucket label, then add tickers.</p>

      <div className="bg-white border border-slate-200 rounded-2xl p-8">
        {error && (
          <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Portfolio Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Retirement 2035, Aggressive Growth..."
              required
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Description <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this portfolio's purpose..."
              rows={3}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Bucket group */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Bucket Group <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 1 as BucketGroup, label: 'Bucket 1', sub: 'Safety / Short-term', color: 'border-blue-300 bg-blue-50 text-blue-700', ring: 'ring-blue-400' },
                { value: 2 as BucketGroup, label: 'Bucket 2', sub: 'Income / Mid-term',   color: 'border-amber-300 bg-amber-50 text-amber-700', ring: 'ring-amber-400' },
                { value: 3 as BucketGroup, label: 'Bucket 3', sub: 'Growth / Long-term',  color: 'border-emerald-300 bg-emerald-50 text-emerald-700', ring: 'ring-emerald-400' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBucketGroup(bucketGroup === opt.value ? null : opt.value)}
                  className={`border-2 rounded-xl p-3 text-left transition-all ${
                    bucketGroup === opt.value
                      ? `${opt.color} ring-2 ${opt.ring}`
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className="text-[11px] mt-0.5 opacity-75">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Account type */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Account Type <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'taxable' as AccountType, label: 'Taxable',  sub: 'Brokerage',         color: 'border-sky-300 bg-sky-50 text-sky-700',       ring: 'ring-sky-400' },
                { value: 'pretax'  as AccountType, label: 'Pre-Tax',  sub: 'IRA / 401(k)',       color: 'border-orange-300 bg-orange-50 text-orange-700', ring: 'ring-orange-400' },
                { value: 'roth'    as AccountType, label: 'Roth',     sub: 'Roth IRA / 401(k)',  color: 'border-violet-300 bg-violet-50 text-violet-700', ring: 'ring-violet-400' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccountType(accountType === opt.value ? null : opt.value)}
                  className={`border-2 rounded-xl p-3 text-left transition-all ${
                    accountType === opt.value
                      ? `${opt.color} ring-2 ${opt.ring}`
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className="text-[11px] mt-0.5 opacity-75">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Link to 360Retirement Scenario{' '}
              <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={scenarioId}
                onChange={e => setScenarioId(e.target.value)}
                disabled={loadingScenarios}
                className="w-full appearance-none px-3 py-2.5 pr-9 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:text-slate-400"
              >
                <option value="">
                  {loadingScenarios ? 'Loading scenarios…' : scenarios.length === 0 ? 'No scenarios found' : '— None —'}
                </option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.is_baseline ? ' (baseline)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              When linked, bucket returns feed directly into your retirement projection.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              href="/dashboard"
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Portfolio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
