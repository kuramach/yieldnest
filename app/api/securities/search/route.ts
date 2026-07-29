import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';
import { createClient } from '@/lib/supabase/server';
import type { YFQuoteSummary, YFSearchResult } from '@/lib/yahoo-types';
import type { SecurityQuote } from '@/lib/types';

function inferAssetType(quoteType: string | undefined, symbol: string): 'stock' | 'etf' | 'bond' {
  if (!quoteType) return 'stock';
  const qt = quoteType.toUpperCase();
  if (qt === 'ETF' || qt === 'MUTUALFUND') return 'etf';
  const bondTickers = ['BND', 'AGG', 'TIP', 'TIPS', 'SHY', 'IEF', 'TLT', 'VCSH', 'VGSH', 'LQD'];
  if (qt === 'BOND' || bondTickers.some((b) => symbol.toUpperCase() === b)) return 'bond';
  return 'stock';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 1) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  try {
    const rawSearch = await yahooFinance.search(q.trim(), {
      newsCount: 0,
      quotesCount: 10,
    });
    const searchResults = rawSearch as unknown as YFSearchResult;

    const rawQuotes = searchResults.quotes || [];
    const filtered = rawQuotes.filter((r) =>
      r.symbol &&
      (r.quoteType === 'EQUITY' || r.quoteType === 'ETF' || r.quoteType === 'MUTUALFUND')
    ).slice(0, 8);

    const quotes: SecurityQuote[] = filtered.map((r) => ({
      ticker: r.symbol,
      name: r.longname || r.shortname || r.symbol,
      price: 0,
      change_pct: 0,
      asset_type: inferAssetType(r.quoteType, r.symbol),
    }));

    // Enrich with live quotes
    if (quotes.length > 0) {
      const enriched = await Promise.allSettled(
        quotes.map((q) =>
          yahooFinance.quoteSummary(q.ticker, {
            modules: ['price', 'summaryDetail', 'defaultKeyStatistics'],
          })
        )
      );

      enriched.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const summary = result.value as unknown as YFQuoteSummary;
          const price = summary.price;
          const detail = summary.summaryDetail;
          const stats = summary.defaultKeyStatistics;

          if (price) {
            quotes[i].price = price.regularMarketPrice ?? 0;
            quotes[i].change_pct = price.regularMarketChangePercent ?? 0;
            quotes[i].name = price.longName || price.shortName || quotes[i].name;
          }
          if (detail) {
            quotes[i].dividend_yield = detail.dividendYield ?? undefined;
          }
          if (stats) {
            const weekChange = stats['52WeekChange'];
            quotes[i].year_return = typeof weekChange === 'number' ? weekChange : undefined;
          }
        }
      });
    }

    return NextResponse.json(quotes);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to search securities' }, { status: 500 });
  }
}
