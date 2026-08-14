'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Pencil, Check, X, History } from 'lucide-react';

interface SnapshotHolding {
  ticker: string;
  name?: string;
  quantity: number;
  price: number;
  cost_basis: number;
  market_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  asset_type: string;
  weight: number;
}

interface Snapshot {
  id: number;
  imported_at: string;
  source: string;
  label: string | null;
  total_market_value: number;
  holdings: SnapshotHolding[];
}

function fmt$(n: number) {
  return '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LabelEditor({ portfolioId, snapshot, onSaved }: { portfolioId: number; snapshot: Snapshot; onSaved: (label: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(snapshot.label ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/import-snapshots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot_id: snapshot.id, label: input }),
      });
      if (res.ok) { onSaved(input.trim() || null); setEditing(false); }
    } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="group flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
        {snapshot.label
          ? <span className="font-medium text-slate-600">{snapshot.label}</span>
          : <span className="italic">Add label</span>}
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="e.g. 2024 Year-End"
        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36"
      />
      <button onClick={save} disabled={saving} className="text-emerald-600 hover:text-emerald-500 disabled:opacity-40"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function ImportHistoryPanel({ portfolioId }: { portfolioId: number }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`/api/portfolios/${portfolioId}/import-snapshots`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSnapshots(data); })
      .finally(() => setLoading(false));
  }, [portfolioId]);

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function updateLabel(id: number, label: string | null) {
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, label } : s));
  }

  if (loading) return null;
  if (!snapshots.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
        <History className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-800">Import History</h2>
        <span className="text-xs text-slate-400">{snapshots.length} {snapshots.length === 1 ? 'import' : 'imports'}</span>
      </div>

      <div className="divide-y divide-slate-100">
        {snapshots.map(snap => {
          const open = expanded.has(snap.id);
          const totalCost = snap.holdings.reduce((s, h) => s + (h.cost_basis ?? 0), 0);
          const totalGainLoss = snap.total_market_value - totalCost;

          return (
            <div key={snap.id}>
              <button
                onClick={() => toggle(snap.id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">{fmtDate(snap.imported_at)}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      snap.source === 'schwab' ? 'bg-blue-100 text-blue-700' :
                      snap.source === 'fidelity' ? 'bg-green-100 text-green-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>{snap.source}</span>
                    <LabelEditor portfolioId={portfolioId} snapshot={snap} onSaved={label => updateLabel(snap.id, label)} />
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Positions</p>
                    <p className="text-sm font-semibold text-slate-700">{snap.holdings.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Market Value</p>
                    <p className="text-sm font-semibold text-slate-700">{fmt$(snap.total_market_value)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Gain / Loss</p>
                    <p className={`text-sm font-semibold ${totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {totalGainLoss >= 0 ? '+' : '-'}{fmt$(totalGainLoss)}
                    </p>
                  </div>
                </div>
              </button>

              {open && (
                <div className="px-5 pb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2 text-left font-bold uppercase tracking-wider text-slate-400">Ticker</th>
                        <th className="py-2 text-left font-bold uppercase tracking-wider text-slate-400">Name</th>
                        <th className="py-2 text-right font-bold uppercase tracking-wider text-slate-400">Qty</th>
                        <th className="py-2 text-right font-bold uppercase tracking-wider text-slate-400">Price</th>
                        <th className="py-2 text-right font-bold uppercase tracking-wider text-slate-400">Cost Basis</th>
                        <th className="py-2 text-right font-bold uppercase tracking-wider text-slate-400">Mkt Value</th>
                        <th className="py-2 text-right font-bold uppercase tracking-wider text-slate-400">Gain / Loss</th>
                        <th className="py-2 text-right font-bold uppercase tracking-wider text-slate-400">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.holdings.map(h => (
                        <tr key={h.ticker} className="border-b border-slate-50 last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-mono font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">{h.ticker}</span>
                          </td>
                          <td className="py-2 pr-3 text-slate-500 max-w-[160px] truncate">{h.name || '—'}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                            {h.quantity > 0 ? h.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                            {h.price > 0 ? `$${h.price.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                            {h.cost_basis > 0 ? fmt$(h.cost_basis) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums font-medium text-slate-700">
                            {h.market_value > 0 ? fmt$(h.market_value) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {h.cost_basis > 0 ? (
                              <span className={h.gain_loss >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {h.gain_loss >= 0 ? '+' : '-'}{fmt$(h.gain_loss)}
                                <span className="ml-1 opacity-70">({h.gain_loss >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%)</span>
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-2 text-right tabular-nums text-slate-500">
                            {(h.weight * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 font-semibold">
                        <td colSpan={4} className="py-2 text-slate-500">Total</td>
                        <td className="py-2 text-right tabular-nums text-slate-700">{totalCost > 0 ? fmt$(totalCost) : '—'}</td>
                        <td className="py-2 text-right tabular-nums text-slate-700">{fmt$(snap.total_market_value)}</td>
                        <td className="py-2 text-right tabular-nums">
                          <span className={totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {totalGainLoss >= 0 ? '+' : '-'}{fmt$(totalGainLoss)}
                          </span>
                        </td>
                        <td className="py-2 text-right text-slate-500">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
