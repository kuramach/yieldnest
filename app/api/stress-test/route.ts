import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Volatility by asset type (annual standard deviation)
const VOL_BY_TYPE: Record<string, number> = {
  bond: 0.05,
  etf: 0.15,
  stock: 0.22,
};

function randNormal(mean: number, std: number): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

// Historical crisis year sequences (as annual return deltas applied on top of base)
const SCENARIOS = [
  {
    id: '2008',
    label: '2008 Financial Crisis',
    description: 'Lehman collapse, housing crash',
    shocks: [-0.37, 0.265, 0.151],
  },
  {
    id: '2000',
    label: 'Dot-com Bust 2000–02',
    description: 'Tech bubble collapse, 3-year bear',
    shocks: [-0.091, -0.119, -0.221],
  },
  {
    id: '2022',
    label: '2022 Rate Shock',
    description: 'Fastest Fed rate hike cycle in 40 years',
    shocks: [-0.196],
  },
  {
    id: 'stagflation',
    label: '1970s Stagflation',
    description: 'High inflation, stagnant growth for a decade',
    shocks: [-0.04, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04, -0.04],
  },
];

function runMonteCarlo(
  meanReturn: number,
  volatility: number,
  initialValue: number,
  years: number,
  annualWithdrawal: number,
  simCount: number,
  yearlyShocks: number[] = [],
) {
  const yearData: number[][] = Array.from({ length: years }, () => []);

  for (let s = 0; s < simCount; s++) {
    let value = initialValue;
    for (let y = 0; y < years; y++) {
      const shock = y < yearlyShocks.length ? yearlyShocks[y] : 0;
      const r = randNormal(meanReturn, volatility) + shock;
      value = Math.max(value * (1 + r) - annualWithdrawal, 0);
      yearData[y].push(value);
      if (value <= 0) {
        for (let rem = y + 1; rem < years; rem++) yearData[rem].push(0);
        break;
      }
    }
  }

  return yearData.map(vals => {
    const sorted = [...vals].sort((a, b) => a - b);
    const p = (pct: number) => sorted[Math.min(Math.floor(pct * simCount), simCount - 1)];
    return { p10: p(0.1), p25: p(0.25), p50: p(0.5), p75: p(0.75), p90: p(0.9) };
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    holdings,
    lifespan_years,
    initial_amount,
    annual_withdrawal = 0,
    sim_count = 10000,
  } = body as {
    holdings: Array<{ weight: number; year_return?: number; asset_type?: string }>;
    lifespan_years: number;
    initial_amount: number;
    annual_withdrawal?: number;
    sim_count?: number;
  };

  if (!holdings?.length) return NextResponse.json({ error: 'No holdings' }, { status: 400 });
  if (!lifespan_years || !initial_amount) return NextResponse.json({ error: 'lifespan_years and initial_amount required' }, { status: 400 });

  const years = Math.min(Math.max(lifespan_years, 1), 50);
  const simCount = Math.min(Math.max(sim_count, 1000), 15000);

  // Compute portfolio weighted mean return and volatility
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0) || 1;
  const meanReturn = holdings.reduce((s, h) => {
    const r = h.year_return ?? 0.07;
    return s + (h.weight / totalWeight) * r;
  }, 0);
  const volatility = Math.sqrt(holdings.reduce((s, h) => {
    const vol = VOL_BY_TYPE[h.asset_type ?? 'etf'] ?? 0.15;
    const w = h.weight / totalWeight;
    return s + w * w * vol * vol;
  }, 0)) * 1.2; // 20% correlation bump for realism

  // Base Monte Carlo
  const base = runMonteCarlo(meanReturn, volatility, initial_amount, years, annual_withdrawal, simCount);

  // Historical stress scenarios (apply shocks on top of base returns)
  const scenarioResults = SCENARIOS.map(sc => {
    const yearData = runMonteCarlo(meanReturn, volatility, initial_amount, years, annual_withdrawal, Math.min(simCount, 5000), sc.shocks);
    const finalYear = yearData[years - 1];
    return {
      id: sc.id,
      label: sc.label,
      description: sc.description,
      floor: finalYear.p10,
      median: finalYear.p50,
      ceiling: finalYear.p90,
      year1_impact: yearData[0].p50,
    };
  });

  const finalYear = base[years - 1];

  return NextResponse.json({
    mean_return: Math.round(meanReturn * 10000) / 10000,
    volatility: Math.round(volatility * 10000) / 10000,
    years,
    initial_amount,
    floor: finalYear.p10,
    median: finalYear.p50,
    ceiling: finalYear.p90,
    yearly: base.map((y, i) => ({ year: i + 1, ...y })),
    scenarios: scenarioResults,
  });
}
