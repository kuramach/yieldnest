'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Brain, Equal, RotateCcw, Save, Loader2, SlidersHorizontal } from 'lucide-react';
import SecuritySearch from '@/components/SecuritySearch';
import BuilderModal from '@/components/BuilderModal';
import type { BucketHolding, SecurityQuote, SuggestedPortfolio, TickerRating } from '@/lib/types';

const ANALYST_LABELS: Record<string, { label: string; color: string }> = {
  strongBuy:  { label: 'Strong Buy',  color: 'bg-emerald-100 text-emerald-800' },
  buy:        { label: 'Buy',         color: 'bg-green-100 text-green-700' },
  hold:       { label: 'Hold',        color: 'bg-amber-100 text-amber-700' },
  sell:       { label: 'Sell',        color: 'bg-orange-100 text-orange-700' },
  strongSell: { label: 'Strong Sell', color: 'bg-rose-100 text-rose-700' },
};

interface Props {
  bucketId: number;
  portfolioId: number;
  holdings: (BucketHolding & { quote?: SecurityQuote })[];
  bucketTargetReturn: number;
  bucketLifespanYears: number;
  bucketInitialAmount: number;
}

export default function BucketDetailClient({
  bucketId, portfolioId, holdings,
  bucketTargetReturn, bucketLifespanYears, bucketInitialAmount,
}: Props) {
  const router = useRouter();
  const [showBuilder, setShowBuilder] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [ratingMap, setRatingMap] = useState<Record<string, TickerRating>>({});

  // Weight editing
  const [editWeights, setEditWeights] = useState<Record<number, string>>(() =>
    Object.fromEntries(holdings.map(h => [h.id, (h.weight * 100).toFixed(1)]))
  );
  const [savingWeights, setSavingWeights] = useState(false);
  const [suggestingWeights, setSuggestingWeights] = useState(false);
  const [weightRationale, setWeightRationale] = useState('');
  const [weightError, setWeightError] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);

  // Re-init when holdings change (e.g. after add/delete)
  useEffect(() => {
    setEditWeights(Object.fromEntries(holdings.map(h => [h.id, (h.weight * 100).toFixed(1)])));
  }, [holdings]);

  useEffect(() => {
    const tickers = holdings.map(h => h.ticker);
    if (tickers.length === 0) return;
    fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    })
      .then(r => r.json())
      .then(({ ratings }: { ratings: TickerRating[] }) => {
        const map: Record<string, TickerRating> = {};
        ratings.forEach(r => { map[r.ticker] = r; });
        setRatingMap(map);
      })
      .catch(() => {});
  }, [holdings]);

  const totalWeightPct = useMemo(
    () => Object.values(editWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [editWeights]
  );

  function setEqual() {
    const eq = (100 / holdings.length).toFixed(1);
    setEditWeights(Object.fromEntries(holdings.map(h => [h.id, eq])));
    setWeightRationale('');
  }

  function normalize() {
    if (totalWeightPct === 0) return;
    const n: Record<number, string> = {};
    for (const [id, v] of Object.entries(editWeights)) {
      n[Number(id)] = ((parseFloat(v) || 0) / totalWeightPct * 100).toFixed(1);
    }
    setEditWeights(n);
  }

  async function suggestWeights() {
    setSuggestingWeights(true);
    setWeightError('');
    setWeightRationale('');
    try {
      const res = await fetch('/api/portfolios/suggest-weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: holdings.map(h => ({
            ticker: h.ticker,
            name: h.name || h.quote?.name,
            asset_type: h.asset_type,
            year_return: h.quote?.year_return,
          })),
          target_return: bucketTargetReturn,
          available_cash: bucketInitialAmount,
          lifespan_years: bucketLifespanYears,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Suggestion failed');
      const next: Record<number, string> = {};
      for (const h of holdings) {
        const w = json.weights[h.ticker] ?? 0;
        next[h.id] = (w * 100).toFixed(1);
      }
      setEditWeights(next);
      setWeightRationale(json.rationale ?? '');
    } catch (e: any) {
      setWeightError(e.message);
    } finally {
      setSuggestingWeights(false);
    }
  }

  async function saveWeights() {
    setSavingWeights(true);
    setWeightError('');
    setWeightSaved(false);
    try {
      const total = Object.values(editWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (total === 0) throw new Error('Total weight is 0');
      await Promise.all(
        holdings.map(h => {
          const pct = parseFloat(editWeights[h.id] ?? '0') || 0;
          const w = total > 0 ? pct / total : 1 / holdings.length;
          return fetch(`/api/holdings/${h.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weight: Math.round(w * 10000) / 10000 }),
          });
        })
      );
      setWeightSaved(true);
      setTimeout(() => setWeightSaved(false), 3000);
      router.refresh();
    } catch (e: any) {
      setWeightError(e.message);
    } finally {
      setSavingWeights(false);
    }
  }

  async function handleAddSecurity(security: SecurityQuote, weight: number) {
    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket_id: bucketId,
        ticker: security.ticker,
        name: security.name,
        asset_type: security.asset_type,
        weight,
        quantity: 0,
        purchase_price: security.price,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add holding');
    }
    router.refresh();
  }

  async function handleDelete(holdingId: number) {
    setDeleting(holdingId);
    try {
      await fetch(`/api/holdings/${holdingId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handleApplyPortfolio(portfolio: SuggestedPortfolio) {
    await Promise.all(
      portfolio.holdings.map((h) =>
        fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket_id: bucketId,
            ticker: h.ticker,
            name: h.name,
            asset_type: h.asset_type,
            weight: h.weight,
            quantity: 0,
            purchase_price: h.price,
          }),
        })
      )
    );
    router.refresh();
  }

  const isDirty = holdings.some(h => {
    const saved = (h.weight * 100).toFixed(1);
    return editWeights[h.id] !== saved;
  });

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowBuilder(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Portfolio Builder
        </button>
      </div>

      {/* Security search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <SecuritySearch bucketId={bucketId} onAdd={handleAddSecurity} />
      </div>

      {/* Weight editing + manage holdings */}
      {holdings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-700">Manage Holdings &amp; Weights</h4>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${Math.abs(totalWeightPct - 100) < 0.5 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {totalWeightPct.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-400">{bucketLifespanYears}yr · {(bucketTargetReturn * 100).toFixed(0)}% target</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={setEqual} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg text-slate-600 transition-colors">
                <Equal className="w-3 h-3" /> Equal
              </button>
              <button onClick={normalize} className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg text-slate-600 transition-colors">
                Normalize
              </button>
              <button onClick={suggestWeights} disabled={suggestingWeights}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50">
                {suggestingWeights ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                {suggestingWeights ? 'Thinking…' : 'AI Suggest'}
              </button>
              {isDirty && (
                <button onClick={saveWeights} disabled={savingWeights}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50">
                  {savingWeights ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {savingWeights ? 'Saving…' : 'Save Weights'}
                </button>
              )}
              {weightSaved && (
                <span className="text-xs font-semibold text-emerald-600">Saved ✓</span>
              )}
            </div>
          </div>

          {/* AI rationale */}
          {weightRationale && (
            <div className="flex gap-2 items-start px-5 py-3 bg-violet-50 border-b border-violet-100 text-xs text-violet-800">
              <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500" />
              {weightRationale}
            </div>
          )}

          {/* Error */}
          {weightError && (
            <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{weightError}</div>
          )}

          {/* Holdings list */}
          <div className="divide-y divide-slate-50">
            {holdings.map((h) => {
              const rating = ratingMap[h.ticker];
              const ar = rating?.analyst_rating ? ANALYST_LABELS[rating.analyst_rating] : null;
              const rawPct = parseFloat(editWeights[h.id] ?? '0') || 0;
              const isModified = editWeights[h.id] !== (h.weight * 100).toFixed(1);
              const liveWeight = totalWeightPct > 0 ? rawPct / totalWeightPct : 1 / holdings.length;
              const dollarAmount = bucketInitialAmount > 0 ? bucketInitialAmount * liveWeight : 0;

              return (
                <div key={h.id} className={`flex items-center gap-3 px-5 py-3 ${isModified ? 'bg-violet-50/40' : ''}`}>
                  {/* Ticker */}
                  <span className="font-mono font-bold text-sm text-slate-800 bg-slate-100 px-2 py-0.5 rounded shrink-0 w-16 text-center">
                    {h.ticker}
                  </span>

                  {/* Weight input */}
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0} max={100} step={0.5}
                      value={editWeights[h.id] ?? ''}
                      onChange={e => setEditWeights(prev => ({ ...prev, [h.id]: e.target.value }))}
                      className={`w-16 text-center border rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent ${isModified ? 'border-violet-300' : 'border-slate-200'}`}
                    />
                    <span className="text-slate-400 text-xs">%</span>
                  </div>

                  {/* Weight bar */}
                  <div className="w-20 shrink-0">
                    <div className="bg-slate-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${isModified ? 'bg-violet-500' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(liveWeight * 100, 100)}%` }} />
                    </div>
                  </div>

                  {/* Ratings + meta */}
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                    {ar && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ar.color}`}>
                        {ar.label}
                        {rating?.analyst_count ? <span className="font-normal ml-1 opacity-70">({rating.analyst_count})</span> : null}
                      </span>
                    )}
                    {!ar && rating?.fund_category && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {rating.fund_category}
                      </span>
                    )}
                    {rating?.yield_rate != null && (
                      <span className="text-xs text-slate-400">{(rating.yield_rate * 100).toFixed(2)}% yield</span>
                    )}
                    {rating?.five_year_return != null && (
                      <span className="text-xs text-slate-400">5yr: <span className={rating.five_year_return >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{(rating.five_year_return * 100).toFixed(1)}%</span></span>
                    )}
                    {rating?.ten_year_return != null && (
                      <span className="text-xs text-slate-400">10yr: <span className={rating.ten_year_return >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{(rating.ten_year_return * 100).toFixed(1)}%</span></span>
                    )}
                  </div>

                  {/* Dollar amount */}
                  {dollarAmount > 0 && (
                    <span className="text-xs text-slate-500 shrink-0">
                      ${dollarAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(h.id)}
                    disabled={deleting === h.id}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Builder modal */}
      {showBuilder && (
        <BuilderModal
          bucketId={bucketId}
          onClose={() => setShowBuilder(false)}
          onApply={handleApplyPortfolio}
        />
      )}
    </div>
  );
}
