import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TickerRating } from '@/lib/types';

async function fetchRating(ticker: string): Promise<TickerRating> {
  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=financialData,ratingDetail`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    const json = await res.json() as any;
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return { ticker };

    const fd = result.financialData;
    const rd = result.ratingDetail?.result;

    return {
      ticker,
      morningstar_stars: rd?.morningStarOverallRating ?? undefined,
      morningstar_risk: rd?.morningStarRiskRating ?? undefined,
      analyst_rating: fd?.recommendationKey ?? undefined,
      analyst_count: fd?.numberOfAnalystOpinions?.raw ?? undefined,
      analyst_mean: fd?.recommendationMean?.raw ?? undefined,
    };
  } catch {
    return { ticker };
  }
}

// POST /api/ratings  body: { tickers: string[] }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tickers } = await req.json() as { tickers: string[] };
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return NextResponse.json({ ratings: [] });
  }

  const unique = [...new Set(tickers)].slice(0, 40);
  const ratings = await Promise.all(unique.map(fetchRating));
  return NextResponse.json({ ratings });
}
