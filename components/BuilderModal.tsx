'use client';

import { useState } from 'react';
import { X, Loader2, TrendingUp, CheckCircle, ChevronRight } from 'lucide-react';
import type { SuggestedPortfolio } from '@/lib/types';

interface BuilderModalProps {
  bucketId: number;
  defaultTargetReturn?: number;
  defaultAmount?: number;
  defaultLifespan?: number;
  onClose: () => void;
  onApply: (portfolio: SuggestedPortfolio) => Promise<void>;
}

type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

const RISK_LABELS: Record<RiskLevel, string> = {
  conservative: 'Conservative — bonds & stable ETFs',
  moderate: 'Moderate — diversified equity + bonds',
  aggressive: 'Aggressive — growth & thematic ETFs',
};

export default function BuilderModal({
  bucketId,
  defaultTargetReturn = 0.07,
  defaultAmount = 100000,
  defaultLifespan = 10,
  onClose,
  onApply,
}: BuilderModalProps) {
  const [targetReturn, setTargetReturn] = useState(defaultTargetReturn * 100);
  const [amount, setAmount] = useState(defaultAmount);
  const [lifespan, setLifespan] = useState(defaultLifespan);
  const [risk, setRisk] = useState<RiskLevel>('moderate');
  const [loading, setLoading] = useState(false);
  const [portfolios, setPortfolios] = useState<SuggestedPortfolio[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  async function handleFind() {
    setLoading(true);
    setError('');
    setPortfolios([]);
    setSelected(null);

    try {
      const res = await fetch('/api/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_return: targetReturn / 100,
          amount,
          lifespan_years: lifespan,
          risk,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to build portfolio');
        return;
      }

      const data = await res.json();
      setPortfolios(data.portfolios || []);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (selected === null || !portfolios[selected]) return;
    setApplying(true);
    try {
      await onApply(portfolios[selected]);
      onClose();
    } catch {
      setError('Failed to save portfolio');
    } finally {
      setApplying(false);
    }
  }

  // Simple bar-chart weight visualization
  function WeightBar({ weight, color = 'bg-emerald-500' }: { weight: number; color?: string }) {
    return (
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full`}
          style={{ width: `${Math.min(weight * 100, 100)}%` }}
        />
      </div>
    );
  }

  const barColors = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-400', 'bg-rose-500'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">Portfolio Builder</h2>
            <p className="text-xs text-slate-400">Find ETF/stock mix to hit your target return</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Target Annual Return
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={targetReturn}
                  onChange={(e) => setTargetReturn(parseFloat(e.target.value) || 0)}
                  min={1}
                  max={50}
                  step={0.5}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Initial Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                  step={10000}
                  className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Lifespan (years)
              </label>
              <input
                type="number"
                value={lifespan}
                onChange={(e) => setLifespan(parseInt(e.target.value) || 10)}
                min={1}
                max={40}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Risk Tolerance</label>
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value as RiskLevel)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {(Object.entries(RISK_LABELS) as [RiskLevel, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleFind}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing markets...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                Find Portfolio Options
              </>
            )}
          </button>

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Portfolio options */}
          {portfolios.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                3 Portfolio Options — click to select
              </p>

              {portfolios.map((portfolio, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelected(idx === selected ? null : idx)}
                  className={`w-full text-left border rounded-xl p-4 transition-all ${
                    selected === idx
                      ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{portfolio.risk_label}</span>
                        {selected === idx && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{portfolio.description}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-lg font-bold text-emerald-700">
                        {(portfolio.weighted_return * 100).toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-slate-400">weighted return</p>
                    </div>
                  </div>

                  {/* Holdings breakdown */}
                  <div className="space-y-2">
                    {portfolio.holdings.map((h, hi) => (
                      <div key={h.ticker} className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-slate-700 w-12 shrink-0">
                          {h.ticker}
                        </span>
                        <WeightBar weight={h.weight} color={barColors[hi % barColors.length]} />
                        <span className="text-xs text-slate-500 w-10 text-right shrink-0">
                          {(h.weight * 100).toFixed(0)}%
                        </span>
                        <span className={`text-xs w-14 text-right shrink-0 ${h.year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {(h.year_return * 100).toFixed(1)}% 1yr
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}

              {selected !== null && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {applying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Use This Portfolio for Bucket #{bucketId}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
