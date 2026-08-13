'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Loader2, Trash2, Save, TrendingUp, TrendingDown, CheckCircle, Circle } from 'lucide-react';
import type { PortfolioHolding, SecurityQuote, BucketGroup, AccountType } from '@/lib/types';

interface Props {
  portfolioId: number;
  initialHoldings: PortfolioHolding[];
  initialStatus: 'draft' | 'deployed';
  bucketGroup: BucketGroup | null;
  accountType: AccountType | null;
  linked360rScenarioId: number | null;
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }) as T;
}

const BUCKET_OPTIONS = [
  { value: 1 as BucketGroup, label: 'Bucket 1 — Safety',  color: 'border-blue-300 bg-blue-50 text-blue-700',     ring: 'ring-blue-400' },
  { value: 2 as BucketGroup, label: 'Bucket 2 — Income',  color: 'border-amber-300 bg-amber-50 text-amber-700',   ring: 'ring-amber-400' },
  { value: 3 as BucketGroup, label: 'Bucket 3 — Growth',  color: 'border-emerald-300 bg-emerald-50 text-emerald-700', ring: 'ring-emerald-400' },
] as const;

const ACCOUNT_OPTIONS = [
  { value: 'taxable' as AccountType, label: 'Taxable',  sub: 'Brokerage',        color: 'border-sky-300 bg-sky-50 text-sky-700',         ring: 'ring-sky-400' },
  { value: 'pretax'  as AccountType, label: 'Pre-Tax',  sub: 'IRA / 401(k)',      color: 'border-orange-300 bg-orange-50 text-orange-700', ring: 'ring-orange-400' },
  { value: 'roth'    as AccountType, label: 'Roth',     sub: 'Roth IRA / 401(k)', color: 'border-violet-300 bg-violet-50 text-violet-700', ring: 'ring-violet-400' },
] as const;

export default function PortfolioHoldingsClient({
  portfolioId,
  initialHoldings,
  initialStatus,
  bucketGroup: initBucketGroup,
  accountType: initAccountType,
}: Props) {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(initialHoldings);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [dirtyWeights, setDirtyWeights] = useState<Set<number>>(new Set());
  const [savingWeights, setSavingWeights] = useState(false);
  const [status, setStatus] = useState<'draft' | 'deployed'>(initialStatus);
  const [bucketGroup, setBucketGroup] = useState<BucketGroup | null>(initBucketGroup);
  const [accountType, setAccountType] = useState<AccountType | null>(initAccountType);
  const [savingMeta, setSavingMeta] = useState(false);

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SecurityQuote[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState<SecurityQuote | null>(null);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Init weights from holdings
  useEffect(() => {
    const map: Record<number, number> = {};
    initialHoldings.forEach(h => { map[h.id] = Math.round(h.weight * 100); });
    setWeights(map);
  }, [initialHoldings]);

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

  const searchSecurities = useCallback(
    debounce(async (...args: unknown[]) => {
      const q = args[0] as string;
      if (!q.trim()) { setResults([]); setDropdownOpen(false); return; }
      setSearching(true);
      try {
        const res = await fetch(`/api/securities/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: SecurityQuote[] = await res.json();
          setResults(data);
          setDropdownOpen(data.length > 0);
        }
      } finally {
        setSearching(false);
      }
    }, 350),
    []
  );

  useEffect(() => { searchSecurities(query); }, [query, searchSecurities]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function addHolding(security: SecurityQuote) {
    setAdding(true);
    try {
      const res = await fetch('/api/portfolio-holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          ticker: security.ticker,
          name: security.name,
          asset_type: security.asset_type,
          weight: 0,
        }),
      });
      if (!res.ok) return;
      const newHolding: PortfolioHolding = await res.json();
      newHolding.year_return = security.year_return;
      newHolding.price = security.price;
      setHoldings(prev => [...prev, newHolding]);
      setWeights(prev => ({ ...prev, [newHolding.id]: 0 }));
      setSelected(null);
      setQuery('');
      setResults([]);
    } finally {
      setAdding(false);
    }
  }

  async function removeHolding(id: number) {
    await fetch(`/api/portfolio-holdings/${id}`, { method: 'DELETE' });
    setHoldings(prev => prev.filter(h => h.id !== id));
    setWeights(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDirtyWeights(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function handleWeightChange(id: number, val: string) {
    const n = Math.max(0, Math.min(100, parseInt(val) || 0));
    setWeights(prev => ({ ...prev, [id]: n }));
    setDirtyWeights(prev => new Set(prev).add(id));
  }

  function equalizeWeights() {
    if (holdings.length === 0) return;
    const eq = Math.floor(100 / holdings.length);
    const newW: Record<number, number> = {};
    holdings.forEach((h, i) => { newW[h.id] = i === 0 ? 100 - eq * (holdings.length - 1) : eq; });
    setWeights(newW);
    setDirtyWeights(new Set(holdings.map(h => h.id)));
  }

  async function saveWeights() {
    setSavingWeights(true);
    try {
      await Promise.all(
        [...dirtyWeights].map(id =>
          fetch(`/api/portfolio-holdings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weight: (weights[id] ?? 0) / 100 }),
          })
        )
      );
      setDirtyWeights(new Set());
    } finally {
      setSavingWeights(false);
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await fetch('/api/portfolios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: portfolioId, bucket_group: bucketGroup, account_type: accountType }),
      });
      // Also save status via portfolios PATCH if changed
    } finally {
      setSavingMeta(false);
    }
  }

  async function toggleStatus() {
    const next = status === 'draft' ? 'deployed' : 'draft';
    setStatus(next);
    await fetch(`/api/portfolios/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  }

  const weightColor = totalWeight === 100 ? 'text-emerald-600' : totalWeight > 100 ? 'text-red-600' : 'text-amber-600';

  return (
    <div className="space-y-6">
      {/* Status + Labels bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={toggleStatus}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            status === 'deployed'
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
          }`}
        >
          {status === 'deployed' ? <CheckCircle className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
          {status === 'deployed' ? 'Deployed' : 'Draft'}
        </button>
        <span className="text-slate-300">|</span>
        <span className="text-xs text-slate-500 font-medium">Bucket label:</span>
        {BUCKET_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setBucketGroup(bucketGroup === opt.value ? null : opt.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all ${
              bucketGroup === opt.value ? opt.color + ' ring-2 ' + opt.ring : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-slate-300">|</span>
        {ACCOUNT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setAccountType(accountType === opt.value ? null : opt.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all ${
              accountType === opt.value ? opt.color + ' ring-2 ' + opt.ring : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {((bucketGroup !== initBucketGroup) || (accountType !== initAccountType)) && (
          <button
            onClick={saveMeta}
            disabled={savingMeta}
            className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {savingMeta ? 'Saving…' : 'Save labels'}
          </button>
        )}
      </div>

      {/* Ticker search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">Add Ticker</h2>
        <div ref={searchRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setDropdownOpen(true)}
              placeholder="Search ticker or name — e.g. VTI, S&P 500, Apple…"
              className="w-full pl-9 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
          </div>

          {dropdownOpen && results.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {results.map(sec => (
                <button
                  key={sec.ticker}
                  onClick={() => { setSelected(sec); setQuery(`${sec.ticker} — ${sec.name}`); setDropdownOpen(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm bg-slate-100 px-2 py-0.5 rounded min-w-[52px] text-center">
                      {sec.ticker}
                    </span>
                    <div>
                      <p className="text-sm text-slate-700 truncate max-w-[260px]">{sec.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{sec.asset_type}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {sec.price > 0 && <p className="text-sm font-semibold text-slate-700">${sec.price.toFixed(2)}</p>}
                    {sec.year_return !== undefined && (
                      <p className={`text-xs flex items-center gap-0.5 justify-end ${sec.year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {sec.year_return >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {(sec.year_return * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className="mt-3 flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-sm bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{selected.ticker}</span>
              <span className="text-sm text-slate-700">{selected.name}</span>
              {selected.price > 0 && <span className="text-sm font-semibold text-slate-600">${selected.price.toFixed(2)}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setSelected(null); setQuery(''); }} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => addHolding(selected)}
                disabled={adding}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add to Portfolio
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Holdings table */}
      {holdings.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Holdings — {holdings.length} {holdings.length === 1 ? 'ticker' : 'tickers'}</h2>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold ${weightColor}`}>
                Total weight: {totalWeight}%
                {totalWeight !== 100 && <span className="ml-1 opacity-70">(target 100%)</span>}
              </span>
              {holdings.length > 1 && (
                <button
                  onClick={equalizeWeights}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Equal weights
                </button>
              )}
              {dirtyWeights.size > 0 && (
                <button
                  onClick={saveWeights}
                  disabled={savingWeights}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingWeights ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save weights
                </button>
              )}
            </div>
          </div>

          {/* Weight bar */}
          <div className="flex h-1.5">
            {holdings.map((h, i) => {
              const hue = [140, 210, 30, 270, 0, 45, 180, 310][i % 8];
              return (
                <div
                  key={h.id}
                  style={{ width: `${weights[h.id] ?? 0}%`, backgroundColor: `hsl(${hue}, 60%, 50%)` }}
                  className="transition-all"
                />
              );
            })}
            {totalWeight < 100 && (
              <div style={{ width: `${100 - totalWeight}%` }} className="bg-slate-100 transition-all" />
            )}
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Ticker</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Name</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Weight %</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">1yr Return</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Price</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => {
                const w = weights[h.id] ?? 0;
                const isDirty = dirtyWeights.has(h.id);
                return (
                  <tr key={h.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                    <td className="px-5 py-3">
                      <span className="font-mono font-bold text-sm bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                        {h.ticker}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600 max-w-[200px] truncate">{h.name || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={w}
                          onChange={e => handleWeightChange(h.id, e.target.value)}
                          className={`w-16 text-right text-sm font-semibold border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums ${
                            isDirty ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200'
                          }`}
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {h.year_return !== undefined ? (
                        <span className={`text-sm font-medium ${h.year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {h.year_return >= 0 ? '+' : ''}{(h.year_return * 100).toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-slate-600">
                      {h.price ? `$${h.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => removeHolding(h.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl py-16 text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">No tickers yet</p>
          <p className="text-xs text-slate-400">Search for a ticker above to add your first holding.</p>
        </div>
      )}
    </div>
  );
}
