import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ImportedHolding, HoldingHistoricalStats, OptimizationResult } from '@/lib/types';

// Mean-variance optimization: maximize return for given target, penalized by volatility
// Uses binary search on alpha (risk appetite scalar)
function optimizeWeights(
  items: { ticker: string; cagr: number; volatility: number }[],
  targetReturn: number,
  minWeight = 0.02,
): number[] {
  const n = items.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const returns = items.map(h => h.cagr);
  const vols = items.map(h => h.volatility);
  const rMean = returns.reduce((a, b) => a + b, 0) / n;
  const rRange = Math.max(...returns) - Math.min(...returns) || 1;

  // Sharpe-like score: higher return, lower vol = higher score
  const avgVol = vols.reduce((a, b) => a + b, 0) / n || 1;
  const scores = items.map(h => h.cagr / Math.max(h.volatility, avgVol * 0.3));
  const scoreMean = scores.reduce((a, b) => a + b, 0) / n;
  const scoreRange = Math.max(...scores) - Math.min(...scores) || 1;

  function computeWeights(alpha: number): number[] {
    // Blend return-based tilt with risk-adjusted score
    const raw = items.map((h, i) => {
      const returnTilt = 0.5 + alpha * (h.cagr - rMean) / rRange;
      const sharpeTilt = 0.5 + alpha * (scores[i] - scoreMean) / scoreRange;
      return Math.max(minWeight, (returnTilt + sharpeTilt) / 2);
    });
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map(w => w / total);
  }

  function weightedReturn(weights: number[]): number {
    return weights.reduce((sum, w, i) => sum + w * returns[i], 0);
  }

  let lo = -5, hi = 5;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (weightedReturn(computeWeights(mid)) < targetReturn) lo = mid;
    else hi = mid;
  }

  return computeWeights((lo + hi) / 2);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    holdings,
    historical_stats,
    target_return,
    available_cash = 0,
  } = body as {
    holdings: ImportedHolding[];
    historical_stats: HoldingHistoricalStats[];
    target_return: number;
    available_cash: number;
  };

  if (!holdings?.length) return NextResponse.json({ error: 'No holdings provided' }, { status: 400 });
  if (typeof target_return !== 'number') return NextResponse.json({ error: 'target_return required' }, { status: 400 });

  // Build optimization inputs — prefer CAGR from historical stats, fall back to year_return
  const statsMap = Object.fromEntries((historical_stats ?? []).map(s => [s.ticker, s]));

  const inputs = holdings.map(h => {
    const stat = statsMap[h.ticker];
    return {
      ticker: h.ticker,
      cagr: stat?.cagr ?? h.year_return ?? 0,
      volatility: stat?.volatility ?? 0.15,
    };
  });

  const weights = optimizeWeights(inputs, target_return);
  const blendedReturn = weights.reduce((sum, w, i) => sum + w * inputs[i].cagr, 0);

  const optimized: OptimizationResult[] = holdings.map((h, i) => {
    const stat = statsMap[h.ticker];
    const weight = weights[i] ?? 1 / holdings.length;
    const dollarAmount = available_cash > 0 ? available_cash * weight : 0;
    const price = h.price ?? 0;
    const sharesToBuy = price > 0 && dollarAmount > 0 ? Math.floor(dollarAmount / price) : 0;

    return {
      ticker: h.ticker,
      name: h.name || h.ticker,
      weight: Math.round(weight * 10000) / 10000,
      year_return: h.year_return ?? 0,
      cagr: stat?.cagr ?? h.year_return ?? 0,
      asset_type: h.asset_type ?? 'stock',
      price,
      dollar_amount: Math.round(dollarAmount * 100) / 100,
      shares_to_buy: sharesToBuy,
    };
  });

  // Sort by weight descending for display
  optimized.sort((a, b) => b.weight - a.weight);

  return NextResponse.json({
    optimized,
    weighted_return: Math.round(blendedReturn * 10000) / 10000,
    available_cash,
    total_allocated: Math.round(optimized.reduce((s, h) => s + h.dollar_amount, 0) * 100) / 100,
  });
}
