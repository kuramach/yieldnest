'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';

interface StressResult {
  mean_return: number;
  volatility: number;
  years: number;
  initial_amount: number;
  floor: number;
  median: number;
  ceiling: number;
  yearly: { year: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  scenarios: {
    id: string;
    label: string;
    description: string;
    floor: number;
    median: number;
    ceiling: number;
    year1_impact: number;
  }[];
}

interface Props {
  holdings: { weight: number; year_return?: number; asset_type?: string }[];
  lifespan_years: number;
  initial_amount: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function pct(n: number, decimals = 1) {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(decimals)}%`;
}

function GaugeBar({ floor, median, ceiling, initial }: { floor: number; median: number; ceiling: number; initial: number }) {
  const max = ceiling * 1.05;
  const floorPct = Math.max(0, (floor / max) * 100);
  const medPct = Math.max(0, (median / max) * 100);
  const ceilPct = Math.max(0, (ceiling / max) * 100);
  const initPct = Math.max(0, (initial / max) * 100);

  return (
    <div className="relative h-6 bg-slate-100 rounded-full overflow-hidden mt-2">
      {/* Range band */}
      <div
        className="absolute top-0 h-full bg-emerald-100 rounded-full"
        style={{ left: `${floorPct}%`, width: `${ceilPct - floorPct}%` }}
      />
      {/* Median marker */}
      <div
        className="absolute top-1 h-4 w-1 bg-emerald-600 rounded-full"
        style={{ left: `${medPct - 0.5}%` }}
      />
      {/* Initial investment marker */}
      <div
        className="absolute top-0 h-6 w-0.5 bg-slate-400"
        style={{ left: `${initPct}%` }}
        title="Initial investment"
      />
    </div>
  );
}

const MILESTONE_YEARS = [1, 3, 5, 10, 15, 20, 25, 30];

export default function StressTestPanel({ holdings, lifespan_years, initial_amount }: Props) {
  const [result, setResult] = useState<StressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showYearly, setShowYearly] = useState(false);
  const [ran, setRan] = useState(false);

  async function run() {
    if (!holdings.length || !initial_amount) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stress-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings, lifespan_years, initial_amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Stress test failed');
      setResult(json);
      setRan(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const milestones = result
    ? MILESTONE_YEARS.filter(y => y <= result.years).map(y => result.yearly[y - 1]).filter(Boolean)
    : [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Stress Test</h3>
          {ran && result && (
            <span className="text-xs text-slate-400 ml-1">
              10,000 simulations · {(result.mean_return * 100).toFixed(1)}% mean · {(result.volatility * 100).toFixed(1)}% vol
            </span>
          )}
        </div>
        <button
          onClick={run}
          disabled={loading || !initial_amount || !holdings.length}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          {loading ? 'Running 10k simulations…' : ran ? 'Re-run' : 'Run Stress Test'}
        </button>
      </div>

      {!ran && !loading && (
        <div className="px-5 py-8 text-center text-slate-400 text-sm">
          {!initial_amount
            ? 'Set an initial amount on this bucket to run simulations'
            : !holdings.length
            ? 'Add holdings to run stress test'
            : 'Run 10,000 Monte Carlo simulations to see floor, ceiling, and median outcomes over the full lifespan'}
        </div>
      )}

      {error && <div className="px-5 py-3 text-sm text-red-600 bg-red-50">{error}</div>}

      {result && (
        <div className="p-5 space-y-6">
          {/* Summary: 3 outcome buckets */}
          <div>
            <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">
              After {result.years} Years — {result.years.toLocaleString()} Simulated Paths
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Floor', sub: 'Worst 10% of outcomes', value: result.floor, icon: TrendingDown, color: 'rose' },
                { label: 'Median', sub: 'Most likely outcome (P50)', value: result.median, icon: Minus, color: 'blue' },
                { label: 'Ceiling', sub: 'Best 10% of outcomes', value: result.ceiling, icon: TrendingUp, color: 'emerald' },
              ].map(({ label, sub, value, icon: Icon, color }) => {
                const gain = (value - result.initial_amount) / result.initial_amount;
                return (
                  <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className={`w-4 h-4 text-${color}-500`} />
                      <span className={`text-xs font-semibold text-${color}-700`}>{label}</span>
                    </div>
                    <p className={`text-2xl font-bold text-${color}-800`}>{fmt(value)}</p>
                    <p className={`text-xs text-${color}-600 mt-0.5`}>{pct(gain)} total · {sub}</p>
                  </div>
                );
              })}
            </div>

            {/* Visual range bar */}
            <GaugeBar
              floor={result.floor}
              median={result.median}
              ceiling={result.ceiling}
              initial={result.initial_amount}
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Floor {fmt(result.floor)}</span>
              <span className="text-emerald-700 font-medium">● Median {fmt(result.median)}</span>
              <span>Ceiling {fmt(result.ceiling)}</span>
            </div>
          </div>

          {/* Milestones table */}
          {milestones.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider font-semibold">Portfolio Value Over Time</p>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 font-medium text-slate-500">Year</th>
                      <th className="text-right px-4 py-2.5 font-medium text-rose-500">Floor (P10)</th>
                      <th className="text-right px-4 py-2.5 font-medium text-slate-500">25th pct</th>
                      <th className="text-right px-4 py-2.5 font-medium text-blue-600">Median</th>
                      <th className="text-right px-4 py-2.5 font-medium text-slate-500">75th pct</th>
                      <th className="text-right px-4 py-2.5 font-medium text-emerald-600">Ceiling (P90)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {MILESTONE_YEARS.filter(y => y <= result.years).map(y => {
                      const row = result.yearly[y - 1];
                      if (!row) return null;
                      return (
                        <tr key={y} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-semibold text-slate-700">Yr {y}</td>
                          <td className="px-4 py-2.5 text-right text-rose-600 font-medium">{fmt(row.p10)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmt(row.p25)}</td>
                          <td className="px-4 py-2.5 text-right text-blue-700 font-semibold">{fmt(row.p50)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmt(row.p75)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">{fmt(row.p90)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => setShowYearly(!showYearly)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-2 transition-colors"
              >
                {showYearly ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showYearly ? 'Hide' : 'Show'} all {result.years} years
              </button>

              {showYearly && (
                <div className="overflow-x-auto rounded-xl border border-slate-100 mt-2 max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-500">Year</th>
                        <th className="text-right px-4 py-2 font-medium text-rose-500">P10</th>
                        <th className="text-right px-4 py-2 font-medium text-blue-600">P50</th>
                        <th className="text-right px-4 py-2 font-medium text-emerald-600">P90</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {result.yearly.map(row => (
                        <tr key={row.year} className="hover:bg-slate-50">
                          <td className="px-4 py-1.5 font-medium text-slate-600">Yr {row.year}</td>
                          <td className="px-4 py-1.5 text-right text-rose-600">{fmt(row.p10)}</td>
                          <td className="px-4 py-1.5 text-right text-blue-700 font-semibold">{fmt(row.p50)}</td>
                          <td className="px-4 py-1.5 text-right text-emerald-700">{fmt(row.p90)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Historical crisis scenarios */}
          <div>
            <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">Historical Crisis Scenarios</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.scenarios.map(sc => {
                const medGain = (sc.median - result.initial_amount) / result.initial_amount;
                const floorGain = (sc.floor - result.initial_amount) / result.initial_amount;
                const yr1Change = (sc.year1_impact - result.initial_amount) / result.initial_amount;
                return (
                  <div key={sc.id} className="border border-slate-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-slate-800">{sc.label}</p>
                    <p className="text-xs text-slate-400 mb-3">{sc.description}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">After year 1</span>
                        <span className={`font-semibold ${yr1Change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(sc.year1_impact)} <span className="font-normal opacity-75">({pct(yr1Change)})</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Final floor (P10)</span>
                        <span className={`font-semibold ${floorGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(sc.floor)} <span className="font-normal opacity-75">({pct(floorGain)})</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Final median</span>
                        <span className={`font-semibold ${medGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(sc.median)} <span className="font-normal opacity-75">({pct(medGain)})</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-slate-300">
            Monte Carlo assumes log-normal annual returns. Volatility estimated from asset type mix.
            Historical scenarios apply actual crisis-year return shocks then revert to simulated returns.
            Past crises do not predict future events.
          </p>
        </div>
      )}
    </div>
  );
}
