import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { createClient } from '@/lib/supabase/server';
import type { YFQuoteSummary } from '@/lib/yahoo-types';
import type { SecurityQuote } from '@/lib/types';

function inferAssetType(quoteType: string | undefined, symbol: string): 'stock' | 'etf' | 'bond' {
  if (!quoteType) return 'stock';
  const qt = quoteType.toUpperCase();
  if (qt === 'ETF' || qt === 'MUTUALFUND') return 'etf';
  const bondTickers = ['BND', 'AGG', 'TIP', 'SHY', 'VCSH', 'VGSH', 'SCHZ', 'VGIT'];
  if (qt === 'BOND' || bondTickers.includes(symbol.toUpperCase())) return 'bond';
  return 'stock';
}

async function fetchTwelveDataReturn(ticker: string): Promise<{ year_return?: number; five_year_return?: number }> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey === 'your_twelve_data_key') return {};

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1week&outputsize=52&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json() as { status?: string; values?: { close: string }[] };

    if (data.status === 'error' || !data.values || data.values.length < 2) return {};

    const values = data.values;
    const latest = parseFloat(values[0].close);
    const yearAgo = parseFloat(values[Math.min(51, values.length - 1)].close);
    const year_return = yearAgo > 0 ? (latest - yearAgo) / yearAgo : undefined;

    const url5y = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1week&outputsize=260&apikey=${apiKey}`;
    const res5y = await fetch(url5y, { next: { revalidate: 86400 } });
    const data5y = await res5y.json() as { values?: { close: string }[] };
    let five_year_return: number | undefined;

    if (data5y.values && data5y.values.length >= 52) {
      const v5 = data5y.values;
      const latestP = parseFloat(v5[0].close);
      const fiveYearAgo = parseFloat(v5[Math.min(259, v5.length - 1)].close);
      five_year_return = fiveYearAgo > 0 ? (latestP - fiveYearAgo) / fiveYearAgo : undefined;
    }

    return { year_return, five_year_return };
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tickersParam = request.nextUrl.searchParams.get('tickers');
  if (!tickersParam) {
    return NextResponse.json({ error: 'tickers parameter required' }, { status: 400 });
  }

  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  const results = await Promise.allSettled(
    tickers.map(async (ticker): Promise<SecurityQuote> => {
      const [rawSummary, tdReturns] = await Promise.all([
        yahooFinance.quoteSummary(ticker, {
          modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'assetProfile'],
        }),
        fetchTwelveDataReturn(ticker),
      ]);

      const summary = rawSummary as unknown as YFQuoteSummary;
      const price = summary.price;
      const detail = summary.summaryDetail;
      const stats = summary.defaultKeyStatistics;
      const profile = summary.assetProfile;

      const quoteType = price?.quoteType ?? undefined;
      const assetType = inferAssetType(quoteType, ticker);

      const yahooYearReturn = stats?.['52WeekChange'];

      return {
        ticker,
        name: price?.longName || price?.shortName || ticker,
        price: price?.regularMarketPrice ?? 0,
        change_pct: price?.regularMarketChangePercent ?? 0,
        year_return: tdReturns.year_return ?? (typeof yahooYearReturn === 'number' ? yahooYearReturn : undefined),
        five_year_return: tdReturns.five_year_return,
        dividend_yield: detail?.dividendYield ?? undefined,
        asset_type: assetType,
        sector: profile?.sector ?? undefined,
      };
    })
  );

  const quotes: SecurityQuote[] = results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.error(`Failed to fetch quote for ${tickers[i]}:`, result.reason);
    return {
      ticker: tickers[i],
      name: tickers[i],
      price: 0,
      change_pct: 0,
      asset_type: 'stock' as const,
    };
  });

  return NextResponse.json(quotes);
}
