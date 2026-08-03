import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

async function fetchYearReturn(ticker: string): Promise<number | undefined> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    const json = await res.json() as any;
    const closes: number[] = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
    if (closes.length < 2) return undefined;
    return (closes[closes.length - 1] - closes[0]) / closes[0];
  } catch { return undefined; }
}

// POST /api/portfolios/[id]/sync-360r
// Computes weighted return across all buckets and pushes to 360R assumptions.real_return
export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Fetch portfolio (must own it)
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .single();

  if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
  if (!portfolio.linked_360r_scenario_id)
    return NextResponse.json({ error: 'Portfolio is not linked to a 360R scenario' }, { status: 400 });

  // Fetch all buckets with holdings
  const { data: buckets } = await supabase
    .from('buckets')
    .select('id, initial_amount, target_return')
    .eq('portfolio_id', portfolioId);

  if (!buckets?.length)
    return NextResponse.json({ error: 'Portfolio has no buckets' }, { status: 400 });

  const bucketIds = buckets.map(b => b.id);

  const { data: holdings } = await supabase
    .from('bucket_holdings')
    .select('bucket_id, ticker, weight')
    .in('bucket_id', bucketIds);

  if (!holdings?.length)
    return NextResponse.json({ error: 'No holdings found — add holdings to buckets first' }, { status: 400 });

  // Fetch live year_returns for all unique tickers in parallel
  const uniqueTickers = [...new Set(holdings.map(h => h.ticker))];
  const returnEntries = await Promise.all(
    uniqueTickers.map(async (ticker) => [ticker, await fetchYearReturn(ticker)] as [string, number | undefined])
  );
  const returnMap = Object.fromEntries(returnEntries);

  // Compute weighted return per bucket, then weighted across buckets by initial_amount
  const totalAmount = buckets.reduce((s, b) => s + (b.initial_amount || 0), 0);

  let portfolioReturn = 0;
  const bucketBreakdown: { bucket_id: number; initial_amount: number; weighted_return: number }[] = [];

  for (const bucket of buckets) {
    const bucketHoldings = holdings.filter(h => h.bucket_id === bucket.id);
    const bucketReturn = bucketHoldings.reduce((s, h) => {
      const yr = returnMap[h.ticker] ?? 0;
      return s + h.weight * yr;
    }, 0);

    bucketBreakdown.push({ bucket_id: bucket.id, initial_amount: bucket.initial_amount, weighted_return: bucketReturn });

    const weight = totalAmount > 0 ? (bucket.initial_amount || 0) / totalAmount : 1 / buckets.length;
    portfolioReturn += weight * bucketReturn;
  }

  // Push to 360R assumptions table (same Supabase project)
  const { data: assumption, error: aError } = await supabase
    .from('assumptions')
    .update({ real_return: portfolioReturn })
    .eq('scenario_id', portfolio.linked_360r_scenario_id)
    .select('id, real_return')
    .single();

  if (aError) {
    return NextResponse.json(
      { error: `Failed to update 360R: ${aError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    portfolio_return: portfolioReturn,
    scenario_id: portfolio.linked_360r_scenario_id,
    assumption_id: assumption?.id,
    bucket_breakdown: bucketBreakdown,
    tickers_fetched: uniqueTickers.length,
  });
}
