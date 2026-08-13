'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, ChevronRight, ChevronLeft, Check, Globe, Lock,
  TrendingUp, TrendingDown, AlertCircle, Loader2, DollarSign,
  BarChart3, Minus, RotateCcw, SlidersHorizontal, Brain, Equal,
} from 'lucide-react';
import type { HoldingHistoricalStats, PortfolioAnalysis, OptimizationResult, BucketGroup, AccountType } from '@/lib/types';

interface ParsedCsvHolding {
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  market_value: number;
  cost_basis: number;
  gain_loss: number;
  gain_loss_pct: number;
  asset_type: 'stock' | 'etf' | 'bond';
  weight: number;
}

type Step = 'upload' | 'preview' | 'analyze' | 'optimize' | 'save';
const STEPS: Step[] = ['upload', 'preview', 'analyze', 'optimize', 'save'];
const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload',
  preview: 'Holdings',
  analyze: 'AI Analysis',
  optimize: 'Optimize',
  save: 'Save',
};

function pct(n: number | undefined, digits = 1) {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(digits) + '%';
}
function fmtUsd(n: number | undefined | null) {
  if (!n) return '—';
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtUsdExact(n: number) {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const BUCKET_LABELS: Record<BucketGroup, string> = { 1: 'Bucket 1 · Safety', 2: 'Bucket 2 · Income', 3: 'Bucket 3 · Growth' };
const BUCKET_COLORS: Record<BucketGroup, string> = {
  1: 'border-blue-500 bg-blue-50 text-blue-800',
  2: 'border-amber-500 bg-amber-50 text-amber-800',
  3: 'border-emerald-500 bg-emerald-50 text-emerald-800',
};
const ACCOUNT_LABELS: Record<AccountType, string> = { taxable: 'Taxable', pretax: 'Pre-Tax (401k/IRA)', roth: 'Roth' };

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
  const [broker, setBroker] = useState('');
  const [totalMarketValue, setTotalMarketValue] = useState(0);
  const [holdings, setHoldings] = useState<ParsedCsvHolding[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [optimized, setOptimized] = useState<OptimizationResult[]>([]);

  // weight editing: ticker → pct string (shown in table inputs)
  const [previewWeights, setPreviewWeights] = useState<Record<string, string>>({});
  const [editedWeights, setEditedWeights] = useState<Record<string, string>>({});

  const [targetReturn, setTargetReturn] = useState(0.07);
  const [availableCash, setAvailableCash] = useState('');
  const [lifespanYears, setLifespanYears] = useState(10);
  const [suggestingWeights, setSuggestingWeights] = useState(false);
  const [weightRationale, setWeightRationale] = useState('');

  // Save form
  const [portfolioName, setPortfolioName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [bucketGroup, setBucketGroup] = useState<BucketGroup | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('taxable');

  async function handleFileUpload(file: File) {
    setError('');
    setUploading(true);
    setFileName(file.name);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/portfolios/parse-csv', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setHoldings(json.holdings);
      setBroker(json.broker);
      setTotalMarketValue(json.total_market_value);
      setPortfolioName(file.name.replace(/\.[^.]+$/, ''));
      // Initialize weights from market values (not equal)
      const wts: Record<string, string> = {};
      for (const h of json.holdings) wts[h.ticker] = (h.weight * 100).toFixed(1);
      setPreviewWeights(wts);
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
          holdings: holdings.map(h => ({ ticker: h.ticker, name: h.name, asset_type: h.asset_type })),
          target_return: targetReturn,
          available_cash: cash,
          lifespan_years: lifespanYears,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Suggestion failed');
      const next: Record<string, string> = {};
      for (const h of holdings) next[h.ticker] = ((json.weights[h.ticker] ?? 0) * 100).toFixed(1);
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
        body: JSON.stringify({
          holdings: holdings.map(h => ({ ticker: h.ticker, name: h.name, asset_type: h.asset_type })),
          target_return: targetReturn,
          available_cash: cash,
        }),
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
          holdings: holdings.map(h => ({ ticker: h.ticker, name: h.name, asset_type: h.asset_type })),
          historical_stats: analysis?.stats ?? [],
          target_return: targetReturn,
          available_cash: cash,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Optimization failed');
      setOptimized(json.optimized);
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
      // Create portfolio
      const pRes = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: portfolioName.trim(),
          description: description.trim() || null,
          is_public: isPublic,
          bucket_group: bucketGroup,
          account_type: accountType,
        }),
      });
      const portfolio = await pRes.json();
      if (!pRes.ok) throw new Error(portfolio.error);

      // Determine final weights to use (AI-optimized if available, else preview weights)
      const useOptimized = liveRows.length > 0;
      const totalPreviewPct = Object.values(previewWeights).reduce((s, v) => s + (parseFloat(v) || 0), 0);

      // Save each holding to portfolio_holdings
      await Promise.all(holdings.map(h => {
        let weight: number;
        if (useOptimized) {
          const optRow = liveRows.find(r => r.ticker === h.ticker);
          weight = optRow?.weight ?? 0;
        } else {
          const rawPct = parseFloat(previewWeights[h.ticker] ?? '0') || 0;
          weight = totalPreviewPct > 0 ? rawPct / totalPreviewPct : 1 / holdings.length;
        }
        return fetch('/api/portfolio-holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portfolio_id: portfolio.id,
            ticker: h.ticker,
            name: h.name || null,
            asset_type: h.asset_type,
            weight,
            quantity: h.quantity,
            purchase_price: h.quantity > 0 ? h.cost_basis / h.quantity : h.price,
            cost_basis: h.cost_basis,
            price: h.price,
          }),
        });
      }));

      router.push(`/dashboard/portfolio/${portfolio.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const cash = parseFloat(availableCash.replace(/,/g, '')) || 0;

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
    const n: Record<string, string> = {};
    for (const [t, v] of Object.entries(editedWeights)) n[t] = ((parseFloat(v) || 0) / total * 100).toFixed(1);
    setEditedWeights(n);
  }

  function resetToAI() {
    const r: Record<string, string> = {};
    for (const h of optimized) r[h.ticker] = (h.weight * 100).toFixed(1);
    setEditedWeights(r);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Portfolio</h1>
        <p className="text-sm text-slate-400 mt-0.5">Upload a Schwab or Fidelity CSV export — weights are computed from your actual market values</p>
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
        <div>
          <div
            className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                <p className="text-slate-600 font-medium">Parsing {fileName}…</p>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-700 font-semibold mb-1">Drop your Schwab or Fidelity CSV here</p>
                <p className="text-sm text-slate-400 mb-4">CSV export — Symbol, Quantity, Price, Market Value, Cost Basis</p>
                <p className="text-xs text-slate-400">Weights are automatically calculated from your market values</p>
              </>
            )}
          </div>
          <div className="mt-4 p-4 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">How to export from Schwab:</p>
            <p>Accounts → select account → Positions → Export (top right) → CSV</p>
            <p className="font-semibold text-slate-700 mt-2">How to export from Fidelity:</p>
            <p>Accounts & Trade → Portfolio → Positions → Download → CSV</p>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview holdings ── */}
      {step === 'preview' && (
        <div>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-1">Broker Detected</p>
              <p className="text-lg font-bold text-slate-800 capitalize">{broker || 'Unknown'}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-1">Holdings</p>
              <p className="text-lg font-bold text-slate-800">{holdings.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-1">Total Market Value</p>
              <p className="text-lg font-bold text-slate-800">{fmtUsd(totalMarketValue)}</p>
            </div>
          </div>

          {/* Weight controls */}
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
                    <Equal className="w-3 h-3" /> Equal
                  </button>
                  <button
                    onClick={() => {
                      const wts: Record<string, string> = {};
                      for (const h of holdings) wts[h.ticker] = (h.weight * 100).toFixed(1);
                      setPreviewWeights(wts);
                      setWeightRationale('');
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-slate-400 rounded-lg transition-colors text-slate-600"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset to Market
                  </button>
                  <button
                    onClick={handleSuggestWeights}
                    disabled={suggestingWeights}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {suggestingWeights ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                    {suggestingWeights ? 'Thinking…' : 'AI Suggest'}
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
              <h2 className="font-semibold text-slate-800">{holdings.length} positions from {fileName}</h2>
              <span className="text-xs text-slate-400 capitalize">{broker} format</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-2.5 font-medium text-slate-500">Ticker</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Qty</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Price</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Market Value</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Cost Basis</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Gain/Loss</th>
                    <th className="text-center px-5 py-2.5 font-medium text-slate-500">Weight %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {holdings.map(h => (
                    <tr key={h.ticker} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-mono font-semibold text-slate-900">{h.ticker}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[160px]">{h.name}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{h.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{h.price ? fmtUsdExact(h.price) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{h.market_value ? fmtUsd(h.market_value) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{h.cost_basis ? fmtUsd(h.cost_basis) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${h.gain_loss >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {h.gain_loss ? fmtUsd(h.gain_loss) : '—'}
                        {h.gain_loss_pct ? <span className="text-xs font-normal ml-1 opacity-70">({h.gain_loss_pct >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%)</span> : null}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0} max={100} step={0.1}
                            value={previewWeights[h.ticker] ?? ''}
                            onChange={e => setPreviewWeights(prev => ({ ...prev, [h.ticker]: e.target.value }))}
                            className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                          />
                          <span className="text-slate-400 text-xs">%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Optional: target return for AI steps */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Target Annual Return <span className="text-slate-400 font-normal">(for AI analysis)</span>: <span className="text-emerald-600">{(targetReturn * 100).toFixed(0)}%</span>
            </label>
            <input type="range" min={2} max={20} step={0.5} value={targetReturn * 100}
              onChange={e => setTargetReturn(parseFloat(e.target.value) / 100)}
              className="w-full accent-emerald-500" />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>2% Conservative</span><span>10% Balanced</span><span>20% Aggressive</span>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('upload')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex gap-3">
              <button onClick={() => setStep('save')}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 hover:border-emerald-400 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                Skip to Save
              </button>
              <button onClick={handleAnalyze} disabled={analyzing}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                {analyzing ? 'Fetching history…' : 'Analyze with AI'}
                {!analyzing && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: AI Analysis ── */}
      {step === 'analyze' && analysis && (
        <div>
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
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Historical Performance by Holding</h2>
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
                  {analysis.stats.map(s => (
                    <tr key={s.ticker} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900">{s.ticker}</td>
                      <td className={`px-4 py-3 text-right font-bold ${s.cagr >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct(s.cagr)}</td>
                      <td className="px-4 py-3 text-right"><span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{pct(s.best_year)}</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{pct(s.median_year)}</span></td>
                      <td className="px-4 py-3 text-right"><span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">{pct(s.worst_year)}</span></td>
                      <td className="px-4 py-3 text-right text-slate-500">{pct(s.volatility)}</td>
                      <td className="px-5 py-3 text-right text-slate-400">{s.years_of_data}y</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-violet-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">AI</div>
              <h2 className="font-semibold text-white">Portfolio Analysis</h2>
            </div>
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{analysis.ai_narrative}</div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('preview')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex gap-3">
              <button onClick={() => setStep('save')}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 hover:border-emerald-400 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                Skip to Save
              </button>
              <button onClick={handleOptimize} disabled={optimizing}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                {optimizing ? 'Optimizing…' : 'Optimize Weights'}
                {!optimizing && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Optimized weights ── */}
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
                  <SlidersHorizontal className="w-4 h-4 text-slate-400" /> Allocation Weights
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">AI-suggested — edit and normalize as needed</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${Math.abs(totalWeightPct - 100) < 0.2 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  Total: {totalWeightPct.toFixed(1)}%
                </span>
                <button onClick={normalizeWeights} className="text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-emerald-400 hover:text-emerald-700 rounded-lg transition-colors text-slate-600">
                  Normalize
                </button>
                <button onClick={resetToAI} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-slate-200 hover:border-violet-400 hover:text-violet-700 rounded-lg transition-colors text-slate-600">
                  <RotateCcw className="w-3 h-3" /> Reset to AI
                </button>
              </div>
            </div>

            {/* Cash input for allocation math */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
              <label className="text-xs font-semibold text-slate-600">Available Cash (optional):</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="text" value={availableCash}
                  onChange={e => setAvailableCash(e.target.value)}
                  placeholder="50,000"
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-32" />
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
                            <input type="number" min={0} max={100} step={0.5}
                              value={editedWeights[h.ticker] ?? ''}
                              onChange={e => setEditedWeights(prev => ({ ...prev, [h.ticker]: e.target.value }))}
                              className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
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
                placeholder="e.g. My Schwab 401k"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
            </div>

            {/* Bucket label */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Bucket Label <span className="text-slate-400 font-normal">(optional — links to 360Retirement strategy)</span></label>
              <div className="grid grid-cols-4 gap-2">
                <button onClick={() => setBucketGroup(null)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors ${bucketGroup === null ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                  None
                </button>
                {([1, 2, 3] as BucketGroup[]).map(bg => (
                  <button key={bg} onClick={() => setBucketGroup(bg)}
                    className={`py-2.5 px-3 rounded-xl border-2 text-xs font-semibold transition-colors ${bucketGroup === bg ? BUCKET_COLORS[bg] + ' border-current' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    {BUCKET_LABELS[bg]}
                  </button>
                ))}
              </div>
            </div>

            {/* Account type */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Account Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['taxable', 'pretax', 'roth'] as AccountType[]).map(at => (
                  <button key={at} onClick={() => setAccountType(at)}
                    className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors ${accountType === at ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    {ACCOUNT_LABELS[at]}
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility */}
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

          {/* Summary */}
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-sm text-slate-600 space-y-1">
            <p>
              <strong>{holdings.length}</strong> holdings ·{' '}
              <strong>{fmtUsd(totalMarketValue)}</strong> market value ·{' '}
              <strong>{fmtUsd(holdings.reduce((s, h) => s + (h.cost_basis || 0), 0))}</strong> cost basis
            </p>
            {liveRows.length > 0 && <p>AI-optimized weights · <strong>{pct(liveBlended)}</strong> blended CAGR</p>}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(liveRows.length > 0 ? 'optimize' : 'preview')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
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
