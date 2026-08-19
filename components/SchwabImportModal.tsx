'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Loader2, Check, AlertTriangle, FileText, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { PortfolioHolding } from '@/lib/types';

interface MatchedRow {
  ticker: string;
  name: string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  weight: number;
  holding_id: number;
  is_new: boolean;
}

interface NewRow {
  ticker: string;
  name: string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  weight: number;
}

interface PreviewResult {
  broker: 'schwab' | 'fidelity' | 'merrill' | 'unknown';
  total_rows: number;
  total_market_value: number;
  matched: MatchedRow[];
  new_tickers: NewRow[];
}

interface Props {
  portfolioId: number;
  onSuccess: (holdings: PortfolioHolding[]) => void;
  onClose: () => void;
}

const BROKER_BADGE: Record<string, string> = {
  schwab:  'bg-blue-100 text-blue-700',
  fidelity:'bg-green-100 text-green-700',
  unknown: 'bg-slate-100 text-slate-600',
};

const BROKER_LABEL: Record<string, string> = {
  schwab: 'Charles Schwab', fidelity: 'Fidelity', unknown: 'Unknown broker',
};

function fmt(n: number) {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function SchwabImportModal({ portfolioId, onSuccess, onClose }: Props) {
  const [step, setStep]             = useState<'upload' | 'preview'>('upload');
  const [file, setFile]             = useState<File | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview]       = useState<PreviewResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) { setUploadError('Please select a .csv file'); return; }
    setFile(f); setUploadError('');
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true); setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('preview', 'true');
      const res = await fetch(`/api/portfolios/${portfolioId}/sync-csv`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error ?? 'Upload failed'); return; }
      setPreview(json);
      setStep('preview');
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setConfirming(true); setConfirmError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('preview', 'false');
      const res = await fetch(`/api/portfolios/${portfolioId}/sync-csv`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { setConfirmError(json.error ?? 'Import failed'); return; }
      onSuccess(json.holdings ?? []);
    } finally {
      setConfirming(false);
    }
  }

  const totalImport = (preview?.matched.length ?? 0) + (preview?.new_tickers.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-xl shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-bold text-slate-800">
              {step === 'upload' ? 'Import from Schwab / Fidelity' : 'Preview Import'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1 — Upload */}
        {step === 'upload' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600">
              Export your <strong>Positions CSV</strong> from Schwab or Fidelity and upload it here.
              We'll sync quantity, cost basis, and market value for all matching tickers — and add any new ones automatically.
            </p>

            {/* Instructions */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
              >
                How to export your positions CSV
                {showInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showInstructions && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-xs font-bold text-blue-700 mb-1.5">Charles Schwab</p>
                    <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                      <li>Log in → click <strong>Accounts</strong> → <strong>Positions</strong></li>
                      <li>Click <strong>Export</strong> (top right of the positions table)</li>
                      <li>Save the <code>.csv</code> file and upload it here</li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-green-700 mb-1.5">Fidelity</p>
                    <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                      <li>Log in → <strong>Accounts &amp; Trade</strong> → <strong>Portfolio</strong></li>
                      <li>Click <strong>Download</strong> → choose <strong>Positions</strong> as CSV</li>
                      <li>Save and upload here</li>
                    </ol>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    We capture: Symbol, Quantity, Cost Basis, Market Value, and Gain/Loss.
                    Weights are not changed by the import.
                  </p>
                </div>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB · click to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">Drop your Schwab/Fidelity CSV here</p>
                  <p className="text-xs text-slate-400">or click to browse</p>
                </div>
              )}
            </div>

            {uploadError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{uploadError}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-400 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</> : <><Upload className="w-3.5 h-3.5" />Preview Import</>}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Preview */}
        {step === 'preview' && preview && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Detected:</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${BROKER_BADGE[preview.broker]}`}>{BROKER_LABEL[preview.broker]}</span>
              <span className="text-xs text-slate-400">{preview.total_rows} positions</span>
              {preview.total_market_value > 0 && (
                <span className="ml-auto text-xs font-semibold text-slate-700">Total: {fmt(preview.total_market_value)}</span>
              )}
            </div>

            {/* Matched existing */}
            {preview.matched.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Update existing holdings ({preview.matched.length})
                </p>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400">
                        <th className="text-left px-4 py-2 font-medium">Ticker</th>
                        <th className="text-right px-4 py-2 font-medium">Qty</th>
                        <th className="text-right px-4 py-2 font-medium">Cost Basis</th>
                        <th className="text-right px-4 py-2 font-medium">Mkt Value</th>
                        <th className="text-right px-4 py-2 font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.matched.map(m => (
                        <tr key={m.ticker} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-2"><span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">{m.ticker}</span></td>
                          <td className="px-4 py-2 text-right tabular-nums">{m.quantity.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{m.cost_basis > 0 ? fmt(m.cost_basis) : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700 font-semibold">{m.market_value > 0 ? fmt(m.market_value) : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-700">{(m.weight * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New tickers */}
            {preview.new_tickers.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Plus className="w-3 h-3 text-emerald-500" />
                  New tickers to add ({preview.new_tickers.length})
                </p>
                <div className="border border-emerald-100 bg-emerald-50/30 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-50 border-b border-emerald-100 text-emerald-600">
                        <th className="text-left px-4 py-2 font-medium">Ticker</th>
                        <th className="text-left px-4 py-2 font-medium">Name</th>
                        <th className="text-right px-4 py-2 font-medium">Qty</th>
                        <th className="text-right px-4 py-2 font-medium">Cost Basis</th>
                        <th className="text-right px-4 py-2 font-medium">Mkt Value</th>
                        <th className="text-right px-4 py-2 font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.new_tickers.map(r => (
                        <tr key={r.ticker} className="border-b border-emerald-50 last:border-0">
                          <td className="px-4 py-2"><span className="font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{r.ticker}</span></td>
                          <td className="px-4 py-2 text-slate-600 truncate max-w-[120px]">{r.name || '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.quantity.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.cost_basis > 0 ? fmt(r.cost_basis) : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700 font-semibold">{r.market_value > 0 ? fmt(r.market_value) : '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-700">{(r.weight * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">These tickers will be added to the portfolio with weight 0. Set weights after import.</p>
              </div>
            )}

            {totalImport === 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">No positions found in this CSV. Check that you exported from Positions (not Transactions or History).</p>
              </div>
            )}

            {confirmError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{confirmError}</p>}

            <div className="flex justify-between gap-2">
              <button onClick={() => { setStep('upload'); setPreview(null); }} className="px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-400 rounded-xl transition-colors">
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || totalImport === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {confirming
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Importing…</>
                  : <><Check className="w-3.5 h-3.5" />Confirm Import ({totalImport})</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
