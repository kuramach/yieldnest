import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchYahooQuoteSummary } from '@/lib/yahoo-crumb';
import type { TickerRating } from '@/lib/types';

async function fetchLongTermReturn(ticker: string, range: '10y' | '20y'): Promise<number | undefined> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=${range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as any;
    const closes: number[] = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
    if (closes.length < 12) return undefined;
    const years = closes.length / 12;
    return Math.pow(closes[closes.length - 1] / closes[0], 1 / years) - 1;
  } catch { return undefined; }
}

async function fetchRating(ticker: string): Promise<TickerRating> {
  try {
    const [result, ret10, ret20] = await Promise.all([
      fetchYahooQuoteSummary(ticker, 'financialData,summaryDetail,defaultKeyStatistics'),
      fetchLongTermReturn(ticker, '10y'),
      fetchLongTermReturn(ticker, '20y'),
    ]);
    if (!result) return { ticker };
    const fd = result.financialData;
    const sd = result.summaryDetail;
    const ks = result.defaultKeyStatistics;
    return {
      ticker,
      analyst_rating: fd?.recommendationKey ?? undefined,
      analyst_count: fd?.numberOfAnalystOpinions?.raw ?? undefined,
      analyst_mean: fd?.recommendationMean?.raw ?? undefined,
      fund_category: ks?.category ?? undefined,
      fund_family: ks?.fundFamily ?? undefined,
      yield_rate: (ks?.yield?.raw ?? sd?.yield?.raw) ?? undefined,
      three_year_return: ks?.threeYearAverageReturn?.raw ?? undefined,
      five_year_return: ks?.fiveYearAverageReturn?.raw ?? undefined,
      ten_year_return: ret10,
      twenty_year_return: ret20,
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
  if (!Array.isArray(tickers) || tickers.length === 0) return NextResponse.json({ ratings: [] });

  const unique = [...new Set(tickers)].slice(0, 40);
  const ratings = await Promise.all(unique.map(fetchRating));
  return NextResponse.json({ ratings });
}
