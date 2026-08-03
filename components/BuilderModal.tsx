'use client';

import { useState, useRef } from 'react';
import { X, Loader2, TrendingUp, CheckCircle, ChevronRight, Search, Plus, Trash2, Sparkles, PenLine } from 'lucide-react';
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
type Tab = 'ai' | 'custom';

interface CustomHolding {
  ticker: string;
  name: string;
  weight: number;
  year_return?: number;
  price?: number;
  asset_type?: 'stock' | 'etf' | 'bond';
}

interface SearchResult {
  ticker: string;
  name: string;
  price?: number;
  year_return?: number;
  asset_type?: 'stock' | 'etf' | 'bond';
}

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
  const [tab, setTab] = useState<Tab>('custom');

  // AI Strategy tab state
  const [targetReturn, setTargetReturn] = useState(defaultTargetReturn * 100);
  const [amount, setAmount] = useState(defaultAmount);
  const [lifespan, setLifespan] = useState(defaultLifespan);
  const [risk, setRisk] = useState<RiskLevel>('moderate');
  const [loading, setLoading] = useState(false);
  const [portfolios, setPortfolios] = useState<SuggestedPortfolio[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  // Custom tab state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [customHoldings, setCustomHoldings] = useState<CustomHolding[]>([]);
  const [customError, setCustomError] = useState('');
  const [customApplying, setCustomApplying] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleSearchChange(q: string) {
    setQuery(q);
    setShowDropdown(false);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/securities/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function addCustomHolding(result: SearchResult) {
    setShowDropdown(false);
    setQuery('');
    setSearchResults([]);
    if (customHoldings.find(h => h.ticker === result.ticker)) return;
    setCustomHoldings(prev => [...prev, {
      ticker: result.ticker,
      name: result.name,
      weight: 0,
      year_return: result.year_return,
      price: result.price,
      asset_type: result.asset_type,
    }]);
  }

  function updateWeight(ticker: string, weight: number) {
    setCustomHoldings(prev => prev.map(h => h.ticker === ticker ? { ...h, weight } : h));
  }

  function removeHolding(ticker: string) {
    setCustomHoldings(prev => prev.filter(h => h.ticker !== ticker));
  }

  function distributeEvenly() {
    if (!customHoldings.length) return;
    const w = 1 / customHoldings.length;
    setCustomHoldings(prev => prev.map(h => ({ ...h, weight: w })));
  }

  const totalWeight = customHoldings.reduce((s, h) => s + h.weight, 0);
  const weightOk = Math.abs(totalWeight - 1) < 0.005;

  async function handleApplyCustom() {
    if (!customHoldings.length || !weightOk) return;
    setCustomApplying(true);
    setCustomError('');
    try {
      const portfolio: SuggestedPortfolio = {
        risk_label: 'Custom',
        description: 'Manually selected portfolio',
        weighted_return: customHoldings.reduce((s, h) => s + h.weight * (h.year_return ?? 0), 0),
        holdings: customHoldings.map(h => ({
          ticker: h.ticker,
          name: h.name,
          weight: h.weight,
          year_return: h.year_return ?? 0,
          asset_type: h.asset_type ?? 'stock',
          price: h.price ?? 0,
        })),
      };
      await onApply(portfolio);
      onClose();
    } catch {
      setCustomError('Failed to save portfolio');
    } finally {
      setCustomApplying(false);
    }
  }

  function WeightBar({ weight, color = 'bg-emerald-500' }: { weight: number; color?: string }) {
    return (
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(weight * 100, 100)}%` }} />
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
            <p className="text-xs text-slate-400">Pick your own tickers or let AI suggest a mix</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          <button
            onClick={() => setTab('custom')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'custom'
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            Custom Tickers
          </button>
          <button
            onClick={() => setTab('ai')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'ai'
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Strategy
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ─── AI Strategy tab ─── */}
          {tab === 'ai' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Target Annual Return</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={targetReturn}
                      onChange={(e) => setTargetReturn(parseFloat(e.target.value) || 0)}
                      min={1} max={50} step={0.5}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Initial Amount</label>
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
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Lifespan (years)</label>
                  <input
                    type="number"
                    value={lifespan}
                    onChange={(e) => setLifespan(parseInt(e.target.value) || 10)}
                    min={1} max={40}
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
                  <><Loader2 className="w-4 h-4 animate-spin" />Analyzing markets...</>
                ) : (
                  <><TrendingUp className="w-4 h-4" />Find Portfolio Options</>
                )}
              </button>

              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{error}</div>
              )}

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
                      <div className="space-y-2">
                        {portfolio.holdings.map((h, hi) => (
                          <div key={h.ticker} className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold text-slate-700 w-12 shrink-0">{h.ticker}</span>
                            <WeightBar weight={h.weight} color={barColors[hi % barColors.length]} />
                            <span className="text-xs text-slate-500 w-10 text-right shrink-0">{(h.weight * 100).toFixed(0)}%</span>
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
                      {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                      Use This Portfolio for Bucket #{bucketId}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ─── Custom Tickers tab ─── */}
          {tab === 'custom' && (
            <>
              <p className="text-sm text-slate-500">
                Search for ETFs or stocks, add them to your bucket, then set weights. Weights must sum to 100%.
              </p>

              {/* Ticker search */}
              <div className="relative">
                <label className="text-xs font-medium text-slate-600 mb-1 block">Search ticker or name</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="e.g. VTI, QQQ, Apple…"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {searchResults.slice(0, 8).map((r) => (
                      <button
                        key={r.ticker}
                        onMouseDown={() => addCustomHolding(r)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-sm transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-800 w-14 text-left shrink-0">{r.ticker}</span>
                          <span className="text-slate-500 truncate max-w-[200px]">{r.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          {r.year_return !== undefined && (
                            <span className={`text-xs font-medium ${r.year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {(r.year_return * 100).toFixed(1)}% 1yr
                            </span>
                          )}
                          <Plus className="w-4 h-4 text-emerald-500" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Holdings list */}
              {customHoldings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Your Holdings ({customHoldings.length})
                    </p>
                    <button
                      onClick={distributeEvenly}
                      className="text-xs text-emerald-600 hover:text-emerald-500 font-medium"
                    >
                      Distribute evenly
                    </button>
                  </div>

                  {customHoldings.map((h) => (
                    <div key={h.ticker} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-800">{h.ticker}</span>
                          {h.year_return !== undefined && (
                            <span className={`text-xs ${h.year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {(h.year_return * 100).toFixed(1)}% 1yr
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{h.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          value={Math.round(h.weight * 100)}
                          onChange={(e) => updateWeight(h.ticker, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100)}
                          min={0} max={100}
                          className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="text-slate-400 text-sm">%</span>
                        <button onClick={() => removeHolding(h.ticker)} className="p-1 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Weight total indicator */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${
                    weightOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    <span>Total weight</span>
                    <span>{(totalWeight * 100).toFixed(0)}% {weightOk ? '✓' : `— need ${(100 - totalWeight * 100).toFixed(0)}% more`}</span>
                  </div>

                  {customError && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{customError}</div>
                  )}

                  <button
                    onClick={handleApplyCustom}
                    disabled={!weightOk || customApplying}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {customApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    Apply Custom Portfolio to Bucket #{bucketId}
                  </button>
                </div>
              )}

              {customHoldings.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                  <Search className="w-8 h-8" />
                  <p className="text-sm">Search above to add tickers to your bucket</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
