'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Brain, Equal, Save, Loader2, SlidersHorizontal, Hammer, AlertTriangle, TrendingUp, Upload } from 'lucide-react';
import SecuritySearch from '@/components/SecuritySearch';
import BuilderModal from '@/components/BuilderModal';
import CsvImportModal from '@/components/CsvImportModal';
import CollaboratorsPanel from '@/components/CollaboratorsPanel';
import ProposalsPanel from '@/components/ProposalsPanel';
import StressTestPanel from './StressTestPanel';
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
  bucketName: string;
  holdings: (BucketHolding & { quote?: SecurityQuote })[];
  initialRatingMap: Record<string, TickerRating>;
  actualReturn: number;
  currentValue: number;
  driftWarning: boolean;
  bucketTargetReturn: number;
  bucketLifespanYears: number;
  bucketInitialAmount: number;
  isOwner?: boolean;
  collaboratorRole?: string;
}

export default function BucketDetailClient({
  bucketId,
  portfolioId,
  bucketName,
  holdings,
  initialRatingMap,
  actualReturn,
  currentValue,
  driftWarning,
  bucketTargetReturn,
  bucketLifespanYears,
  bucketInitialAmount,
  isOwner = true,
  collaboratorRole,
}: Props) {
  const router = useRouter();
  const [showBuilder, setShowBuilder] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Seed rating map from server-fetched prop; only re-fetch after mutations
  const [ratingMap, setRatingMap] = useState<Record<string, TickerRating>>(initialRatingMap);

  // Weight editing — keyed by holding id
  const [editWeights, setEditWeights] = useState<Record<number, string>>(() =>
    Object.fromEntries(holdings.map(h => [h.id, (h.weight * 100).toFixed(1)]))
  );
  const [savingWeights, setSavingWeights] = useState(false);

  // Sync editWeights when holdings prop changes (e.g. after router.refresh())
  useEffect(() => {
    setEditWeights(prev => {
      const next = { ...prev };
      const activeIds = new Set(holdings.map(h => h.id));
      // Add entries for new holdings; don't overwrite in-progress edits
      for (const h of holdings) {
        if (!(h.id in next)) next[h.id] = (h.weight * 100).toFixed(1);
      }
      // Remove stale ids for deleted holdings
      for (const key in next) {
        if (!activeIds.has(Number(key))) delete next[key];
      }
      return next;
    });
  }, [holdings]);
  const [suggestingWeights, setSuggestingWeights] = useState(false);
  const [weightRationale, setWeightRationale] = useState('');
  const [weightError, setWeightError] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);

  // Bucket name editing
  const [name, setName] = useState(bucketName);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(bucketName);
  const [savingName, setSavingName] = useState(false);

  async function saveName() {
    const val = nameInput.trim();
    if (!val) return;
    setSavingName(true);
    try {
      await fetch(`/api/buckets/${bucketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val }),
      });
      setName(val);
      setEditingName(false);
      router.refresh();
    } finally {
      setSavingName(false);
    }
  }

  // Target return editing
  const [targetReturn, setTargetReturn] = useState(bucketTargetReturn);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState((bucketTargetReturn * 100).toFixed(0));
  const [savingTarget, setSavingTarget] = useState(false);

  async function saveTargetReturn() {
    const val = parseFloat(targetInput);
    if (isNaN(val) || val < 0 || val > 100) return;
    setSavingTarget(true);
    try {
      await fetch(`/api/buckets/${bucketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_return: val / 100 }),
      });
      setTargetReturn(val / 100);
      setEditingTarget(false);
      router.refresh();
    } finally {
      setSavingTarget(false);
    }
  }

  // Lifespan editing
  const [lifespan, setLifespan] = useState(bucketLifespanYears);
  const [editingLifespan, setEditingLifespan] = useState(false);
  const [lifespanInput, setLifespanInput] = useState(String(bucketLifespanYears));
  const [savingLifespan, setSavingLifespan] = useState(false);

  async function saveLifespan() {
    const val = parseInt(lifespanInput, 10);
    if (isNaN(val) || val < 1 || val > 50) return;
    setSavingLifespan(true);
    try {
      await fetch(`/api/buckets/${bucketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifespan_years: val }),
      });
      setLifespan(val);
      setEditingLifespan(false);
      router.refresh();
    } finally {
      setSavingLifespan(false);
    }
  }

  // Re-sync weight inputs when holdings prop changes (after add/delete refresh)
  useEffect(() => {
    setEditWeights(Object.fromEntries(holdings.map(h => [h.id, (h.weight * 100).toFixed(1)])));
  }, [holdings]);

  // Refresh ratings only after mutations (triggered by holdings length change)
  const holdingsKey = holdings.map(h => h.ticker).join(',');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingsKey]);

  const totalWeightPct = useMemo(
    () => Object.values(editWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [editWeights]
  );

  // Live weighted return using current edit weights
  const liveWeightedReturn = useMemo(() => {
    const n = holdings.length;
    if (n === 0) return 0;
    return holdings.reduce((s, h) => {
      const rawPct = parseFloat(editWeights[h.id] ?? '0') || 0;
      const w = totalWeightPct > 0 ? rawPct / totalWeightPct : 1 / n;
      return s + w * (h.quote?.year_return ?? 0);
    }, 0);
  }, [holdings, editWeights, totalWeightPct]);

  // Live total value using current edit weights
  const liveTotalValue = useMemo(() => {
    if (bucketInitialAmount <= 0) return 0;
    const n = holdings.length;
    if (n === 0) return 0;
    return holdings.reduce((s, h) => {
      const rawPct = parseFloat(editWeights[h.id] ?? '0') || 0;
      const w = totalWeightPct > 0 ? rawPct / totalWeightPct : 1 / n;
      if (h.quantity > 0 && h.quote?.price) return s + h.quantity * h.quote.price;
      return s + w * bucketInitialAmount;
    }, 0);
  }, [holdings, editWeights, totalWeightPct, bucketInitialAmount]);

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

  // Return color logic
  const returnDiff = liveWeightedReturn - targetReturn;
  const returnColor =
    liveWeightedReturn >= targetReturn
      ? 'text-emerald-600'
      : returnDiff > -0.02
      ? 'text-amber-500'
      : 'text-red-500';

  return (
    <div className="space-y-5">

      {/* ── Bucket Name (inline editable) ── */}
      <div className="flex items-center gap-3 group">
        {editingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
              className="text-2xl font-bold text-slate-900 border-b-2 border-emerald-400 bg-transparent focus:outline-none w-full max-w-sm"
            />
            <button onClick={saveName} disabled={savingName} className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
            <button onClick={() => setEditingName(false)} className="text-sm text-slate-400 hover:text-slate-600">✕</button>
          </div>
        ) : (
          <button
            onClick={() => { setNameInput(name); setEditingName(true); }}
            className="text-2xl font-bold text-slate-900 hover:text-emerald-700 transition-colors text-left"
            title="Click to rename"
          >
            {name}
            <span className="ml-2 text-xs font-normal text-slate-300 group-hover:text-slate-400 align-middle">✎</span>
          </button>
        )}
      </div>

      {/* ── Section 1: Performance Strip ── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Performance</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {/* Actual return */}
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-bold tabular-nums ${holdings.length > 0 ? returnColor : 'text-slate-300'}`}>
                {holdings.length > 0
                  ? `${liveWeightedReturn >= 0 ? '+' : ''}${(liveWeightedReturn * 100).toFixed(1)}%`
                  : '—'}
              </span>
              <span className="text-xs text-slate-400">vs</span>
              {editingTarget ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTargetReturn(); if (e.key === 'Escape') setEditingTarget(false); }}
                    autoFocus
                    className="w-12 text-center border border-slate-300 rounded-lg px-1 py-0.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <span className="text-xs text-slate-500">% target</span>
                  <button onClick={saveTargetReturn} disabled={savingTarget} className="p-0.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                    {savingTarget ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  </button>
                  <button onClick={() => setEditingTarget(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => { setTargetInput((targetReturn * 100).toFixed(0)); setEditingTarget(true); }}
                  className="text-xs text-slate-400 hover:text-emerald-600 transition-colors underline-offset-2 hover:underline"
                  title="Click to edit target return"
                >
                  {(targetReturn * 100).toFixed(0)}% target
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Actual return (trailing 12mo)</p>
          </div>

          <div className="w-px h-8 bg-slate-100 hidden sm:block" />

          {/* Current value */}
          <div>
            <div className="text-xl font-bold text-slate-800 tabular-nums">
              {bucketInitialAmount > 0 && holdings.length > 0
                ? `$${(currentValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : '—'}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Current value</p>
          </div>

          <div className="w-px h-8 bg-slate-100 hidden sm:block" />

          {/* Holdings count */}
          <div>
            <div className="text-xl font-bold text-slate-800 tabular-nums">{holdings.length}</div>
            <p className="text-xs text-slate-400 mt-0.5">
              {holdings.length === 1 ? 'holding' : 'holdings'}
            </p>
          </div>

          <div className="w-px h-8 bg-slate-100 hidden sm:block" />

          {/* Lifespan — click to edit */}
          <div>
            {editingLifespan ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={lifespanInput}
                  onChange={e => setLifespanInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveLifespan(); if (e.key === 'Escape') setEditingLifespan(false); }}
                  autoFocus
                  className="w-14 text-center border border-slate-300 rounded-lg px-1.5 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-xs text-slate-500">yr</span>
                <button
                  onClick={saveLifespan}
                  disabled={savingLifespan}
                  className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                >
                  {savingLifespan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setEditingLifespan(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setLifespanInput(String(lifespan)); setEditingLifespan(true); }}
                className="group text-left"
                title="Click to edit lifespan"
              >
                <div className="text-xl font-bold text-slate-800 tabular-nums group-hover:text-emerald-600 transition-colors">
                  {lifespan}yr
                </div>
                <p className="text-xs text-slate-400 mt-0.5 group-hover:text-slate-500">lifespan <span className="text-slate-300">(edit)</span></p>
              </button>
            )}
          </div>

          {/* Real P&L — shown when cost_basis is populated */}
          {(() => {
            const holdingsWithCostBasis = holdings.filter(h => h.cost_basis != null && h.cost_basis > 0);
            if (holdingsWithCostBasis.length === 0) return null;
            const totalCostBasis = holdingsWithCostBasis.reduce((s, h) => s + (h.cost_basis ?? 0), 0);
            const unrealizedGain = currentValue - totalCostBasis;
            const brokerages = [...new Set(holdingsWithCostBasis.map(h => h.brokerage).filter(Boolean))];
            const brokerageLabel = brokerages.length === 1 ? brokerages[0] : null;
            return (
              <>
                <div className="w-px h-8 bg-slate-100 hidden sm:block" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xl font-bold tabular-nums ${
                        unrealizedGain >= 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {unrealizedGain >= 0 ? '+' : ''}
                      ${Math.abs(unrealizedGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    {brokerageLabel && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">
                        via {brokerageLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Unrealized gain/loss</p>
                </div>
              </>
            );
          })()}

          {/* Drift warning badge */}
          {driftWarning && (
            <>
              <div className="w-px h-8 bg-slate-100 hidden sm:block" />
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-amber-700">Rebalance suggested</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section 2 & 3 merged: Holdings + Portfolio Builder ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Card header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-700">
                Holdings {holdings.length > 0 && `(${holdings.length})`}
              </h4>
              {holdings.length > 0 && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    Math.abs(totalWeightPct - 100) < 0.5
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {totalWeightPct.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {holdings.length > 0 && (
                <>
                  <button
                    onClick={setEqual}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg text-slate-600 transition-colors"
                  >
                    <Equal className="w-3 h-3" /> Equal
                  </button>
                  <button
                    onClick={normalize}
                    className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg text-slate-600 transition-colors"
                  >
                    Normalize
                  </button>
                  <button
                    onClick={suggestWeights}
                    disabled={suggestingWeights}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {suggestingWeights ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Brain className="w-3 h-3" />
                    )}
                    {suggestingWeights ? 'Thinking…' : 'AI Weights'}
                  </button>
                  {isDirty && (
                    <button
                      onClick={saveWeights}
                      disabled={savingWeights}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {savingWeights ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      {savingWeights ? 'Saving…' : 'Save'}
                    </button>
                  )}
                  {weightSaved && (
                    <span className="text-xs font-semibold text-emerald-600">Saved ✓</span>
                  )}
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                </>
              )}
              <button
                onClick={() => setShowCsvModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-slate-400 text-slate-600 rounded-lg transition-colors shrink-0"
              >
                <Upload className="w-3 h-3" />
                Import CSV
              </button>
              <button
                onClick={() => setShowBuilder(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shrink-0"
              >
                <Hammer className="w-3 h-3" />
                AI Builder
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
            <SecuritySearch bucketId={bucketId} onAdd={handleAddSecurity} />
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
            <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
              {weightError}
            </div>
          )}

          {/* Table — only show when there are holdings */}
          {holdings.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-5 py-2.5 font-medium">Ticker</th>
                  <th className="text-left px-4 py-2.5 font-medium w-36">Weight %</th>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Category / Ratings</th>
                  <th className="text-right px-4 py-2.5 font-medium">Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">1yr Return</th>
                  {bucketInitialAmount > 0 && (
                    <th className="text-right px-4 py-2.5 font-medium">Value</th>
                  )}
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const rating = ratingMap[h.ticker];
                  const ar = rating?.analyst_rating ? ANALYST_LABELS[rating.analyst_rating] : null;
                  const yr = h.quote?.year_return;
                  const rawPct = parseFloat(editWeights[h.id] ?? '0') || 0;
                  const isModified = editWeights[h.id] !== (h.weight * 100).toFixed(1);
                  const liveWeight = totalWeightPct > 0 ? rawPct / totalWeightPct : 1 / holdings.length;
                  const holdingValue =
                    h.quantity > 0 && h.quote?.price
                      ? h.quantity * h.quote.price
                      : liveWeight * bucketInitialAmount;

                  return (
                    <tr
                      key={h.id}
                      className={`border-b border-slate-50 transition-colors ${
                        isModified ? 'bg-violet-50/50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Ticker */}
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">
                          {h.ticker}
                        </span>
                      </td>

                      {/* Weight input + bar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={editWeights[h.id] ?? ''}
                              onChange={e =>
                                setEditWeights(prev => ({ ...prev, [h.id]: e.target.value }))
                              }
                              className={`w-14 text-center border rounded-lg px-1.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent ${
                                isModified ? 'border-violet-300' : 'border-slate-200'
                              }`}
                            />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                          <div className="w-14 shrink-0">
                            <div className="bg-slate-100 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  isModified ? 'bg-violet-400' : 'bg-emerald-400'
                                }`}
                                style={{ width: `${Math.min(liveWeight * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3 text-slate-600 max-w-[160px]">
                        <span className="truncate block">{h.name || h.quote?.name || h.ticker}</span>
                      </td>

                      {/* Category / Ratings */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {ar ? (
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${ar.color}`}>
                              {ar.label}
                              {rating?.analyst_count ? (
                                <span className="font-normal ml-1 opacity-70">({rating.analyst_count})</span>
                              ) : null}
                            </span>
                          ) : rating?.fund_category ? (
                            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 w-fit">
                              {rating.fund_category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                          {rating?.yield_rate != null && (
                            <span className="text-xs text-slate-400">
                              Yield:{' '}
                              <span className="font-semibold text-emerald-700">
                                {(rating.yield_rate * 100).toFixed(2)}%
                              </span>
                            </span>
                          )}
                          {(rating?.three_year_return != null ||
                            rating?.five_year_return != null ||
                            rating?.ten_year_return != null ||
                            rating?.twenty_year_return != null) && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {rating?.three_year_return != null && (
                                <span className="text-xs text-slate-400">
                                  3yr:{' '}
                                  <span
                                    className={`font-semibold ${
                                      rating.three_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}
                                  >
                                    {(rating.three_year_return * 100).toFixed(1)}%
                                  </span>
                                </span>
                              )}
                              {rating?.five_year_return != null && (
                                <span className="text-xs text-slate-400">
                                  5yr:{' '}
                                  <span
                                    className={`font-semibold ${
                                      rating.five_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}
                                  >
                                    {(rating.five_year_return * 100).toFixed(1)}%
                                  </span>
                                </span>
                              )}
                              {rating?.ten_year_return != null && (
                                <span className="text-xs text-slate-400">
                                  10yr:{' '}
                                  <span
                                    className={`font-semibold ${
                                      rating.ten_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}
                                  >
                                    {(rating.ten_year_return * 100).toFixed(1)}%
                                  </span>
                                </span>
                              )}
                              {rating?.twenty_year_return != null && (
                                <span className="text-xs text-slate-400">
                                  20yr:{' '}
                                  <span
                                    className={`font-semibold ${
                                      rating.twenty_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}
                                  >
                                    {(rating.twenty_year_return * 100).toFixed(1)}%
                                  </span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {h.quote?.price ? `$${h.quote.price.toFixed(2)}` : '—'}
                      </td>

                      {/* 1yr Return */}
                      <td className="px-4 py-3 text-right tabular-nums">
                        {yr !== undefined ? (
                          <span
                            className={`font-semibold ${
                              yr >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}
                          >
                            {yr >= 0 ? '+' : ''}
                            {(yr * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Value */}
                      {bucketInitialAmount > 0 && (
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          ${holdingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      )}

                      {/* Delete */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(h.id)}
                          disabled={deleting === h.id}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deleting === h.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer totals */}
              <tfoot>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600 border-t border-slate-100">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-4 py-3">
                    <span
                      className={`${
                        Math.abs(totalWeightPct - 100) < 0.5
                          ? 'text-emerald-700'
                          : 'text-amber-600'
                      }`}
                    >
                      {totalWeightPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right">
                    {holdings.length > 0 ? (
                      <span
                        className={
                          liveWeightedReturn >= bucketTargetReturn
                            ? 'text-emerald-700'
                            : 'text-amber-600'
                        }
                      >
                        {liveWeightedReturn >= 0 ? '+' : ''}
                        {(liveWeightedReturn * 100).toFixed(1)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {bucketInitialAmount > 0 && (
                    <td className="px-4 py-3 text-right">
                      ${liveTotalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  )}
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </div>

      {/* ── Section 3: Stress Test ── */}
      {holdings.length > 0 && bucketInitialAmount > 0 && (
        <StressTestPanel
          holdings={holdings.map(h => ({
            weight: h.weight,
            year_return: h.quote?.year_return,
            asset_type: h.asset_type,
          }))}
          lifespan_years={lifespan}
          initial_amount={bucketInitialAmount}
        />
      )}

      {/* ── Proposals Panel ── */}
      <ProposalsPanel
        bucketId={bucketId}
        isOwner={isOwner}
        holdings={holdings.map(h => ({
          id: h.id,
          ticker: h.ticker,
          name: h.name,
          weight: h.weight,
          asset_type: h.asset_type,
        }))}
        bucketTargetReturn={bucketTargetReturn}
        bucketLifespanYears={bucketLifespanYears}
      />

      {/* ── Collaborators Panel (owner only) ── */}
      {isOwner !== false && (
        <CollaboratorsPanel bucketId={bucketId} />
      )}

      {/* Builder modal */}
      {showBuilder && (
        <BuilderModal
          bucketId={bucketId}
          onClose={() => setShowBuilder(false)}
          onApply={handleApplyPortfolio}
        />
      )}

      {/* CSV Import modal */}
      {showCsvModal && (
        <CsvImportModal
          bucketId={bucketId}
          onSuccess={() => {
            setShowCsvModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
