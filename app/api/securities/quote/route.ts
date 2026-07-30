import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SecurityQuote } from '@/lib/types';

const BOND_TICKERS = new Set(['BND', 'AGG', 'TIP', 'TIPS', 'SHY', 'IEF', 'TLT', 'VCSH', 'VGSH', 'LQD', 'SCHZ', 'VGIT']);

function inferAssetType(instrumentType: string | undefined, symbol: string): 'stock' | 'etf' | 'bond' {
  const qt = (instrumentType ?? '').toUpperCase();
  if (qt === 'ETF' || qt === 'MUTUALFUND') return 'etf';
  if (qt === 'BOND' || BOND_TICKERS.has(symbol.toUpperCase())) return 'bond';
  return 'stock';
}

async function fetchQuote(ticker: string): Promise<SecurityQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json = await res.json() as any;
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;

  if (!meta) throw new Error(`No data for ${ticker}`);

  const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
  const year_return = closes.length >= 2
    ? (closes[closes.length - 1] - closes[0]) / closes[0]
    : undefined;

  return {
    ticker,
    name: meta.longName || meta.shortName || ticker,
    price: meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0,
    change_pct: 0,
    year_return,
    asset_type: inferAssetType(meta.instrumentType, ticker),
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tickersParam = request.nextUrl.searchParams.get('tickers');
  if (!tickersParam) return NextResponse.json({ error: 'tickers parameter required' }, { status: 400 });

  const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  const results = await Promise.allSettled(tickers.map(fetchQuote));

  const quotes: SecurityQuote[] = results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return { ticker: tickers[i], name: tickers[i], price: 0, change_pct: 0, asset_type: 'stock' as const };
  });

  return NextResponse.json(quotes);
}
