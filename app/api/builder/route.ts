import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SuggestedPortfolio } from '@/lib/types';

type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

const CANDIDATE_POOLS: Record<RiskLevel, string[]> = {
  conservative: ['BND', 'VCSH', 'VGSH', 'TIP', 'AGG', 'SHY', 'SCHZ', 'VGIT'],
  moderate: ['VTI', 'VXUS', 'BND', 'VNQ', 'SCHD', 'QQQ', 'VIG', 'DGRO', 'IEFA', 'VEA'],
  aggressive: ['QQQ', 'VGT', 'SCHG', 'SMH', 'SOXX', 'ARKK', 'TQQQ', 'UPRO', 'SOXL'],
};

interface CandidateData {
  ticker: string;
  name: string;
  year_return: number;
  price: number;
  asset_type: 'stock' | 'etf' | 'bond';
}

interface WeightedCandidate extends CandidateData {
  weight: number;
}

const BOND_TICKERS = new Set(['BND', 'AGG', 'TIP', 'SHY', 'VCSH', 'VGSH', 'SCHZ', 'VGIT']);

async function fetchCandidateReturns(tickers: string[]): Promise<CandidateData[]> {
  const results = await Promise.allSettled(
    tickers.map(async (ticker): Promise<CandidateData> => {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price,defaultKeyStatistics`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const json = await res.json() as any;
      const result = json?.quoteSummary?.result?.[0];
      if (!result) throw new Error(`No data for ${ticker}`);

      const price = result.price;
      const stats = result.defaultKeyStatistics;
      const regularMarketPrice: number = price?.regularMarketPrice?.raw ?? price?.regularMarketPrice ?? 0;
      const yearReturn: number = stats?.['52WeekChange']?.raw ?? stats?.['52WeekChange'] ?? 0.05;
      const quoteType: string = (price?.quoteType ?? '').toUpperCase();

      let assetType: 'stock' | 'etf' | 'bond' = 'stock';
      if (quoteType === 'ETF' || quoteType === 'MUTUALFUND') assetType = 'etf';
      if (BOND_TICKERS.has(ticker)) assetType = 'bond';

      return {
        ticker,
        name: price?.longName || price?.shortName || ticker,
        year_return: yearReturn,
        price: regularMarketPrice,
        asset_type: assetType,
      };
    })
  );

  return results
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`Could not fetch ${tickers[i]}:`, (r as PromiseRejectedResult).reason);
      return null;
    })
    .filter((x): x is CandidateData => x !== null && x.price > 0);
}

/**
 * Greedy weighted-return optimizer.
 */
function buildPortfolio(
  candidates: CandidateData[],
  targetReturn: number,
  maxHoldings: number,
  preferHigh: boolean
): { holdings: WeightedCandidate[]; weighted_return: number } {
  const sorted = [...candidates].sort((a, b) =>
    preferHigh ? b.year_return - a.year_return : a.year_return - b.year_return
  );

  const selected: WeightedCandidate[] = [];
  let remainingTarget = targetReturn;
  let remainingWeight = 1.0;

  for (const candidate of sorted) {
    if (selected.length >= maxHoldings) break;
    if (remainingWeight <= 0.05) break;

    let idealWeight =
      candidate.year_return !== 0
        ? remainingTarget / candidate.year_return
        : remainingWeight;

    idealWeight = Math.min(idealWeight, remainingWeight, 0.6);
    idealWeight = Math.max(idealWeight, 0.05);

    if (selected.length === maxHoldings - 1) {
      idealWeight = remainingWeight;
    }

    selected.push({ ...candidate, weight: idealWeight });
    remainingTarget -= idealWeight * candidate.year_return;
    remainingWeight -= idealWeight;

    if (Math.abs(remainingTarget) < 0.005 && remainingWeight < 0.05) break;
  }

  const totalWeight = selected.reduce((sum, h) => sum + h.weight, 0);
  const normalized: WeightedCandidate[] = selected.map((h) => ({
    ...h,
    weight: totalWeight > 0 ? h.weight / totalWeight : 1 / selected.length,
  }));

  const weighted_return = normalized.reduce((sum, h) => sum + h.weight * h.year_return, 0);
  return { holdings: normalized, weighted_return };
}

function toPortfolioHolding(h: WeightedCandidate): SuggestedPortfolio['holdings'][0] {
  return {
    ticker: h.ticker,
    name: h.name,
    weight: h.weight,
    year_return: h.year_return,
    asset_type: h.asset_type,
    price: h.price,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    target_return?: number;
    amount?: number;
    lifespan_years?: number;
    risk?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { target_return = 0.07, risk = 'moderate' } = body;

  const riskLevel: RiskLevel =
    risk === 'conservative' || risk === 'aggressive' ? risk : 'moderate';

  const pool = CANDIDATE_POOLS[riskLevel];
  const candidates = await fetchCandidateReturns(pool);

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'Could not fetch market data' }, { status: 503 });
  }

  const portfolios: SuggestedPortfolio[] = [];

  // Option 1: Greedy high-return first
  const option1 = buildPortfolio(candidates, target_return, 4, true);
  portfolios.push({
    holdings: option1.holdings.map(toPortfolioHolding),
    weighted_return: option1.weighted_return,
    risk_label:
      riskLevel === 'conservative' ? 'Core Conservative' :
      riskLevel === 'aggressive' ? 'High Growth' : 'Growth-Tilted',
    description: 'Optimized for return with concentrated top performers',
  });

  // Option 2: Diversified equal-weight
  const shuffled = [...candidates]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, candidates.length));
  const equalWeight = 1 / shuffled.length;
  const option2Holdings: WeightedCandidate[] = shuffled.map((c) => ({ ...c, weight: equalWeight }));
  const wr2 = option2Holdings.reduce((sum, h) => sum + h.weight * h.year_return, 0);
  portfolios.push({
    holdings: option2Holdings.map(toPortfolioHolding),
    weighted_return: wr2,
    risk_label: 'Diversified',
    description: 'Broad diversification across multiple ETFs for lower concentration risk',
  });

  // Option 3: Target-precision blend
  const option3 = buildPortfolio(candidates, target_return, 3, false);
  const blended: WeightedCandidate[] = [
    ...option1.holdings.slice(0, 2),
    ...option3.holdings.slice(0, 2),
  ];
  const seen = new Set<string>();
  const deduped: WeightedCandidate[] = blended.filter((h) => {
    if (seen.has(h.ticker)) return false;
    seen.add(h.ticker);
    return true;
  });
  const totalW = deduped.reduce((s, h) => s + h.weight, 0);
  const renormed: WeightedCandidate[] = deduped.map((h) => ({
    ...h,
    weight: totalW > 0 ? h.weight / totalW : 1 / deduped.length,
  }));
  const wr3 = renormed.reduce((sum, h) => sum + h.weight * h.year_return, 0);

  portfolios.push({
    holdings: renormed.map(toPortfolioHolding),
    weighted_return: wr3,
    risk_label: 'Target-Precision',
    description: `Blend engineered to approach your ${(target_return * 100).toFixed(0)}% target`,
  });

  return NextResponse.json({ target_return, risk: riskLevel, portfolios });
}
