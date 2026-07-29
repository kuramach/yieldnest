'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import type { SecurityQuote } from '@/lib/types';

interface SecuritySearchProps {
  bucketId: number;
  onAdd: (security: SecurityQuote, weight: number) => Promise<void>;
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export default function SecuritySearch({ bucketId, onAdd }: SecuritySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SecurityQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SecurityQuote | null>(null);
  const [weight, setWeight] = useState(10);
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchSecurities = useCallback(
    debounce(async (...args: unknown[]) => {
      const q = args[0] as string;
      if (!q.trim() || q.trim().length < 1) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/securities/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: SecurityQuote[] = await res.json();
          setResults(data);
          setOpen(data.length > 0);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 400),
    []
  );

  useEffect(() => {
    searchSecurities(query);
  }, [query, searchSecurities]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleAdd() {
    if (!selected || !bucketId) return;
    setAdding(true);
    try {
      await onAdd(selected, weight / 100);
      setSelected(null);
      setQuery('');
      setResults([]);
      setWeight(10);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-700">Search & Add Security</h4>

      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search ticker or name (e.g. VTI, S&P 500...)"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Dropdown */}
        {open && results.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {results.map((security) => (
              <button
                key={security.ticker}
                onClick={() => {
                  setSelected(security);
                  setQuery(`${security.ticker} — ${security.name}`);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-slate-800 bg-slate-100 px-2 py-0.5 rounded min-w-[52px] text-center">
                    {security.ticker}
                  </span>
                  <div>
                    <p className="text-sm text-slate-700 truncate max-w-[220px]">{security.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{security.asset_type}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {security.price > 0 && (
                    <p className="text-sm font-semibold text-slate-700">
                      ${security.price.toFixed(2)}
                    </p>
                  )}
                  {security.year_return !== undefined && (
                    <p className={`text-xs flex items-center gap-0.5 justify-end ${security.year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {security.year_return >= 0
                        ? <TrendingUp className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />
                      }
                      {(security.year_return * 100).toFixed(1)}% 1yr
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Weight + Add form */}
      {selected && (
        <div className="border border-emerald-100 bg-emerald-50/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">{selected.ticker}</p>
              <p className="text-xs text-slate-500">{selected.name}</p>
            </div>
            {selected.price > 0 && (
              <p className="text-lg font-bold text-slate-700">${selected.price.toFixed(2)}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              Portfolio weight: <span className="text-emerald-700 font-bold">{weight}%</span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={weight}
              onChange={(e) => setWeight(parseInt(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>1%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setSelected(null); setQuery(''); }}
              className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {adding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              Add to Bucket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
