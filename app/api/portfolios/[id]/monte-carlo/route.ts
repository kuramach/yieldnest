import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PCT_LEVELS = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95];

function randNormal(mean: number, std: number): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function runSimulation(
  meanReturn: number,
  volatility: number,
  initialValue: number,
  years: number,
  annualWithdrawal: number,
  simCount: number,
) {
  const yearData: number[][] = Array.from({ length: years }, () => []);

  for (let s = 0; s < simCount; s++) {
    let value = initialValue;
    for (let y = 0; y < years; y++) {
      const r = randNormal(meanReturn, volatility);
      value = value * (1 + r) - annualWithdrawal;
      const clamped = Math.max(value, 0);
      yearData[y].push(clamped);
      if (value <= 0) {
        for (let rem = y + 1; rem < years; rem++) yearData[rem].push(0);
        break;
      }
    }
  }

  const percentiles: number[][] = yearData.map(vals => {
    const sorted = [...vals].sort((a, b) => a - b);
    return PCT_LEVELS.map(pct => sorted[Math.min(Math.floor(pct * simCount), simCount - 1)]);
  });

  const finalValues = [...yearData[years - 1]].sort((a, b) => a - b);
  const probRuin = finalValues.filter(v => v <= 0).length / simCount;
  const probGrowth = finalValues.filter(v => v > initialValue).length / simCount;
  const median = finalValues[Math.floor(simCount * 0.5)];
  const p10 = finalValues[Math.floor(simCount * 0.10)];
  const p90 = finalValues[Math.floor(simCount * 0.90)];

  return { percentiles, finalValues, probGrowth, probRuin, median, p10, p90 };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const meanReturn: number = body.meanReturn ?? 0.07;
  const volatility: number = body.volatility ?? 0.12;
  const initialValue: number = body.initialValue ?? 100000;
  const years: number = Math.min(Math.max(body.years ?? 20, 1), 50);
  const annualWithdrawal: number = body.annualWithdrawal ?? 0;
  const simCount: number = Math.min(body.simCount ?? 1000, 20000);

  const result = runSimulation(meanReturn, volatility, initialValue, years, annualWithdrawal, simCount);
  return NextResponse.json(result);
}
