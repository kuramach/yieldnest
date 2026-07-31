const BOND_TICKERS = new Set(['BND', 'AGG', 'TIP', 'TIPS', 'SHY', 'IEF', 'TLT', 'VCSH', 'VGSH', 'LQD', 'SCHZ', 'VGIT']);

export interface QuoteData {
  ticker: string;
  name: string;
  price: number;
  year_return?: number;
  asset_type: 'stock' | 'etf' | 'bond';
}

export async function fetchQuote(ticker: string): Promise<QuoteData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    next: { revalidate: 300 },
  });
  const json = await res.json() as any;
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return { ticker, name: ticker, price: 0, asset_type: 'stock' };

  const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
  const year_return = closes.length >= 2 ? (closes[closes.length - 1] - closes[0]) / closes[0] : undefined;
  const instrumentType = (meta.instrumentType ?? '').toUpperCase();

  let asset_type: 'stock' | 'etf' | 'bond' = 'stock';
  if (instrumentType === 'ETF' || instrumentType === 'MUTUALFUND') asset_type = 'etf';
  if (BOND_TICKERS.has(ticker)) asset_type = 'bond';

  return {
    ticker,
    name: meta.longName || meta.shortName || ticker,
    price: meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0,
    year_return,
    asset_type,
  };
}

export async function fetchQuotes(tickers: string[]): Promise<Record<string, QuoteData>> {
  const results = await Promise.allSettled(tickers.map(fetchQuote));
  const map: Record<string, QuoteData> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.price > 0) map[tickers[i]] = r.value;
  });
  return map;
}
