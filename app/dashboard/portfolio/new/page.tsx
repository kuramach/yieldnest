'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react';

interface Scenario { id: number; name: string; is_baseline: number }

export default function NewPortfolioPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenarioId, setScenarioId] = useState('');
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
      <p className="text-sm text-slate-400 mb-8">A portfolio holds multiple return-targeted buckets.</p>

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
