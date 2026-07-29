import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ImportedHolding, OptimizationResult } from '@/lib/types';

function optimizeWeights(
  holdings: (ImportedHolding & { year_return: number })[],
  targetReturn: number,
  minWeight = 0.02,
): OptimizationResult[] {
  const n = holdings.length;
  if (n === 0) return [];

  const returns = holdings.map(h => h.year_return);
  const rMean = returns.reduce((a, b) => a + b, 0) / n;
  const rRange = Math.max(...returns) - Math.min(...returns);

  function computeWeights(alpha: number): number[] {
    if (rRange === 0) return holdings.map(() => 1 / n);
    const raw = returns.map(r => Math.max(minWeight, 0.5 + alpha * (r - rMean) / rRange));
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map(w => w / total);
  }

  function weightedReturn(weights: number[]): number {
    return weights.reduce((sum, w, i) => sum + w * returns[i], 0);
  }

  // Binary search alpha to hit targetReturn
  let lo = -5, hi = 5;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const wr = weightedReturn(computeWeights(mid));
    if (wr < targetReturn) lo = mid;
    else hi = mid;
  }

  const finalWeights = computeWeights((lo + hi) / 2);

  return holdings.map((h, i) => ({
    ticker: h.ticker,
    name: h.name || h.ticker,
    weight: Math.round(finalWeights[i] * 10000) / 10000,
    year_return: h.year_return,
    asset_type: h.asset_type ?? 'stock',
    price: h.price ?? 0,
  }));
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { holdings, target_return } = body as {
    holdings: ImportedHolding[];
    target_return: number;
  };

  if (!holdings?.length) {
    return NextResponse.json({ error: 'No holdings provided' }, { status: 400 });
  }
  if (typeof target_return !== 'number' || target_return < 0 || target_return > 1) {
    return NextResponse.json({ error: 'target_return must be between 0 and 1' }, { status: 400 });
  }

  // Filter to holdings that have year_return
  const withReturns = holdings.filter(h => typeof h.year_return === 'number') as (ImportedHolding & { year_return: number })[];

  if (withReturns.length === 0) {
    // Fall back to equal weight
    const equal = holdings.map(h => ({
      ticker: h.ticker,
      name: h.name || h.ticker,
      weight: Math.round(10000 / holdings.length) / 10000,
      year_return: 0,
      asset_type: h.asset_type ?? 'stock' as const,
      price: h.price ?? 0,
    }));
    return NextResponse.json({ optimized: equal, weighted_return: 0, note: 'No return data — using equal weights' });
  }

  const optimized = optimizeWeights(withReturns, target_return);
  const weightedReturn = optimized.reduce((sum, h) => sum + h.weight * h.year_return, 0);

  return NextResponse.json({
    optimized,
    weighted_return: Math.round(weightedReturn * 10000) / 10000,
  });
}
