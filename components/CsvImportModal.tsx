'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Loader2, Check, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  bucketId: number;
  onSuccess: () => void;
}

interface MatchedHolding {
  holding_id: number;
  ticker: string;
  quantity: number;
  cost_basis: number;
  current_value?: number;
}

interface PreviewResult {
  broker: 'schwab' | 'fidelity' | 'merrill' | 'unknown';
  matched: MatchedHolding[];
  unmatched: string[];
  total_rows: number;
}

const BROKER_LABELS: Record<string, string> = {
  schwab: 'Schwab',
  fidelity: 'Fidelity',
  merrill: 'Merrill Lynch',
  unknown: 'Unknown broker',
};

const BROKER_BADGE_COLORS: Record<string, string> = {
  schwab: 'bg-blue-100 text-blue-700',
  fidelity: 'bg-green-100 text-green-700',
  merrill: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-100 text-slate-600',
};

export default function CsvImportModal({ bucketId, onSuccess }: Props) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) {
      setUploadError('Please select a .csv file');
      return;
    }
    setFile(f);
    setUploadError('');
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('preview', 'true');

      const res = await fetch(`/api/buckets/${bucketId}/sync-csv`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? 'Upload failed');
        return;
      }
      setPreview(json);
      setStep('preview');
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setConfirming(true);
    setConfirmError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('preview', 'false');

      const res = await fetch(`/api/buckets/${bucketId}/sync-csv`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setConfirmError(json.error ?? 'Import failed');
        return;
      }
      onSuccess();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-slate-400" />
            <h2 className="text-base font-bold text-slate-800">
              {step === 'upload' ? 'Import CSV' : 'Preview Import'}
            </h2>
          </div>
          <button
            onClick={onSuccess}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1 — Upload */}
        {step === 'upload' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600">
              We support <strong>Schwab</strong>, <strong>Fidelity</strong>, and <strong>Merrill Lynch</strong> positions CSV exports.
            </p>

            {/* Instructions collapsible */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <span>How to export your CSV</span>
                {showInstructions ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {showInstructions && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-700 mb-1">Schwab</p>
                    <ol className="text-xs text-slate-500 space-y-0.5 list-decimal list-inside">
                      <li>Go to <strong>Accounts</strong> → <strong>Positions</strong></li>
                      <li>Click <strong>Export</strong> in the top right</li>
                      <li>Save the CSV file</li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1">Fidelity</p>
                    <ol className="text-xs text-slate-500 space-y-0.5 list-decimal list-inside">
                      <li>Go to <strong>Accounts &amp; Trade</strong> → <strong>Portfolio</strong></li>
                      <li>Click <strong>Download</strong> and choose <strong>CSV</strong></li>
                      <li>Save the CSV file</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl px-6 py-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-emerald-400 bg-emerald-50'
                  : file
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInput}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="w-8 h-8 text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">Drop your CSV here</p>
                  <p className="text-xs text-slate-400">or click to browse</p>
                </div>
              )}
            </div>

            {uploadError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {uploadError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onSuccess}
                className="px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-400 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Preview Import
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Preview */}
        {step === 'preview' && preview && (
          <div className="px-6 py-5 space-y-4">
            {/* Broker badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Detected broker:</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${BROKER_BADGE_COLORS[preview.broker]}`}>
                {BROKER_LABELS[preview.broker]}
              </span>
              <span className="text-xs text-slate-400 ml-auto">{preview.total_rows} rows found</span>
            </div>

            {/* Matched holdings */}
            {preview.matched.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Matched Holdings ({preview.matched.length})
                </p>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left px-4 py-2 font-medium">Ticker</th>
                        <th className="text-right px-4 py-2 font-medium">Qty</th>
                        <th className="text-right px-4 py-2 font-medium">Cost Basis</th>
                        <th className="text-right px-4 py-2 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.matched.map((m) => (
                        <tr key={m.holding_id} className="border-b border-slate-50">
                          <td className="px-4 py-2">
                            <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">
                              {m.ticker}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums text-xs">
                            {m.quantity.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums text-xs">
                            {m.cost_basis > 0
                              ? `$${m.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums text-xs">
                            {m.current_value != null && m.current_value > 0
                              ? `$${m.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                No holdings in this bucket matched tickers in the CSV. Ensure your bucket has the same tickers as your brokerage account.
              </div>
            )}

            {/* Unmatched tickers */}
            {preview.unmatched.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs font-semibold text-amber-700">
                    {preview.unmatched.length} unmatched ticker{preview.unmatched.length !== 1 ? 's' : ''} (in CSV but not in this bucket)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {preview.unmatched.map(t => (
                    <span
                      key={t}
                      className="font-mono text-xs font-bold bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {confirmError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {confirmError}
              </p>
            )}

            <div className="flex justify-between gap-2">
              <button
                onClick={() => { setStep('upload'); setPreview(null); }}
                className="px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-400 rounded-xl transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || preview.matched.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Confirm Import ({preview.matched.length})
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
