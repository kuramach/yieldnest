'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ChevronRight, ChevronLeft, Check, Globe, Lock, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import type { ImportedHolding, OptimizationResult } from '@/lib/types';

type Step = 'upload' | 'preview' | 'optimize' | 'save';

const STEPS: Step[] = ['upload', 'preview', 'optimize', 'save'];
const STEP_LABELS: Record<Step, string> = {
  upload: 'Upload File',
  preview: 'Review Holdings',
  optimize: 'Optimize Weights',
  save: 'Save Portfolio',
};

function fmt(n: number | undefined, digits = 1) {
  if (n == null) return '—';
  return (n * 100).toFixed(digits) + '%';
}

function fmtUsd(n: number | undefined) {
  if (!n) return '—';
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function StepBar({ current }: { current: Step }) {
  const ci = STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
            ${i < ci ? 'bg-emerald-100 text-emerald-700'
              : i === ci ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-400'}`}>
            {i < ci ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
            {STEP_LABELS[s]}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 mx-1 ${i < ci ? 'bg-emerald-300' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [holdings, setHoldings] = useState<ImportedHolding[]>([]);
  const [optimized, setOptimized] = useState<OptimizationResult[]>([]);
  const [weightedReturn, setWeightedReturn] = useState(0);
  const [targetReturn, setTargetReturn] = useState(0.07);
  const [fileName, setFileName] = useState('');

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
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleOptimize() {
    setError('');
    setOptimizing(true);
    try {
      const res = await fetch('/api/portfolios/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings, target_return: targetReturn }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Optimization failed');
      setOptimized(json.optimized);
      setWeightedReturn(json.weighted_return);
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
      // 1. Create portfolio
      const pRes = await fetch('/api/portfolios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: portfolioName.trim(), description: description.trim() || null, is_public: isPublic }),
      });
      const portfolio = await pRes.json();
      if (!pRes.ok) throw new Error(portfolio.error || 'Failed to create portfolio');

      // 2. Create a single bucket with the imported holdings
      const bRes = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolio.id,
          name: 'Imported Holdings',
          target_return: targetReturn,
          lifespan_years: 10,
          initial_amount: holdings.reduce((s, h) => s + (h.value ?? 0), 0),
        }),
      });
      const bucket = await bRes.json();
      if (!bRes.ok) throw new Error(bucket.error || 'Failed to create bucket');

      // 3. Insert holdings with optimized weights
      const source = optimized.length > 0 ? optimized : holdings.map(h => ({
        ticker: h.ticker,
        name: h.name || h.ticker,
        weight: 1 / holdings.length,
        year_return: h.year_return ?? 0,
        asset_type: h.asset_type ?? 'stock' as const,
        price: h.price ?? 0,
      }));

      for (const h of source) {
        const holding = holdings.find(ih => ih.ticker === h.ticker);
        await fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket_id: bucket.id,
            ticker: h.ticker,
            name: h.name,
            asset_type: h.asset_type,
            weight: h.weight,
            quantity: holding?.shares ?? 0,
            purchase_price: holding?.price ?? 0,
          }),
        });
      }

      router.push(`/dashboard/portfolio/${portfolio.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Portfolio</h1>
        <p className="text-sm text-slate-400 mt-0.5">Upload a brokerage export and we'll price it and suggest weights</p>
      </div>

      <StepBar current={step} />

      {error && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4 mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="text-slate-600 font-medium">Parsing {fileName} and fetching prices…</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-700 font-semibold mb-1">Drop your brokerage export here</p>
              <p className="text-sm text-slate-400 mb-4">Supports Excel (.xlsx, .xls) or CSV</p>
              <p className="text-xs text-slate-400">
                Make sure your file has columns named: <strong>Symbol/Ticker</strong>, <strong>Shares/Quantity</strong>, and optionally <strong>Market Value</strong>
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 2: Preview holdings */}
      {step === 'preview' && (
        <div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Found {holdings.length} holdings</h2>
              <span className="text-xs text-slate-400">{fileName}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-2.5 font-medium text-slate-500">Ticker</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Name</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Shares</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Price</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Value</th>
                    <th className="text-right px-5 py-2.5 font-medium text-slate-500">1Y Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {holdings.map(h => (
                    <tr key={h.ticker} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-mono font-semibold text-slate-900">{h.ticker}</td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{h.name || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{h.shares > 0 ? h.shares.toLocaleString() : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{h.price ? fmtUsd(h.price) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{fmtUsd(h.value)}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${h.year_return == null ? 'text-slate-300' : h.year_return >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {fmt(h.year_return)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Target return slider */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Target Annual Return: <span className="text-emerald-600">{fmt(targetReturn, 0)}</span>
            </label>
            <input
              type="range"
              min={2} max={20} step={0.5}
              value={targetReturn * 100}
              onChange={e => setTargetReturn(parseFloat(e.target.value) / 100)}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>2% (Conservative)</span>
              <span>10% (Balanced)</span>
              <span>20% (Aggressive)</span>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              We'll adjust the weight of each security to hit this blended return.
            </p>
          </div>

          <div className="flex gap-3 justify-between">
            <button onClick={() => setStep('upload')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {optimizing ? 'Optimizing…' : 'Optimize Weights'}
              {!optimizing && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Optimized weights */}
      {step === 'optimize' && (
        <div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-800">Blended return at these weights</p>
              <p className="text-xs text-emerald-600 mt-0.5">Target was {fmt(targetReturn, 0)}</p>
            </div>
            <span className="text-3xl font-bold text-emerald-700">{fmt(weightedReturn, 1)}</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Suggested weights</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-2.5 font-medium text-slate-500">Ticker</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Name</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">1Y Return</th>
                  <th className="text-right px-5 py-2.5 font-medium text-slate-500">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {optimized.map(h => (
                  <tr key={h.ticker} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-mono font-semibold text-slate-900">{h.ticker}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{h.name}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${h.year_return >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {fmt(h.year_return)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${h.weight * 100}%` }} />
                        </div>
                        <span className="font-bold text-slate-900 w-12 text-right">{fmt(h.weight, 1)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-between">
            <button onClick={() => setStep('preview')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep('save')}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Name + save */}
      {step === 'save' && (
        <div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Portfolio Name</label>
              <input
                type="text"
                value={portfolioName}
                onChange={e => setPortfolioName(e.target.value)}
                placeholder="e.g. My Fidelity 401k"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of this portfolio…"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
              />
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Visibility</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${!isPublic ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <Lock className={`w-5 h-5 flex-shrink-0 ${!isPublic ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div>
                    <p className={`text-sm font-semibold ${!isPublic ? 'text-emerald-800' : 'text-slate-700'}`}>Private</p>
                    <p className="text-xs text-slate-400">Only you can see this</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left ${isPublic ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <Globe className={`w-5 h-5 flex-shrink-0 ${isPublic ? 'text-violet-600' : 'text-slate-400'}`} />
                  <div>
                    <p className={`text-sm font-semibold ${isPublic ? 'text-violet-800' : 'text-slate-700'}`}>Public</p>
                    <p className="text-xs text-slate-400">Others can discover &amp; import</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 text-sm text-slate-600 space-y-1">
            <p><strong>{holdings.length}</strong> holdings · <strong>{fmt(targetReturn, 0)}</strong> target return · <strong>{fmt(weightedReturn, 1)}</strong> blended return</p>
            <p>Total value: <strong>{fmtUsd(holdings.reduce((s, h) => s + (h.value ?? 0), 0))}</strong></p>
          </div>

          <div className="flex gap-3 justify-between">
            <button onClick={() => setStep('optimize')} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !portfolioName.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Portfolio'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
