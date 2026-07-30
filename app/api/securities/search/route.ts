import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SecurityQuote } from '@/lib/types';

const BOND_TICKERS = new Set(['BND', 'AGG', 'TIP', 'TIPS', 'SHY', 'IEF', 'TLT', 'VCSH', 'VGSH', 'LQD', 'SCHZ', 'VGIT']);

function inferAssetType(quoteType: string | undefined, symbol: string): 'stock' | 'etf' | 'bond' {
  const qt = (quoteType ?? '').toUpperCase();
  if (qt === 'ETF' || qt === 'MUTUALFUND') return 'etf';
  if (qt === 'BOND' || BOND_TICKERS.has(symbol.toUpperCase())) return 'bond';
  return 'stock';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 1) return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });

  try {
    // Yahoo Finance search endpoint (no cookie needed)
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&lang=en-US`;
    const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const searchJson = await searchRes.json() as any;

    const rawQuotes = (searchJson?.finance?.result?.[0]?.quotes ?? searchJson?.quotes ?? []) as any[];
    const filtered = rawQuotes
      .filter(r => r.symbol && (r.quoteType === 'EQUITY' || r.quoteType === 'ETF' || r.quoteType === 'MUTUALFUND'))
      .slice(0, 8);

    if (filtered.length === 0) return NextResponse.json([]);

    // Enrich with live prices via v8 chart API
    const enriched = await Promise.allSettled(
      filtered.map(async (r): Promise<SecurityQuote> => {
        try {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(r.symbol)}?interval=1d&range=1y`;
          const chartRes = await fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const chartJson = await chartRes.json() as any;
          const meta = chartJson?.chart?.result?.[0]?.meta;
          const closes: number[] = (chartJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
          const year_return = closes.length >= 2 ? (closes[closes.length - 1] - closes[0]) / closes[0] : undefined;

          return {
            ticker: r.symbol,
            name: meta?.longName || meta?.shortName || r.longname || r.shortname || r.symbol,
            price: meta?.regularMarketPrice ?? 0,
            change_pct: 0,
            year_return,
            asset_type: inferAssetType(r.quoteType, r.symbol),
          };
        } catch {
          return {
            ticker: r.symbol,
            name: r.longname || r.shortname || r.symbol,
            price: 0,
            change_pct: 0,
            asset_type: inferAssetType(r.quoteType, r.symbol),
          };
        }
      })
    );

    const quotes: SecurityQuote[] = enriched.map(result =>
      result.status === 'fulfilled' ? result.value : null
    ).filter(Boolean) as SecurityQuote[];

    return NextResponse.json(quotes);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to search securities' }, { status: 500 });
  }
}
