'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, ChevronRight, ChevronLeft, Check, Globe, Lock,
  TrendingUp, TrendingDown, AlertCircle, Loader2, DollarSign,
  BarChart3, Minus, RotateCcw, SlidersHorizontal, Brain, Equal,
} from 'lucide-react';
import type { ImportedHolding, HoldingHistoricalStats, PortfolioAnalysis, OptimizationResult } from '@/lib/types';

type Step = 'upload' | 'preview' | 'analyze' | 'optimize' | 'save';
const STEPS: Step[] = ['upload', 'preview', 'analyze', 'optimize', 'save'];
const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload',
  preview: 'Holdings',
  analyze: 'AI Analysis',
  optimize: 'Optimize',
  save: 'Save',
};

const ANALYST_LABELS: Record<string, { label: string; color: string }> = {
  strongBuy:  { label: 'Strong Buy',  color: 'bg-emerald-100 text-emerald-800' },
  buy:        { label: 'Buy',         color: 'bg-green-100 text-green-700' },
  hold:       { label: 'Hold',        color: 'bg-amber-100 text-amber-700' },
  sell:       { label: 'Sell',        color: 'bg-orange-100 text-orange-700' },
  strongSell: { label: 'Strong Sell', color: 'bg-rose-100 text-rose-700' },
};

function StarRating({ stars }: { stars?: number }) {
  if (!stars) return null;
  return (
    <span className="inline-flex gap-0.5" title={`Morningstar ${stars}/5`}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`w-3 h-3 ${i <= stars ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function pct(n: number | undefined, digits = 1) {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(digits) + '%';
}
function fmtUsd(n: number | undefined | null) {
  if (!n) return '—';
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function StepBar({ current }: { current: Step }) {
  const ci = STEPS.indexOf(current);
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
            ${i < ci ? 'bg-emerald-100 text-emerald-700'
              : i === ci ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-400'}`}>
            {i < ci ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
            {STEP_LABELS[s]}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-5 mx-1 ${i < ci ? 'bg-emerald-300' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ReturnBadge({ value, label }: { value: number; label: string }) {
  const positive = value >= 0;
  return (
    <div className={`text-center px-2 py-1.5 rounded-lg ${positive ? 'bg-emerald-50' : 'bg-rose-50'}`}>
      <p className={`text-xs font-bold ${positive ? 'text-emerald-700' : 'text-rose-600'}`}>{pct(value)}</p>
      <p className="text-[9px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fileName, setFileName] = useState('');
  const [holdings, setHoldings] = useState<ImportedHolding[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult[]>([]);
  const [weightedReturn, setWeightedReturn] = useState(0);
  const [totalAllocated, setTotalAllocated] = useState(0);
  // editedWeights: ticker → weight (0–100 as percentage string for input)
  const [editedWeights, setEditedWeights] = useState<Record<string, string>>({});

  const [targetReturn, setTargetReturn] = useState(0.07);
  const [availableCash, setAvailableCash] = useState('');
  const [lifespanYears, setLifespanYears] = useState(10);
  // Step-2 weight editing (ticker → pct string)
  const [previewWeights, setPreviewWeights] = useState<Record<string, string>>({});
  const [suggestingWeights, setSuggestingWeights] = useState(false);
  const [weightRationale, setWeightRationale] = useState('');

  // Save form
  const [portfolioName, setPortfolioName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  async function handleFileUpload(file: File) {
    setError('');
    setUploading(true);
    setFileName(file.name);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/portfolios/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setHoldings(json.holdings);
      setPortfolioName(file.name.replace(/\.[^.]+$/, ''));
      // Initialize equal weights for preview step
      const eq: Record<string, string> = {};
      for (const h of json.holdings) eq[h.ticker] = (100 / json.holdings.length).toFixed(1);
      setPreviewWeights(eq);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSuggestWeights() {
    setError('');
    setSuggestingWeights(true);
    setWeightRationale('');
    const cash = parseFloat(availableCash.replace(/,/g, '')) || 0;
    try {
      const res = await fetch('/api/portfolios/suggest-weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings,
          target_return: targetReturn,
          available_cash: cash,
          lifespan_years: lifespanYears,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Suggestion failed');
      const next: Record<string, string> = {};
      for (const h of holdings) {
        const w = json.weights[h.ticker] ?? 0;
        next[h.ticker] = (w * 100).toFixed(1);
      }
      setPreviewWeights(next);
      setWeightRationale(json.rationale ?? '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSuggestingWeights(false);
    }
  }

  async function handleAnalyze() {
    setError('');
    setAnalyzing(true);
    const cash = parseFloat(availableCash.replace(/,/g, '')) || 0;
    try {
      const res = await fetch('/api/portfolios/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings, target_return: targetReturn, available_cash: cash }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setAnalysis(json);
      setStep('analyze');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleOptimize() {
    setError('');
    setOptimizing(true);
    const cash = parseFloat(availableCash.replace(/,/g, '')) || 0;
    try {
      const res = await fetch('/api/portfolios/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings,
          historical_stats: analysis?.stats ?? [],
          target_return: targetReturn,
          available_cash: cash,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Optimization failed');
      setOptimized(json.optimized);
      setWeightedReturn(json.weighted_return);
      setTotalAllocated(json.total_allocated);
      // seed editable weights from AI result
      const initial: Record<string, string> = {};
      for (const h of json.optimized) initial[h.ticker] = (h.weight * 100).toFixed(1);
      setEditedWeights(initial);
      setStep('optimize');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOptimizing(false);
    }
  }

  async function handleSave() {
    if (!portfolioName.trim()) { setError('Portfolio name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const pRes = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: portfolioName.trim(), description: description.trim() || null, is_public: isPublic }),
      });
      const portfolio = await pRes.json();
      if (!pRes.ok) throw new Error(portfolio.error);

      const cash = parseFloat(availableCash.replace(/,/g, '')) || 0;
      const bRes = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolio.id,
          name: 'Imported Holdings',
          target_return: targetReturn,
          lifespan_years: lifespanYears,
          initial_amount: cash || holdings.reduce((s, h) => s + (h.value ?? 0), 0),
        }),
      });
      const bucket = await bRes.json();
      if (!bRes.ok) throw new Error(bucket.error);

      const previewTotal = Object.values(previewWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const source = liveRows.length > 0 ? liveRows : holdings.map(h => {
        const pct = parseFloat(previewWeights[h.ticker] ?? '0') || 0;
        const w = previewTotal > 0 ? pct / previewTotal : 1 / holdings.length;
        const cash2 = parseFloat(availableCash.replace(/,/g, '')) || 0;
        const dollar = cash2 > 0 ? cash2 * w : 0;
        return {
          ticker: h.ticker, name: h.name || h.ticker,
          weight: w, cagr: h.year_return ?? 0, year_return: h.year_return ?? 0,
          asset_type: h.asset_type ?? 'stock' as const,
          price: h.price ?? 0,
          dollar_amount: dollar,
          shares_to_buy: h.price && h.price > 0 && dollar > 0 ? Math.floor(dollar / h.price) : 0,
        };
      });

      await Promise.all(source.map(h =>
        fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket_id: bucket.id, ticker: h.ticker, name: h.name,
            asset_type: h.asset_type, weight: h.weight,
            quantity: h.shares_to_buy || holdings.find(ih => ih.ticker === h.ticker)?.shares || 0,
            purchase_price: h.price,
          }),
        })
      ));

      // Persist analysis snapshot if available
      if (analysis) {
        await fetch(`/api/portfolios/${portfolio.id}/analyses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stats: analysis.stats,
            ai_narrative: analysis.ai_narrative,
            target_return: targetReturn,
            available_cash: cash,
            portfolio_best: analysis.portfolio_best,
            portfolio_worst: analysis.portfolio_worst,
            portfolio_median: analysis.portfolio_median,
          }),
        }).catch(() => {}); // non-fatal
      }

      router.push(`/dashboard/portfolio/${portfolio.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const statsMap = Object.fromEntries((analysis?.stats ?? []).map(s => [s.ticker, s]));
  const cash = parseFloat(availableCash.replace(/,/g, '')) || 0;

  // Derive live values from editedWeights
  const liveRows = useMemo(() => {
    const totalPct = Object.values(editedWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    return optimized.map(h => {
      const rawPct = parseFloat(editedWeights[h.ticker] ?? '0') || 0;
      const w = totalPct > 0 ? rawPct / totalPct : 1 / optimized.length;
      const dollar = cash > 0 ? cash * w : 0;
      return { ...h, weight: w, dollar_amount: dollar, shares_to_buy: h.price > 0 && dollar > 0 ? Math.floor(dollar / h.price) : 0 };
    });
  }, [editedWeights, optimized, cash]);

  const totalWeightPct = Object.values(editedWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const liveBlended = liveRows.reduce((s, h) => s + h.weight * (h.cagr ?? 0), 0);
  const liveTotalAllocated = liveRows.reduce((s, h) => s + h.dollar_amount, 0);

  function normalizeWeights() {
    const total = Object.values(editedWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (total === 0) return;
    const normalized: Record<string, string> = {};
    for (const [t, v] of Object.entries(editedWeights)) {
      normalized[t] = ((parseFloat(v) || 0) / total * 100).toFixed(1);
    }
    setEditedWeights(normalized);
  }

  function resetToAI() {
    const reset: Record<string, string> = {};
    for (const h of optimized) reset[h.ticker] = (h.weight * 100).toFixed(1);
    setEditedWeights(reset);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Portfolio</h1>
        <p className="text-sm text-slate-400 mt-0.5">Upload a brokerage export — Claude reads it, fetches 20-year history, and optimizes weights</p>
      </div>

      <StepBar current={step} />

      {error && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4 mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === 'upload' && (
        <div
          className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="text-slate-600 font-medium">Claude is reading {fileName} and fetching live prices…</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-700 font-semibold mb-1">Drop your brokerage export here</p>
              <p className="text-sm text-slate-400 mb-4">Excel (.xlsx, .xls) or CSV — any column format</p>
              <p className="text-xs text-slate-400">Claude will identify the ticker, shares, and value columns automatically</p>
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: Preview holdings ── */}
      {step === 'preview' && (
        <div>
          {/* Weight controls header */}
          {(() => {
            const totalPct = Object.values(previewWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            return (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-slate-700">Allocation Weights</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${Math.abs(totalPct - 100) < 0.5 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {totalPct.toFixed(1)}%
                </span>
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => {
                      const eq: Record<string, string> = {};
                      for (const h of holdings) eq[h.ticker] = (100 / holdings.length).toFixed(1);
                      setPreviewWeights(eq);
                      setWeightRationale('');
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg transition-colors text-slate-600"
                  >
                    <Equal className="w-3 h-3" /> Equal Weight
                  </button>
                  <button
                    onClick={() => {
                      const total = Object.values(previewWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                      if (total === 0) return;
                      const n: Record<string, string> = {};
                      for (const [t, v] of Object.entries(previewWeights)) n[t] = ((parseFloat(v) || 0) / total * 100).toFixed(1);
                      setPreviewWeights(n);
                    }}
                    className="text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg transition-colors text-slate-600"
                  >
                    Normalize
                  </button>
                  <button
                    onClick={handleSuggestWeights}
                    disabled={suggestingWeights}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {suggestingWeights ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                    {suggestingWeights ? 'Thinking…' : 'AI Suggest Weights'}
                  </button>
                </div>
              </div>
            );
          })()}

          {weightRationale && (
            <div className="flex gap-2 items-start mb-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-800">
              <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-600" />
              {weightRationale}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{holdings.length} holdings found</h2>
              <span className="text-xs text-slate-400">{fileName}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-2.5 font-medium text-slate-500">Ticker</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Name &amp; Philosophy</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Ratings</th>
                    <th className="text-center px-4 py-2.5 font-medium text-slate-500">Weight %</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Price</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Value</th>
                    <th className="text-right px-5 py-2.5 font-medium text-slate-500">1Y Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {holdings.map(h => {
                    const ar = h.analyst_rating ? ANALYST_LABELS[h.analyst_rating] : null;
                    return (
                    <tr key={h.ticker} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900 align-top">{h.ticker}</td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="text-sm font-medium text-slate-700 truncate">{h.name || '—'}</p>
                        {h.description && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{h.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          {ar && (
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${ar.color}`}>
                              {ar.label}
                              {h.analyst_count ? <span className="font-normal ml-1 opacity-70">({h.analyst_count})</span> : null}
                            </span>
                          )}
                          {!ar && (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center align-top">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0} max={100} step={0.5}
                            value={previewWeights[h.ticker] ?? ''}
                            onChange={e => setPreviewWeights(prev => ({ ...prev, [h.ticker]: e.target.value }))}
                            className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                          />
                          <span className="text-slate-400 text-xs">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 align-top">{h.price ? fmtUsd(h.price) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700 align-top">{fmtUsd(h.value)}</td>
                      <td className={`px-5 py-3 text-right font-semibold align-top ${h.year_return == null ? 'text-slate-300' : h.year_return >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {pct(h.year_return)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Target return + cash inputs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Target Annual Return: <span className="text-emerald-600">{(targetReturn * 100).toFixed(0)}%</span>
              </label>
              <input type="range" min={2} max={20} step={0.5} value={targetReturn * 100}
                onChange={e => setTargetReturn(parseFloat(e.target.value) / 100)}
                className="w-full accent-emerald-500" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>2% Conservative</span><span>10% Balanced</span><span>20% Aggressive</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Available Cash to Invest <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={availableCash}
                    onChange={e => setAvailableCash(e.target.value)}
                    placeholder="e.g. 50,000"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <p className="text-xs text-slate-400 mt-1">Used to calculate shares to buy per holding</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Portfolio Lifespan: <span className="text-emerald-600">{lifespanYears} years</span>
                </label>
                <input type="range" min={1} max={40} step={1} value={lifespanYears}
                  onChange={e => setLifespanYears(parseInt(e.target.value))}
                  className="w-full accent-emerald-500" />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>1yr Short</span><span>10yr Medium</span><span>40yr Long</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('upload')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={handleAnalyze} disabled={analyzing}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              {analyzing ? 'Fetching 20-year history…' : 'Analyze with AI'}
              {!analyzing && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: AI Analysis ── */}
      {step === 'analyze' && analysis && (
        <div>
          {/* Portfolio-level summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Best Blended Year', value: analysis.portfolio_best, icon: TrendingUp, color: 'emerald' },
              { label: 'Median Blended Year', value: analysis.portfolio_median, icon: Minus, color: 'blue' },
              { label: 'Worst Blended Year', value: analysis.portfolio_worst, icon: TrendingDown, color: 'rose' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-2xl p-5`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 text-${color}-600`} />
                  <p className={`text-xs font-semibold text-${color}-700`}>{label}</p>
                </div>
                <p className={`text-3xl font-bold text-${color}-700`}>{pct(value, 1)}</p>
                <p className={`text-xs text-${color}-500 mt-0.5`}>equal-weight estimate</p>
              </div>
            ))}
          </div>

          {/* Per-holding historical table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Historical Performance by Holding</h2>
              <p className="text-xs text-slate-400 mt-0.5">Up to 20 years of annual return data per security</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-2.5 font-medium text-slate-500">Ticker</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">CAGR</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Best Year</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Median Year</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Worst Year</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Volatility</th>
                    <th className="text-right px-5 py-2.5 font-medium text-slate-500">Yrs Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {analysis.stats.map(s => {
                    const h = holdings.find(h => h.ticker === s.ticker);
                    return (
                    <tr key={s.ticker} className="hover:bg-slate-50">
                      <td className="px-5 py-3 align-top">
                        <p className="font-mono font-semibold text-slate-900">{s.ticker}</p>
                        {h?.description && <p className="text-xs text-slate-400 mt-0.5 max-w-[160px] leading-relaxed">{h.description}</p>}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${s.cagr >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct(s.cagr)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{pct(s.best_year)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{pct(s.median_year)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{pct(s.worst_year)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{pct(s.volatility)}</td>
                      <td className="px-5 py-3 text-right text-slate-400">{s.years_of_data}y</td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Narrative */}
          <div className="bg-slate-900 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-violet-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">AI</div>
              <h2 className="font-semibold text-white">Portfolio Analysis</h2>
              <span className="text-xs text-slate-400 ml-auto">Target: {(targetReturn * 100).toFixed(0)}%{cash > 0 ? ` · $${cash.toLocaleString()} to invest` : ''}</span>
            </div>
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{analysis.ai_narrative}</div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('preview')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={handleOptimize} disabled={optimizing}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {optimizing ? 'Optimizing…' : 'Optimize Weights'}
              {!optimizing && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Optimized weights + allocation ── */}
      {step === 'optimize' && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Blended CAGR', value: pct(liveBlended), sub: `target was ${(targetReturn * 100).toFixed(0)}%`, color: 'emerald' },
              { label: 'Cash to Deploy', value: fmtUsd(cash || null), sub: cash > 0 ? `$${(cash - liveTotalAllocated).toLocaleString(undefined, { maximumFractionDigits: 0 })} unallocated` : 'not set', color: 'blue' },
              { label: 'Total Allocated', value: fmtUsd(liveTotalAllocated || null), sub: `across ${liveRows.length} holdings`, color: 'violet' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                  Allocation Weights
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Edit any weight — totals update live. Click Normalize to force 100%.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${Math.abs(totalWeightPct - 100) < 0.2 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  Total: {totalWeightPct.toFixed(1)}%
                </span>
                <button onClick={normalizeWeights}
                  className="text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-emerald-400 hover:text-emerald-700 rounded-lg transition-colors text-slate-600">
                  Normalize
                </button>
                <button onClick={resetToAI}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-violet-400 hover:text-violet-700 rounded-lg transition-colors text-slate-600">
                  <RotateCcw className="w-3 h-3" /> Reset to AI
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-2.5 font-medium text-slate-500">Ticker</th>
                    <th className="text-center px-4 py-2.5 font-medium text-slate-500">Weight %</th>
                    <th className="text-left px-2 py-2.5 font-medium text-slate-500 w-32">Bar</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">CAGR</th>
                    {cash > 0 && <th className="text-right px-4 py-2.5 font-medium text-slate-500">$ Amount</th>}
                    {cash > 0 && <th className="text-right px-5 py-2.5 font-medium text-slate-500">Shares</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {liveRows.map(h => {
                    const rawPct = parseFloat(editedWeights[h.ticker] ?? '0') || 0;
                    const isModified = Math.abs(rawPct - (optimized.find(o => o.ticker === h.ticker)?.weight ?? 0) * 100) > 0.05;
                    return (
                      <tr key={h.ticker} className={`${isModified ? 'bg-violet-50/40' : 'hover:bg-slate-50'}`}>
                        <td className="px-5 py-2.5">
                          <p className="font-mono font-semibold text-slate-900">{h.ticker}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[140px]">{h.name}</p>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min={0} max={100} step={0.5}
                              value={editedWeights[h.ticker] ?? ''}
                              onChange={e => setEditedWeights(prev => ({ ...prev, [h.ticker]: e.target.value }))}
                              className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                            />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="w-28 bg-slate-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${isModified ? 'bg-violet-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(h.weight * 100, 100)}%` }} />
                          </div>
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${h.cagr >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {pct(h.cagr)}
                        </td>
                        {cash > 0 && <td className="px-4 py-2.5 text-right text-slate-700">{fmtUsd(h.dollar_amount)}</td>}
                        {cash > 0 && (
                          <td className="px-5 py-2.5 text-right">
                            <span className="font-semibold text-slate-900">{h.shares_to_buy > 0 ? h.shares_to_buy.toLocaleString() : '—'}</span>
                            {h.price > 0 && <span className="text-xs text-slate-400 ml-1">@ {fmtUsd(h.price)}</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('analyze')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={() => setStep('save')}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Save ── */}
      {step === 'save' && (
        <div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Portfolio Name</label>
              <input type="text" value={portfolioName} onChange={e => setPortfolioName(e.target.value)}
                placeholder="e.g. My Fidelity 401k"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Visibility</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: false, icon: Lock, label: 'Private', sub: 'Only you can see this', color: 'emerald' },
                  { value: true, icon: Globe, label: 'Public', sub: 'Others can discover & import', color: 'violet' },
                ].map(({ value, icon: Icon, label, sub, color }) => (
                  <button key={String(value)} type="button" onClick={() => setIsPublic(value)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${isPublic === value ? `border-${color}-500 bg-${color}-50` : 'border-slate-200 hover:border-slate-300'}`}>
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isPublic === value ? `text-${color}-600` : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-sm font-semibold ${isPublic === value ? `text-${color}-800` : 'text-slate-700'}`}>{label}</p>
                      <p className="text-xs text-slate-400">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-sm text-slate-600 space-y-1">
            <p><strong>{liveRows.length || holdings.length}</strong> holdings · <strong>{(targetReturn * 100).toFixed(0)}%</strong> target · <strong>{lifespanYears}yr</strong> lifespan{liveRows.length > 0 ? ` · ${pct(liveBlended)} blended CAGR` : ''}</p>
            {cash > 0 && liveRows.length > 0 && <p>Total deployment: <strong>{fmtUsd(liveTotalAllocated)}</strong> of <strong>{fmtUsd(cash)}</strong> available</p>}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('optimize')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={handleSave} disabled={saving || !portfolioName.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Portfolio'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
