'use client';

import { use, useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, RefreshCw } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimOutput {
  percentiles: number[][];
  finalValues: number[];
  probGrowth: number;
  probRuin: number;
  median: number;
  p10: number;
  p90: number;
}

// ── SVG Fan Chart ─────────────────────────────────────────────────────────────

const W = 760, H = 340;
const PAD = { top: 20, right: 20, bottom: 48, left: 72 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function FanChart({ result, years, initialValue }: { result: SimOutput; years: number; initialValue: number }) {
  const maxVal = Math.max(...result.percentiles.map(p => p[6])) * 1.05;

  function xScale(year: number) {
    return PAD.left + (year / Math.max(years - 1, 1)) * PLOT_W;
  }
  function yScale(val: number) {
    return PAD.top + PLOT_H - (val / maxVal) * PLOT_H;
  }
  function pathD(values: number[]) {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
  }
  function bandD(lower: number[], upper: number[]) {
    const fwd = upper.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
    const back = [...lower].reverse().map((v, i) => `L ${xScale(lower.length - 1 - i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(' ');
    return `${fwd} ${back} Z`;
  }

  const pct = (i: number) => result.percentiles.map(yr => yr[i]);
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => maxVal * (i / tickCount));
  const xTicks = Array.from({ length: years }, (_, i) => i).filter(i => i % 5 === 0 || i === years - 1);

  function fmtVal(v: number) {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <path d={bandD(pct(0), pct(6))} fill="#d1fae5" opacity={0.5} />
      <path d={bandD(pct(1), pct(5))} fill="#6ee7b7" opacity={0.5} />
      <path d={bandD(pct(2), pct(4))} fill="#34d399" opacity={0.5} />
      <path d={pathD(pct(3))} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinejoin="round" />

      <line x1={PAD.left} x2={W - PAD.right} y1={yScale(initialValue)} y2={yScale(initialValue)}
        stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" />
      <text x={PAD.left + 4} y={yScale(initialValue) - 4} fontSize={9} fill="#94a3b8">Starting value</text>

      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left - 4} x2={PAD.left} y1={yScale(v)} y2={yScale(v)} stroke="#cbd5e1" />
          <line x1={PAD.left} x2={W - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="#f1f5f9" />
          <text x={PAD.left - 7} y={yScale(v) + 4} fontSize={10} fill="#64748b" textAnchor="end">{fmtVal(v)}</text>
        </g>
      ))}

      {xTicks.map(i => (
        <g key={i}>
          <line x1={xScale(i)} x2={xScale(i)} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H + 4} stroke="#cbd5e1" />
          <text x={xScale(i)} y={PAD.top + PLOT_H + 16} fontSize={10} fill="#64748b" textAnchor="middle">Yr {i + 1}</text>
        </g>
      ))}

      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#cbd5e1" />
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="#cbd5e1" />

      {[
        { color: '#d1fae5', label: '5th–95th %ile' },
        { color: '#6ee7b7', label: '10th–90th %ile' },
        { color: '#34d399', label: '25th–75th %ile' },
        { color: '#059669', label: 'Median (p50)', line: true },
      ].map(({ color, label, line }, i) => (
        <g key={i} transform={`translate(${PAD.left + i * 148}, ${H - 14})`}>
          {line
            ? <line x1={0} x2={16} y1={6} y2={6} stroke={color} strokeWidth={2.5} />
            : <rect width={16} height={12} fill={color} rx={2} />}
          <text x={20} y={10} fontSize={10} fill="#64748b">{label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

function NumInput({ label, value, onChange, prefix, suffix, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm text-slate-400">{prefix}</span>}
        <input type="number" value={value} min={min} max={max} step={step ?? 1}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className={`w-full border border-slate-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-10' : 'pr-3'}`} />
        {suffix && <span className="absolute right-3 text-sm text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'slate' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-white border-slate-200 text-slate-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  return (
    <div className={`border rounded-2xl p-4 ${colors[color]}`}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color === 'slate' ? 'text-slate-900' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmtMoney(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface BucketRow { id: number; name: string; target_return: number; initial_amount: number }

function MonteCarloInner({ id }: { id: string }) {
  const [portfolio, setPortfolio] = useState<{ name: string; buckets: BucketRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const [initialValue, setInitialValue] = useState(100000);
  const [years, setYears] = useState(20);
  const [withdrawal, setWithdrawal] = useState(0);
  const [volatility, setVolatility] = useState(12);
  const [simCount, setSimCount] = useState(1000);

  const [result, setResult] = useState<SimOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/portfolios/${id}/monte-carlo-data`)
      .then(r => r.json())
      .then(data => {
        setPortfolio(data);
        if (data.buckets?.length) {
          setInitialValue(data.buckets.reduce((s: number, b: BucketRow) => s + b.initial_amount, 0) || 100000);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const blendedReturn = useMemo(() => {
    if (!portfolio?.buckets?.length) return 0.07;
    const total = portfolio.buckets.reduce((s, b) => s + b.initial_amount, 0) || 1;
    return portfolio.buckets.reduce((s, b) => s + b.target_return * (b.initial_amount / total), 0);
  }, [portfolio]);

  const runSim = useCallback(async () => {
    setRunning(true);
    setError('');
    try {
      const res = await fetch(`/api/portfolios/${id}/monte-carlo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meanReturn: blendedReturn, volatility: volatility / 100, initialValue, years, annualWithdrawal: withdrawal, simCount }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setRunning(false);
    }
  }, [id, blendedReturn, volatility, initialValue, years, withdrawal, simCount]);

  useEffect(() => { if (portfolio && !result) runSim(); }, [portfolio]); // eslint-disable-line

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin" /> Loading portfolio…
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <Link href={`/dashboard/portfolio/${id}`}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 mb-6 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Portfolio
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Monte Carlo Simulation</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {portfolio?.name} · {simCount.toLocaleString()} scenarios · blended return {(blendedReturn * 100).toFixed(1)}%
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <NumInput label="Starting Value" value={initialValue} onChange={setInitialValue} prefix="$" min={0} step={1000} />
          <NumInput label="Time Horizon" value={years} onChange={v => setYears(Math.max(1, Math.min(50, v)))} suffix="yrs" min={1} max={50} />
          <NumInput label="Annual Withdrawal" value={withdrawal} onChange={setWithdrawal} prefix="$" min={0} step={1000} />
          <NumInput label="Volatility (override)" value={volatility} onChange={setVolatility} suffix="%" min={1} max={60} />
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Simulations</label>
            <select value={simCount} onChange={e => setSimCount(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
              <option value={500}>500 (fast)</option>
              <option value={1000}>1,000</option>
              <option value={5000}>5,000</option>
              <option value={20000}>20,000 (slow)</option>
            </select>
          </div>
        </div>
        <button onClick={runSim} disabled={running}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? 'Simulating…' : 'Run Simulation'}
        </button>
        {error && <p className="text-sm text-rose-500 mt-2">{error}</p>}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <StatCard label="Median Outcome" value={fmtMoney(result.median)}
              sub={`${result.median >= initialValue ? '+' : ''}${(((result.median - initialValue) / initialValue) * 100).toFixed(0)}% vs start`}
              color="emerald" />
            <StatCard label="10th Percentile" value={fmtMoney(result.p10)} sub="bad scenario" color="amber" />
            <StatCard label="90th Percentile" value={fmtMoney(result.p90)} sub="good scenario" color="blue" />
            <StatCard label="Prob. of Growth" value={`${(result.probGrowth * 100).toFixed(1)}%`}
              sub="ends above start" color={result.probGrowth >= 0.6 ? 'emerald' : 'amber'} />
            <StatCard label="Prob. of Ruin" value={`${(result.probRuin * 100).toFixed(1)}%`}
              sub="portfolio hits $0" color={result.probRuin > 0.1 ? 'rose' : 'slate'} />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
            <h2 className="font-semibold text-slate-800 mb-4">Portfolio Value Over Time</h2>
            <FanChart result={result} years={years} initialValue={initialValue} />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Final Value Distribution</h2>
            <div className="grid grid-cols-7 gap-2 text-center text-sm">
              {[
                { pct: '5th', idx: Math.floor(simCount * 0.05), color: 'text-rose-500' },
                { pct: '10th', idx: Math.floor(simCount * 0.10), color: 'text-orange-500' },
                { pct: '25th', idx: Math.floor(simCount * 0.25), color: 'text-amber-500' },
                { pct: '50th', idx: Math.floor(simCount * 0.50), color: 'text-emerald-600' },
                { pct: '75th', idx: Math.floor(simCount * 0.75), color: 'text-emerald-700' },
                { pct: '90th', idx: Math.floor(simCount * 0.90), color: 'text-blue-600' },
                { pct: '95th', idx: Math.floor(simCount * 0.95), color: 'text-blue-700' },
              ].map(({ pct, idx, color }) => (
                <div key={pct} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">{pct} %ile</p>
                  <p className={`font-bold text-sm ${color}`}>{fmtMoney(result.finalValues[Math.min(idx, result.finalValues.length - 1)])}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              Assumes {(blendedReturn * 100).toFixed(1)}% mean annual return · {volatility}% volatility · {years}-year horizon · {withdrawal > 0 ? `$${withdrawal.toLocaleString()}/yr withdrawal` : 'no withdrawals'} · {simCount.toLocaleString()} simulations
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default function MonteCarloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={
      <div className="p-8 flex items-center gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin" /> Loading…
      </div>
    }>
      <MonteCarloInner id={id} />
    </Suspense>
  );
}
