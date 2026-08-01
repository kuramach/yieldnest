'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  MessageSquare,
  Send,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import type {
  BucketProposal,
  ProposalComment,
  ProposalPayload,
  ProposalPayloadWeightChange,
  ProposalPayloadAddition,
  ProposalPayloadRemoval,
} from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────────────────

interface HoldingInfo {
  id: number;
  ticker: string;
  name?: string;
  weight: number;
  asset_type: 'stock' | 'etf' | 'bond';
}

interface Props {
  bucketId: number;
  isOwner: boolean;
  holdings: HoldingInfo[];
  bucketTargetReturn: number;
  bucketLifespanYears: number;
}

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BucketProposal['status'], string> = {
  open:      'bg-amber-100 text-amber-700',
  accepted:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-600',
  withdrawn: 'bg-slate-100 text-slate-500',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortId(uid: string) {
  return uid.slice(0, 8) + '…';
}

// ── Proposal diff view ───────────────────────────────────────────────────────

interface ProposalDiffProps {
  proposal: BucketProposal;
  holdings: HoldingInfo[];
  isOwner: boolean;
  onResolved: () => void;
}

function ProposalDiff({ proposal, holdings, isOwner, onResolved }: ProposalDiffProps) {
  const [comments, setComments] = useState<ProposalComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');

  const payload = proposal.payload as ProposalPayload;

  const holdingById = Object.fromEntries(holdings.map(h => [h.id, h]));

  useEffect(() => {
    setCommentsLoading(true);
    fetch(`/api/proposals/${proposal.id}/comments`)
      .then(r => r.json())
      .then(j => setComments(j.comments ?? []))
      .catch(() => {})
      .finally(() => setCommentsLoading(false));
  }, [proposal.id]);

  async function sendComment() {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      const j = await res.json();
      if (res.ok) {
        setComments(prev => [...prev, j.comment]);
        setNewComment('');
      }
    } finally {
      setSendingComment(false);
    }
  }

  async function handleAction(action: 'accept' | 'reject', comment?: string) {
    setActing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment }),
      });
      const j = await res.json();
      if (!res.ok) { setActionError(j.error ?? 'Action failed'); return; }
      onResolved();
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4 space-y-4">
      {/* Summary */}
      {proposal.summary && (
        <p className="text-sm text-slate-600">{proposal.summary}</p>
      )}

      {/* Weight changes */}
      {(payload.weight_changes?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Weight changes</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-100">
                <th className="text-left py-1.5 font-medium">Ticker</th>
                <th className="text-right py-1.5 font-medium">Current</th>
                <th className="py-1.5 text-center w-6" />
                <th className="text-right py-1.5 font-medium">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {(payload.weight_changes as ProposalPayloadWeightChange[]).map((wc) => {
                const h = holdingById[wc.holding_id];
                const delta = wc.new_weight - wc.old_weight;
                return (
                  <tr key={wc.holding_id} className="border-b border-slate-50">
                    <td className="py-2">
                      <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">
                        {wc.ticker ?? h?.ticker ?? '?'}
                      </span>
                    </td>
                    <td className="text-right py-2 text-slate-500 tabular-nums">
                      {(wc.old_weight * 100).toFixed(1)}%
                    </td>
                    <td className="text-center py-2">
                      <ArrowRight
                        className={`w-3.5 h-3.5 mx-auto ${delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-400' : 'text-slate-300'}`}
                      />
                    </td>
                    <td className="text-right py-2 font-semibold tabular-nums">
                      <span className={delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-slate-700'}>
                        {(wc.new_weight * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Additions */}
      {(payload.additions?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Additions</p>
          <div className="space-y-1.5">
            {(payload.additions as ProposalPayloadAddition[]).map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-sm"
              >
                <span className="flex items-center gap-1 text-xs font-bold bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded">
                  +
                </span>
                <span className="font-mono font-bold text-xs bg-white border border-emerald-200 px-2 py-0.5 rounded">
                  {a.ticker}
                </span>
                <span className="text-slate-600 text-xs flex-1">{a.name}</span>
                <span className="text-xs text-emerald-700 font-semibold">{(a.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Removals */}
      {(payload.removals?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Removals</p>
          <div className="space-y-1.5">
            {(payload.removals as ProposalPayloadRemoval[]).map((r, i) => {
              const h = holdingById[r.holding_id];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-sm"
                >
                  <span className="flex items-center gap-1 text-xs font-bold bg-red-200 text-red-800 px-1.5 py-0.5 rounded">
                    −
                  </span>
                  <span className="font-mono font-bold text-xs bg-white border border-red-200 px-2 py-0.5 rounded">
                    {r.ticker ?? h?.ticker ?? '?'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Meta changes */}
      {payload.meta && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Settings changes</p>
          <div className="space-y-1.5">
            {payload.meta.lifespan_years && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Lifespan:</span>
                <span className="font-semibold text-slate-800">{payload.meta.lifespan_years.old}yr</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-emerald-700">{payload.meta.lifespan_years.new}yr</span>
              </div>
            )}
            {payload.meta.target_return && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Target return:</span>
                <span className="font-semibold text-slate-800">{(payload.meta.target_return.old * 100).toFixed(0)}%</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-emerald-700">{(payload.meta.target_return.new * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Comments</p>
        </div>
        {commentsLoading ? (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading…
          </div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-400 py-1">No comments yet.</p>
        ) : (
          <div className="space-y-2 mb-3">
            {comments.map((c) => (
              <div key={c.id} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-slate-500 font-mono">{shortId(c.user_id)}</span>
                  <span className="text-xs text-slate-300">{fmt(c.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
            placeholder="Add a comment…"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={sendComment}
            disabled={sendingComment || !newComment.trim()}
            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors disabled:opacity-40"
          >
            {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Owner actions */}
      {isOwner && proposal.status === 'open' && (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          {actionError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{actionError}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleAction('accept')}
              disabled={acting}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Accept
            </button>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="Reason for rejection (required)"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 min-w-0"
              />
              <button
                onClick={() => handleAction('reject', rejectComment)}
                disabled={acting || !rejectComment.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Propose Modal ────────────────────────────────────────────────────────────

interface ProposeModalProps {
  bucketId: number;
  holdings: HoldingInfo[];
  bucketTargetReturn: number;
  bucketLifespanYears: number;
  onClose: () => void;
  onSuccess: () => void;
}

type AddRow = {
  ticker: string;
  name: string;
  asset_type: 'stock' | 'etf' | 'bond';
  weight: string;
};

function ProposeModal({
  bucketId,
  holdings,
  bucketTargetReturn,
  bucketLifespanYears,
  onClose,
  onSuccess,
}: ProposeModalProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');

  // Editable weights (% strings), keyed by holding id
  const [editWeights, setEditWeights] = useState<Record<number, string>>(() =>
    Object.fromEntries(holdings.map(h => [h.id, (h.weight * 100).toFixed(1)]))
  );

  // Removals
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());

  // Additions
  const [addRows, setAddRows] = useState<AddRow[]>([]);

  // Meta
  const [newLifespan, setNewLifespan] = useState('');
  const [newTargetReturn, setNewTargetReturn] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  function toggleRemove(id: number) {
    setRemovedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addNewRow() {
    setAddRows(prev => [...prev, { ticker: '', name: '', asset_type: 'etf', weight: '5.0' }]);
  }

  function updateAddRow(i: number, field: keyof AddRow, value: string) {
    setAddRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function removeAddRow(i: number) {
    setAddRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    const weight_changes: ProposalPayload['weight_changes'] = [];
    for (const h of holdings) {
      if (removedIds.has(h.id)) continue;
      const newPct = parseFloat(editWeights[h.id] ?? '0') || 0;
      const newW = newPct / 100;
      if (Math.abs(newW - h.weight) > 0.0001) {
        weight_changes.push({ holding_id: h.id, ticker: h.ticker, old_weight: h.weight, new_weight: newW });
      }
    }

    const removals: ProposalPayload['removals'] = Array.from(removedIds).map(id => {
      const h = holdings.find(x => x.id === id)!;
      return { holding_id: id, ticker: h.ticker };
    });

    const additions: ProposalPayload['additions'] = addRows
      .filter(r => r.ticker.trim())
      .map(r => ({
        ticker: r.ticker.trim().toUpperCase(),
        name: r.name.trim() || r.ticker.trim().toUpperCase(),
        asset_type: r.asset_type,
        weight: (parseFloat(r.weight) || 0) / 100,
      }));

    const meta: ProposalPayload['meta'] = {};
    if (newLifespan.trim()) {
      const v = parseInt(newLifespan, 10);
      if (!isNaN(v) && v !== bucketLifespanYears) meta.lifespan_years = { old: bucketLifespanYears, new: v };
    }
    if (newTargetReturn.trim()) {
      const v = parseFloat(newTargetReturn) / 100;
      if (!isNaN(v) && Math.abs(v - bucketTargetReturn) > 0.0001) meta.target_return = { old: bucketTargetReturn, new: v };
    }

    const payload: ProposalPayload = {};
    if (weight_changes.length) payload.weight_changes = weight_changes;
    if (additions.length) payload.additions = additions;
    if (removals.length) payload.removals = removals;
    if (Object.keys(meta).length) payload.meta = meta;

    const hasChanges =
      (payload.weight_changes?.length ?? 0) > 0 ||
      (payload.additions?.length ?? 0) > 0 ||
      (payload.removals?.length ?? 0) > 0 ||
      payload.meta != null;

    if (!hasChanges) {
      setSubmitError('No changes detected. Modify at least one weight, add or remove a holding, or change settings.');
      return;
    }

    if (!title.trim()) {
      setSubmitError('Title is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/buckets/${bucketId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), summary: summary.trim() || undefined, payload }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json.error ?? 'Failed to submit proposal'); return; }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-slate-800">Propose Changes</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5">
          {/* Title + summary */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Title <span className="text-red-400">*</span></label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Reduce bond allocation, increase equity"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Summary (optional)</label>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Explain your reasoning…"
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
              />
            </div>
          </div>

          {/* Holdings table */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Holdings</p>
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-400 border-b border-slate-100">
                    <th className="text-left px-4 py-2 font-medium">Ticker</th>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-right px-4 py-2 font-medium">Weight %</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map(h => {
                    const removed = removedIds.has(h.id);
                    return (
                      <tr
                        key={h.id}
                        className={`border-b border-slate-50 ${removed ? 'opacity-40 bg-red-50/30' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">{h.ticker}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs truncate max-w-[120px]">{h.name || h.ticker}</td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            disabled={removed}
                            value={editWeights[h.id] ?? ''}
                            onChange={e => setEditWeights(prev => ({ ...prev, [h.id]: e.target.value }))}
                            className="w-16 text-center border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleRemove(h.id)}
                            className={`p-1 rounded-lg transition-colors ${
                              removed
                                ? 'bg-red-100 text-red-500 hover:bg-red-200'
                                : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                            }`}
                            title={removed ? 'Undo remove' : 'Remove holding'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Add rows */}
                  {addRows.map((row, i) => (
                    <tr key={`add-${i}`} className="border-b border-slate-50 bg-emerald-50/30">
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={row.ticker}
                          onChange={e => updateAddRow(i, 'ticker', e.target.value.toUpperCase())}
                          placeholder="TICKER"
                          className="w-20 border border-emerald-200 rounded-lg px-2 py-1 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 uppercase"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={row.name}
                            onChange={e => updateAddRow(i, 'name', e.target.value)}
                            placeholder="Name"
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <select
                            value={row.asset_type}
                            onChange={e => updateAddRow(i, 'asset_type', e.target.value)}
                            className="border border-slate-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none bg-white"
                          >
                            <option value="etf">ETF</option>
                            <option value="stock">Stock</option>
                            <option value="bond">Bond</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={row.weight}
                          onChange={e => updateAddRow(i, 'weight', e.target.value)}
                          className="w-16 text-center border border-emerald-200 rounded-lg px-1.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => removeAddRow(i)}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addNewRow}
              className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add holding
            </button>
          </div>

          {/* Meta changes */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Settings (optional changes)</p>
            <div className="flex gap-4 flex-wrap">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Lifespan (current: {bucketLifespanYears}yr)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newLifespan}
                    onChange={e => setNewLifespan(e.target.value)}
                    placeholder="—"
                    className="w-16 border border-slate-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-center"
                  />
                  <span className="text-xs text-slate-400">yr</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Target return (current: {(bucketTargetReturn * 100).toFixed(0)}%)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={newTargetReturn}
                    onChange={e => setNewTargetReturn(e.target.value)}
                    placeholder="—"
                    className="w-16 border border-slate-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-center"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            </div>
          </div>

          {submitError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{submitError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-400 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {submitting ? 'Submitting…' : 'Submit Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main ProposalsPanel ──────────────────────────────────────────────────────

export default function ProposalsPanel({
  bucketId,
  isOwner,
  holdings,
  bucketTargetReturn,
  bucketLifespanYears,
}: Props) {
  const [proposals, setProposals] = useState<BucketProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);

  const loadProposals = useCallback(async () => {
    setFetchError('');
    try {
      const res = await fetch(`/api/buckets/${bucketId}/proposals`);
      if (!res.ok) throw new Error('Failed to load proposals');
      const json = await res.json();
      setProposals(json.proposals ?? []);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [bucketId]);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  const openProposals = proposals.filter(p => p.status === 'open');
  const closedProposals = proposals.filter(p => p.status !== 'open');

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <h4 className="text-sm font-semibold text-slate-700">
              Proposals {proposals.length > 0 && `(${proposals.length})`}
            </h4>
          </div>
          {!isOwner && (
            <button
              onClick={() => setShowProposeModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Propose Changes
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading proposals…</span>
            </div>
          ) : fetchError ? (
            <p className="text-xs text-red-500">{fetchError}</p>
          ) : proposals.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">
              {isOwner ? 'No proposals yet.' : 'No proposals submitted yet. Use "Propose Changes" to suggest edits.'}
            </p>
          ) : (
            <div className="space-y-2">
              {/* Open first */}
              {openProposals.map(p => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  isOwner={isOwner}
                  holdings={holdings}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onResolved={loadProposals}
                />
              ))}
              {closedProposals.map(p => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  isOwner={isOwner}
                  holdings={holdings}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                  onResolved={loadProposals}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showProposeModal && (
        <ProposeModal
          bucketId={bucketId}
          holdings={holdings}
          bucketTargetReturn={bucketTargetReturn}
          bucketLifespanYears={bucketLifespanYears}
          onClose={() => setShowProposeModal(false)}
          onSuccess={() => {
            setShowProposeModal(false);
            loadProposals();
          }}
        />
      )}
    </>
  );
}

// ── ProposalCard ─────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: BucketProposal;
  isOwner: boolean;
  holdings: HoldingInfo[];
  expanded: boolean;
  onToggle: () => void;
  onResolved: () => void;
}

function ProposalCard({ proposal, isOwner, holdings, expanded, onToggle, onResolved }: ProposalCardProps) {
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{proposal.title}</span>
            {proposal.status === 'open' && isOwner && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 shrink-0">
                Needs Review
              </span>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_COLORS[proposal.status]}`}>
              {proposal.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-400 font-mono">{shortId(proposal.proposed_by)}</span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">{fmt(proposal.created_at)}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <ProposalDiff
          proposal={proposal}
          holdings={holdings}
          isOwner={isOwner}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}
