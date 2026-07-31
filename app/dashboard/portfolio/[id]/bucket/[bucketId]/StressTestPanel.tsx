'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend,
} from 'recharts';

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

function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function pct(n: number, decimals = 1) {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(decimals)}%`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const vals: Record<string, number> = {};
  payload.forEach((p: any) => { vals[p.dataKey] = p.value; });
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2">Year {label}</p>
      <div className="flex justify-between gap-4"><span className="text-emerald-600">Ceiling (P90)</span><span className="font-semibold">{fmtM(vals.p90 ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-slate-500">75th pct</span><span className="font-semibold">{fmtM(vals.p75 ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-blue-600 font-medium">Median</span><span className="font-semibold text-blue-700">{fmtM(vals.p50 ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-slate-500">25th pct</span><span className="font-semibold">{fmtM(vals.p25 ?? 0)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-rose-500">Floor (P10)</span><span className="font-semibold">{fmtM(vals.p10 ?? 0)}</span></div>
    </div>
  );
};

const MILESTONE_YEARS = [1, 3, 5, 10, 15, 20, 25, 30];

export default function StressTestPanel({ holdings, lifespan_years, initial_amount }: Props) {
  const [result, setResult] = useState<StressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  // Build chart data: year 0 = initial, then each simulated year
  const chartData = result
    ? [
        { year: 0, p10: initial_amount, p25: initial_amount, p50: initial_amount, p75: initial_amount, p90: initial_amount },
        ...result.yearly.map(r => ({ year: r.year, p10: r.p10, p25: r.p25, p50: r.p50, p75: r.p75, p90: r.p90 })),
      ]
    : [];

  // Thin out to max 30 points for chart readability
  const chartPoints = chartData.filter((_, i) => {
    if (!result || result.years <= 30) return true;
    return i === 0 || (i % Math.ceil(result.years / 30)) === 0 || i === chartData.length - 1;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Stress Test</h3>
          {ran && result && (
            <span className="text-xs text-slate-400 ml-1">
              10k simulations · {(result.mean_return * 100).toFixed(1)}% mean · {(result.volatility * 100).toFixed(1)}% vol
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
        <div className="px-5 py-10 text-center text-slate-400 text-sm">
          {!initial_amount
            ? 'Set an initial amount on this bucket to run simulations'
            : !holdings.length
            ? 'Add holdings to run stress test'
            : 'Run 10,000 Monte Carlo simulations to see your range of outcomes as a fan chart'}
        </div>
      )}

      {error && <div className="px-5 py-3 text-sm text-red-600 bg-red-50">{error}</div>}

      {result && (
        <div className="p-5 space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Floor', sub: 'Worst 10%', value: result.floor, icon: TrendingDown, color: 'rose' },
              { label: 'Median', sub: 'Most likely (P50)', value: result.median, icon: Minus, color: 'blue' },
              { label: 'Ceiling', sub: 'Best 10%', value: result.ceiling, icon: TrendingUp, color: 'emerald' },
            ].map(({ label, sub, value, icon: Icon, color }) => {
              const gain = (value - result.initial_amount) / result.initial_amount;
              return (
                <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
                    <span className={`text-xs font-semibold text-${color}-700`}>{label}</span>
                  </div>
                  <p className={`text-xl font-bold text-${color}-800`}>{fmt(value)}</p>
                  <p className={`text-xs text-${color}-600 mt-0.5`}>{pct(gain)} total · {sub}</p>
                </div>
              );
            })}
          </div>

          {/* Fan chart */}
          <div>
            <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">
              Portfolio Value Fan Chart — {result.years}-Year Projection
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartPoints} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="outerBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="innerBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={v => v === 0 ? 'Now' : `Yr ${v}`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={fmtM}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Outer band: P10–P90 */}
                <Area
                  type="monotone"
                  dataKey="p90"
                  stroke="none"
                  fill="url(#outerBand)"
                  fillOpacity={1}
                  legendType="none"
                  name="Ceiling (P90)"
                />
                <Area
                  type="monotone"
                  dataKey="p10"
                  stroke="none"
                  fill="white"
                  fillOpacity={1}
                  legendType="none"
                  name="Floor (P10)"
                />

                {/* Inner band: P25–P75 */}
                <Area
                  type="monotone"
                  dataKey="p75"
                  stroke="none"
                  fill="url(#innerBand)"
                  fillOpacity={1}
                  legendType="none"
                  name="75th pct"
                />
                <Area
                  type="monotone"
                  dataKey="p25"
                  stroke="none"
                  fill="white"
                  fillOpacity={1}
                  legendType="none"
                  name="25th pct"
                />

                {/* Median line */}
                <Area
                  type="monotone"
                  dataKey="p50"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="none"
                  dot={false}
                  name="Median (P50)"
                />

                {/* P10 border line */}
                <Area
                  type="monotone"
                  dataKey="p10"
                  stroke="#f87171"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={false}
                  name="Floor (P10)"
                />

                {/* P90 border line */}
                <Area
                  type="monotone"
                  dataKey="p90"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={false}
                  name="Ceiling (P90)"
                />

                {/* Initial investment reference */}
                <ReferenceLine
                  y={result.initial_amount}
                  stroke="#94a3b8"
                  strokeDasharray="6 3"
                  label={{ value: 'Initial', position: 'insideTopLeft', fontSize: 10, fill: '#94a3b8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-emerald-400 rounded inline-block" style={{ borderTop: '2px dashed' }} />Ceiling P90</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-3 bg-emerald-100 rounded inline-block" />Middle 50%</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5 bg-blue-500 rounded" />Median P50</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5 bg-rose-400 rounded" style={{ borderTop: '2px dashed' }} />Floor P10</span>
            </div>
          </div>

          {/* Milestone table */}
          <div>
            <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider font-semibold">Key Milestones</p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Year</th>
                    <th className="text-right px-4 py-2.5 font-medium text-rose-500">Floor P10</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-400">25th</th>
                    <th className="text-right px-4 py-2.5 font-medium text-blue-600">Median</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-400">75th</th>
                    <th className="text-right px-4 py-2.5 font-medium text-emerald-600">Ceiling P90</th>
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
                        <td className="px-4 py-2.5 text-right text-slate-400">{fmt(row.p25)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-700 font-semibold">{fmt(row.p50)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{fmt(row.p75)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700 font-medium">{fmt(row.p90)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical crisis scenarios */}
          <div>
            <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">Historical Crisis Overlays</p>
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
                          {fmt(sc.year1_impact)} <span className="font-normal opacity-70">({pct(yr1Change)})</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Final floor (P10)</span>
                        <span className={`font-semibold ${floorGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(sc.floor)} <span className="font-normal opacity-70">({pct(floorGain)})</span>
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Final median</span>
                        <span className={`font-semibold ${medGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(sc.median)} <span className="font-normal opacity-70">({pct(medGain)})</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-slate-300">
            Monte Carlo uses log-normal annual returns. Volatility estimated from asset mix (bond 5%, ETF 15%, stock 22%).
            Historical overlays apply real crisis-year shocks then revert to simulated returns.
            Not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
