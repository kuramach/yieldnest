'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, ChevronDown, ChevronRight, Plus, Trash2, Loader2, AlertTriangle, Info } from 'lucide-react';
import { TAX_TREATMENT_META, type TaxTreatment } from '@/lib/tax-classification';

interface DistributionSummary {
  ordinary: number; qualified: number; roc: number;
  stcg: number; ltcg: number; section1256: number; spillback_amount: number;
}

interface Mtm1256 {
  ticker: string; cost_basis: number; year_end_value: number;
  mtm_gain_loss: number; ltcg_portion: number; stcg_portion: number;
}

interface HoldingSummary {
  ticker: string; name?: string; tax_treatment: string; tax_treatment_label: string;
  quantity: number; cost_basis: number; adjusted_cost_basis: number;
  current_value: number | null; unrealized_gain_loss: number | null;
  distributions: DistributionSummary | null; mtm_1256: Mtm1256 | null;
}

interface TaxSummaryData {
  tax_year: number; portfolio_id: number;
  year_end_snapshot: { id: number; imported_at: string } | null;
  holdings: HoldingSummary[];
  totals: {
    ordinary_income: number; qualified_dividends: number; return_of_capital: number;
    stcg_distributions: number; ltcg_distributions: number; spillback_total: number;
    mtm_1256_ltcg: number; mtm_1256_stcg: number;
  };
  distributions_count: number;
}

interface Distribution {
  id: number; ticker: string; ex_date: string; pay_date?: string;
  tax_year: number; distribution_type: string;
  amount_per_share: number; shares_held?: number; total_amount?: number;
  spillback: boolean; notes?: string;
}

function fmt$(n: number, showSign = false) {
  if (n === 0) return '$0';
  const s = '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign) return (n >= 0 ? '+' : '-') + s;
  return n < 0 ? '-' + s : s;
}

const DIST_TYPE_LABELS: Record<string, string> = {
  ordinary: 'Ordinary Income', qualified: 'Qualified Dividend',
  roc: 'Return of Capital', stcg: 'Short-Term Cap Gain',
  ltcg: 'Long-Term Cap Gain', '1256': 'Sec. 1256',
};

function TreatmentBadge({ treatment }: { treatment: string }) {
  const meta = TAX_TREATMENT_META[treatment as TaxTreatment];
  if (!meta || treatment === 'standard') return null;
  return (
    <span title={meta.tip} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

function AddDistributionForm({ portfolioId, onAdded }: { portfolioId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ticker: '', ex_date: '', pay_date: '', distribution_type: 'ordinary',
    amount_per_share: '', shares_held: '', notes: '',
  });

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/portfolios/${portfolioId}/distributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount_per_share: parseFloat(form.amount_per_share),
          shares_held: form.shares_held ? parseFloat(form.shares_held) : undefined,
          pay_date: form.pay_date || undefined,
        }),
      });
      setForm({ ticker: '', ex_date: '', pay_date: '', distribution_type: 'ordinary', amount_per_share: '', shares_held: '', notes: '' });
      setOpen(false);
      onAdded();
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Add Distribution
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-slate-700">Log Distribution</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Ticker</label>
          <input required value={form.ticker} onChange={e => set('ticker', e.target.value.toUpperCase())}
            className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="VTI" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Type</label>
          <select required value={form.distribution_type} onChange={e => set('distribution_type', e.target.value)}
            className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {Object.entries(DIST_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Ex-Date</label>
          <input required type="date" value={form.ex_date} onChange={e => set('ex_date', e.target.value)}
            className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Pay Date</label>
          <input type="date" value={form.pay_date} onChange={e => set('pay_date', e.target.value)}
            className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">$ / Share</label>
          <input required type="number" step="0.0001" min="0" value={form.amount_per_share} onChange={e => set('amount_per_share', e.target.value)}
            className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0.42" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Shares Held</label>
          <input type="number" step="0.001" min="0" value={form.shares_held} onChange={e => set('shares_held', e.target.value)}
            className="w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="optional" />
        </div>
      </div>
      <input value={form.notes} onChange={e => set('notes', e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Notes (optional)" />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancel</button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save
        </button>
      </div>
    </form>
  );
}

export default function TaxSummaryPanel({ portfolioId }: { portfolioId: number }) {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear);
  const [data, setData] = useState<TaxSummaryData | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHoldings, setExpandedHoldings] = useState<Set<string>>(new Set());
  const [showDist, setShowDist] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [summary, dists] = await Promise.all([
      fetch(`/api/portfolios/${portfolioId}/tax-summary?tax_year=${taxYear}`).then(r => r.json()),
      fetch(`/api/portfolios/${portfolioId}/distributions?tax_year=${taxYear}`).then(r => r.json()),
    ]);
    setData(summary);
    setDistributions(Array.isArray(dists) ? dists : []);
    setLoading(false);
  }, [portfolioId, taxYear]);

  useEffect(() => { load(); }, [load]);

  async function deleteDist(id: number) {
    await fetch(`/api/portfolios/${portfolioId}/distributions?id=${id}`, { method: 'DELETE' });
    load();
  }

  function toggleHolding(ticker: string) {
    setExpandedHoldings(prev => {
      const n = new Set(prev); n.has(ticker) ? n.delete(ticker) : n.add(ticker); return n;
    });
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const has1256 = data?.holdings.some(h => h.tax_treatment === '1256') ?? false;
  const hasRoc = data?.holdings.some(h => h.tax_treatment === 'ric' || (h.distributions?.roc ?? 0) > 0) ?? false;
  const hasSpillback = (data?.totals.spillback_total ?? 0) > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100">
        <FileText className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-800">Tax Summary</h2>
        <select value={taxYear} onChange={e => setTaxYear(parseInt(e.target.value, 10))}
          className="ml-auto text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
        </div>
      ) : !data ? null : (
        <div className="divide-y divide-slate-100">

          {/* Alerts */}
          {(has1256 || hasRoc || hasSpillback) && (
            <div className="px-5 py-3 space-y-2">
              {has1256 && (
                <div className="flex items-start gap-2 text-xs bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-violet-600 mt-0.5 shrink-0" />
                  <span className="text-violet-800"><strong>IRC §1256:</strong> Futures-based ETFs are marked-to-market on Dec 31. Gains/losses are recognized annually with a 60% LTCG / 40% STCG split regardless of holding period.</span>
                </div>
              )}
              {hasRoc && (
                <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
                  <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                  <span className="text-blue-800"><strong>Return of Capital:</strong> ROC distributions (Box 3 on 1099-DIV) reduce your cost basis — they are not taxed as income but increase future capital gains.</span>
                </div>
              )}
              {hasSpillback && (
                <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-amber-800"><strong>§852(b)(6) Spillback:</strong> {fmt$(data.totals.spillback_total)} in dividends declared Oct–Dec are taxed as if received Dec 31 of {taxYear}, even if paid in January.</span>
                </div>
              )}
            </div>
          )}

          {/* Totals grid */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              {taxYear} Income &amp; Gains Summary
              {!data.year_end_snapshot && has1256 && (
                <span className="ml-2 text-amber-500">(no Dec snapshot — using current price for §1256 MTM)</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Ordinary Income', value: data.totals.ordinary_income, note: 'taxed as income' },
                { label: 'Qualified Divs', value: data.totals.qualified_dividends, note: 'max 20% rate' },
                { label: 'Return of Capital', value: data.totals.return_of_capital, note: 'reduces cost basis' },
                { label: 'ST Cap Gains', value: data.totals.stcg_distributions + data.totals.mtm_1256_stcg, note: 'incl. §1256 40%' },
                { label: 'LT Cap Gains', value: data.totals.ltcg_distributions + data.totals.mtm_1256_ltcg, note: 'incl. §1256 60%' },
                { label: '§1256 MTM LTCG', value: data.totals.mtm_1256_ltcg, note: '60% of MTM gain' },
                { label: '§1256 MTM STCG', value: data.totals.mtm_1256_stcg, note: '40% of MTM gain' },
                { label: 'Spillback (§852)', value: data.totals.spillback_total, note: `attr. to ${taxYear}` },
              ].filter(r => r.value !== 0).map(row => (
                <div key={row.label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt$(row.value)}</p>
                  <p className="text-[10px] text-slate-400">{row.note}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Per-holding breakdown */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Per-Holding Breakdown</p>
            <div className="space-y-1">
              {data.holdings.map(h => {
                const open = expandedHoldings.has(h.ticker);
                const hasDist = h.distributions && Object.values(h.distributions).some(v => (v as number) > 0);
                const has1256h = h.tax_treatment === '1256' && h.mtm_1256;
                if (!hasDist && !has1256h && h.tax_treatment === 'standard') return null;

                return (
                  <div key={h.ticker} className="border border-slate-100 rounded-xl overflow-hidden">
                    <button onClick={() => toggleHolding(h.ticker)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors">
                      {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                      <span className="font-mono font-bold text-sm bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">{h.ticker}</span>
                      <TreatmentBadge treatment={h.tax_treatment} />
                      <span className="text-xs text-slate-400 truncate">{h.name}</span>
                      {h.mtm_1256 && (
                        <span className={`ml-auto text-xs font-semibold ${h.mtm_1256.mtm_gain_loss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          MTM {fmt$(h.mtm_1256.mtm_gain_loss, true)}
                        </span>
                      )}
                      {h.unrealized_gain_loss != null && (
                        <span className={`ml-auto text-xs font-semibold ${h.unrealized_gain_loss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          Unrealized {fmt$(h.unrealized_gain_loss, true)}
                        </span>
                      )}
                    </button>

                    {open && (
                      <div className="px-4 pb-3 pt-1 bg-slate-50 text-xs space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div><p className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Cost Basis</p><p className="font-semibold text-slate-700">{fmt$(h.cost_basis)}</p></div>
                          {h.distributions?.roc ? (
                            <div><p className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Adj. Cost Basis</p><p className="font-semibold text-blue-700">{fmt$(h.adjusted_cost_basis)} <span className="text-[10px] text-blue-400">(-{fmt$(h.distributions.roc)} ROC)</span></p></div>
                          ) : null}
                          {h.current_value != null && (
                            <div><p className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Current Value</p><p className="font-semibold text-slate-700">{fmt$(h.current_value)}</p></div>
                          )}
                        </div>

                        {h.mtm_1256 && (
                          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-1">
                            <p className="text-[10px] font-bold uppercase text-violet-600">§1256 Mark-to-Market ({taxYear})</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div><p className="text-[10px] text-slate-400">Year-End Value</p><p className="font-semibold text-slate-700">{fmt$(h.mtm_1256.year_end_value)}</p></div>
                              <div><p className="text-[10px] text-slate-400">MTM Gain/Loss</p><p className={`font-semibold ${h.mtm_1256.mtm_gain_loss >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt$(h.mtm_1256.mtm_gain_loss, true)}</p></div>
                              <div>
                                <p className="text-[10px] text-slate-400">60/40 Split</p>
                                <p className="font-semibold text-slate-700">
                                  {fmt$(h.mtm_1256.ltcg_portion)} LT / {fmt$(h.mtm_1256.stcg_portion)} ST
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {hasDist && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {Object.entries(DIST_TYPE_LABELS).map(([type, label]) => {
                              const val = h.distributions?.[type as keyof DistributionSummary] as number ?? 0;
                              if (!val) return null;
                              return (
                                <div key={type} className="bg-white border border-slate-200 rounded-lg p-2">
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{label}</p>
                                  <p className="font-semibold text-slate-700">{fmt$(val)}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distribution log */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setShowDist(p => !p)} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                {showDist ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Distribution Log ({distributions.length})
              </button>
              <AddDistributionForm portfolioId={portfolioId} onAdded={load} />
            </div>

            {showDist && distributions.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Ticker', 'Type', 'Ex-Date', 'Pay Date', '$/Share', 'Shares', 'Total', 'Spillback', ''].map(h => (
                      <th key={h} className="py-2 pr-3 text-left font-bold uppercase tracking-wider text-slate-400 text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distributions.map(d => (
                    <tr key={d.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-3"><span className="font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded">{d.ticker}</span></td>
                      <td className="py-2 pr-3 text-slate-600">{DIST_TYPE_LABELS[d.distribution_type] ?? d.distribution_type}</td>
                      <td className="py-2 pr-3 text-slate-600 tabular-nums">{d.ex_date}</td>
                      <td className="py-2 pr-3 text-slate-400 tabular-nums">{d.pay_date ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-600 tabular-nums">${d.amount_per_share.toFixed(4)}</td>
                      <td className="py-2 pr-3 text-slate-400 tabular-nums">{d.shares_held ?? '—'}</td>
                      <td className="py-2 pr-3 font-semibold text-slate-700 tabular-nums">{d.total_amount ? fmt$(d.total_amount) : '—'}</td>
                      <td className="py-2 pr-3">
                        {d.spillback && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">§852</span>}
                      </td>
                      <td className="py-2">
                        <button onClick={() => deleteDist(d.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {showDist && distributions.length === 0 && (
              <p className="text-xs text-slate-400 py-2">No distributions logged for {taxYear}. Use "Add Distribution" to record dividends, ROC, and capital gain distributions.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
