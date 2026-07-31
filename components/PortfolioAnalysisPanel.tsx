'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Brain, TrendingUp, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import type { HoldingHistoricalStats } from '@/lib/types';

interface SavedAnalysis {
  id: number;
  created_at: string;
  ai_narrative: string;
  target_return: number;
  available_cash: number;
  portfolio_best: number;
  portfolio_worst: number;
  portfolio_median: number;
  stats: HoldingHistoricalStats[];
}

interface RebalanceSuggestion {
  ticker: string;
  name: string;
  current_weight: number;
  suggested_weight: number;
  cagr: number;
  price: number;
  shares_to_buy: number;
  dollar_amount: number;
}

function pct(n: number) {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PortfolioAnalysisPanel({ portfolioId }: { portfolioId: number }) {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  // Rebalance modal state
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceSuggestions, setRebalanceSuggestions] = useState<RebalanceSuggestion[]>([]);
  const [rebalanceAnalysisId, setRebalanceAnalysisId] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState(false);

  const loadAnalyses = useCallback(async () => {
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/analyses`);
      const data = await res.json();
      setAnalyses(data.analyses ?? []);
      if (data.analyses?.length > 0) setExpanded(data.analyses[0].id);
    } catch {}
    setLoading(false);
  }, [portfolioId]);

  useEffect(() => { loadAnalyses(); }, [loadAnalyses]);

  async function runNewAnalysis() {
    setRunning(true);
    setRunError('');
    try {
      // Fetch current holdings from all buckets
      const holdingsRes = await fetch(`/api/portfolios/${portfolioId}/monte-carlo-data`);
      const portfolioData = await holdingsRes.json();
      const buckets = portfolioData.buckets ?? [];
      if (buckets.length === 0) { setRunError('No buckets with holdings found.'); return; }

      // Get bucket holdings
      const bucketsRes = await fetch(`/api/portfolios/${portfolioId}/holdings-flat`);
      const { holdings } = await bucketsRes.json();
      if (!holdings?.length) { setRunError('No holdings found in portfolio.'); return; }

      const targetReturn = buckets.reduce((s: number, b: any) => s + b.target_return * (b.initial_amount / (buckets.reduce((t: number, x: any) => t + x.initial_amount, 0) || 1)), 0);

      const analyzeRes = await fetch('/api/portfolios/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings, target_return: targetReturn, available_cash: 0 }),
      });
      if (!analyzeRes.ok) { const e = await analyzeRes.json(); setRunError(e.error || 'Analysis failed'); return; }
      const analysis = await analyzeRes.json();

      // Save it
      await fetch(`/api/portfolios/${portfolioId}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...analysis, target_return: targetReturn, available_cash: 0 }),
      });

      await loadAnalyses();
    } catch (e: any) {
      setRunError(e.message || 'Something went wrong');
    } finally {
      setRunning(false);
    }
  }

  async function actOnAnalysis(analysis: SavedAnalysis) {
    setRebalancing(true);
    setRebalanceAnalysisId(analysis.id);
    setApplyError('');
    setApplySuccess(false);
    try {
      const holdingsRes = await fetch(`/api/portfolios/${portfolioId}/holdings-flat`);
      const { holdings } = await holdingsRes.json();
      if (!holdings?.length) { setRebalancing(false); setApplyError('No holdings to rebalance.'); return; }

      const res = await fetch('/api/portfolios/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings,
          stats: analysis.stats,
          target_return: analysis.target_return,
          available_cash: analysis.available_cash,
        }),
      });
      if (!res.ok) { const e = await res.json(); setRebalancing(false); setApplyError(e.error || 'Optimize failed'); return; }
      const { optimized } = await res.json();

      // Map to suggestions with current vs suggested
      const currentMap: Record<string, number> = {};
      holdings.forEach((h: any) => { currentMap[h.ticker] = (currentMap[h.ticker] || 0) + h.weight; });

      setRebalanceSuggestions(optimized.map((h: any) => ({
        ticker: h.ticker,
        name: h.name,
        current_weight: currentMap[h.ticker] ?? 0,
        suggested_weight: h.weight,
        cagr: h.cagr,
        price: h.price,
        shares_to_buy: h.shares_to_buy,
        dollar_amount: h.dollar_amount,
      })));
    } catch (e: any) {
      setApplyError(e.message);
    } finally {
      setRebalancing(false);
    }
  }

  async function applyRebalance() {
    setApplying(true);
    setApplyError('');
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/rebalance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions: rebalanceSuggestions }),
      });
      if (!res.ok) { const e = await res.json(); setApplyError(e.error || 'Apply failed'); return; }
      setApplySuccess(true);
      setRebalanceSuggestions([]);
      setRebalanceAnalysisId(null);
      setTimeout(() => setApplySuccess(false), 3000);
    } catch (e: any) {
      setApplyError(e.message);
    } finally {
      setApplying(false);
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading analyses…
    </div>
  );

  return (
    <div id="ai-analysis" className="mt-8 border-t border-slate-100 pt-6">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-violet-500" />
            <h2 className="font-semibold text-slate-800">AI Analysis &amp; Rebalancing</h2>
            {analyses.length > 0 && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
                {analyses.length} saved
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 max-w-lg">
            AI fetches 20yr historical data for every holding, scores each by CAGR and risk-adjusted return, writes a narrative, and suggests new weights.
            <span className="font-semibold text-slate-500"> Rebalance</span> = apply the AI-optimised weights to your bucket holdings. Run it any time.
          </p>
        </div>
        <button onClick={runNewAnalysis} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shrink-0 ml-4">
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
          {running ? 'Analysing…' : 'Run New Analysis'}
        </button>
      </div>

      {runError && <p className="text-sm text-rose-500 mt-3">{runError}</p>}
      {applySuccess && <p className="text-sm text-emerald-600 mt-3">Portfolio weights updated successfully.</p>}
      {applyError && <p className="text-sm text-rose-500 mt-3">{applyError}</p>}

      <div className="mt-4">
      {analyses.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl">
          <Brain className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 font-medium text-sm mb-1">No analyses yet</p>
          <p className="text-slate-400 text-xs mb-4">Click "Run New Analysis" above — works on any portfolio with holdings</p>
          <button onClick={runNewAnalysis} disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            {running ? 'Analysing…' : 'Run First Analysis'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map(a => (
            <div key={a.id} className="border border-slate-200 rounded-2xl overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{fmtDate(a.created_at)}</span>
                  <div className="flex gap-2 text-xs">
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                      Best {pct(a.portfolio_best)}
                    </span>
                    <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">
                      Worst {pct(a.portfolio_worst)}
                    </span>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                      Median {pct(a.portfolio_median)}
                    </span>
                    <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
                      Target {(a.target_return * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {expanded === a.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {expanded === a.id && (
                <div className="px-5 pb-5 border-t border-slate-100">
                  {/* AI narrative */}
                  <div className="bg-violet-50 rounded-xl p-4 my-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {a.ai_narrative || 'No narrative available.'}
                  </div>

                  {/* Per-ticker stats */}
                  {a.stats?.length > 0 && (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-1.5 pr-4 font-semibold text-slate-500">Ticker</th>
                            <th className="text-right pr-4 font-semibold text-slate-500">CAGR</th>
                            <th className="text-right pr-4 font-semibold text-slate-500">Best Yr</th>
                            <th className="text-right pr-4 font-semibold text-slate-500">Worst Yr</th>
                            <th className="text-right pr-4 font-semibold text-slate-500">Median</th>
                            <th className="text-right font-semibold text-slate-500">Volatility</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {a.stats.map(s => (
                            <tr key={s.ticker}>
                              <td className="py-1.5 pr-4 font-mono font-bold text-slate-700">{s.ticker}</td>
                              <td className="text-right pr-4 text-emerald-600 font-semibold">{pct(s.cagr)}</td>
                              <td className="text-right pr-4 text-emerald-600">{pct(s.best_year)}</td>
                              <td className="text-right pr-4 text-rose-500">{pct(s.worst_year)}</td>
                              <td className="text-right pr-4 text-slate-600">{pct(s.median_year)}</td>
                              <td className="text-right text-amber-600">{pct(s.volatility)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Act on Analysis button */}
                  <button
                    onClick={() => actOnAnalysis(a)}
                    disabled={rebalancing && rebalanceAnalysisId === a.id}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {rebalancing && rebalanceAnalysisId === a.id
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Zap className="w-4 h-4" />}
                    {rebalancing && rebalanceAnalysisId === a.id ? 'Computing rebalance…' : 'Act on Analysis — Rebalance Portfolio'}
                  </button>

                  {/* Rebalance suggestions for this analysis */}
                  {rebalanceAnalysisId === a.id && rebalanceSuggestions.length > 0 && (
                    <div className="mt-4 border border-emerald-200 rounded-xl overflow-hidden">
                      <div className="bg-emerald-50 px-4 py-3">
                        <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          Suggested Rebalancing — review and apply
                        </p>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="text-left px-4 py-2 font-semibold text-slate-500">Ticker</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">Current</th>
                            <th className="text-right px-3 py-2 font-semibold text-emerald-600">Suggested</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">Change</th>
                            <th className="text-right px-4 py-2 font-semibold text-slate-500">CAGR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {rebalanceSuggestions.map(s => {
                            const delta = s.suggested_weight - s.current_weight;
                            return (
                              <tr key={s.ticker} className={Math.abs(delta) > 0.05 ? 'bg-amber-50' : ''}>
                                <td className="px-4 py-2 font-mono font-bold text-slate-700">{s.ticker}</td>
                                <td className="text-right px-3 py-2 text-slate-500">{(s.current_weight * 100).toFixed(0)}%</td>
                                <td className="text-right px-3 py-2 text-emerald-700 font-semibold">{(s.suggested_weight * 100).toFixed(0)}%</td>
                                <td className={`text-right px-3 py-2 font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                  {delta === 0 ? '—' : (delta > 0 ? '+' : '') + (delta * 100).toFixed(0) + '%'}
                                </td>
                                <td className="text-right px-4 py-2 text-slate-600">{pct(s.cagr)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="px-4 py-3 bg-slate-50 flex items-center gap-3">
                        <button onClick={applyRebalance} disabled={applying}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                          {applying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          {applying ? 'Applying…' : 'Apply New Weights'}
                        </button>
                        <button onClick={() => { setRebalanceSuggestions([]); setRebalanceAnalysisId(null); }}
                          className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-100 transition-colors">
                          Dismiss
                        </button>
                        <p className="text-xs text-slate-400 ml-auto">Highlighted rows have &gt;5% change</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
