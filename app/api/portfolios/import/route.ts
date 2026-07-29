import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ImportedHolding } from '@/lib/types';

// Parse XLSX file and extract holdings
async function parseXlsx(buffer: Buffer): Promise<ImportedHolding[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const holdings: ImportedHolding[] = [];

  for (const row of rows) {
    const keys = Object.keys(row).map(k => k.toLowerCase());

    const tickerKey = Object.keys(row).find(k =>
      ['symbol', 'ticker', 'security', 'stock'].includes(k.toLowerCase())
    );
    const sharesKey = Object.keys(row).find(k =>
      ['shares', 'quantity', 'qty', 'units'].includes(k.toLowerCase())
    );
    const valueKey = Object.keys(row).find(k =>
      ['value', 'market value', 'current value', 'amount'].includes(k.toLowerCase())
    );

    if (!tickerKey) continue;

    const rawTicker = String(row[tickerKey] ?? '').trim().toUpperCase();
    if (!rawTicker || rawTicker.length > 6 || !/^[A-Z.^-]+$/.test(rawTicker)) continue;

    const shares = sharesKey ? parseFloat(String(row[sharesKey]).replace(/,/g, '')) : 0;
    const value = valueKey ? parseFloat(String(row[valueKey]).replace(/[$,]/g, '')) : undefined;

    holdings.push({
      ticker: rawTicker,
      shares: isNaN(shares) ? 0 : shares,
      value: value && !isNaN(value) ? value : undefined,
    });
  }

  return holdings;
}

// Parse PDF text and extract ticker/share rows
async function parsePdf(buffer: Buffer): Promise<ImportedHolding[]> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const text = data.text;

  const holdings: ImportedHolding[] = [];
  const seen = new Set<string>();

  // Match patterns like: AAPL 100 $15,000 or AAPL Apple Inc. 100
  const lines = text.split('\n');
  for (const line of lines) {
    const tickerMatch = line.match(/\b([A-Z]{1,5})\b/g);
    if (!tickerMatch) continue;

    for (const ticker of tickerMatch) {
      if (seen.has(ticker)) continue;
      // Skip common non-ticker words
      if (['USD', 'ETF', 'INC', 'LLC', 'THE', 'FOR', 'AND', 'NEW', 'ALL', 'ADR', 'TOT', 'NET'].includes(ticker)) continue;
      if (ticker.length < 1 || ticker.length > 5) continue;

      // Find a number near the ticker (shares)
      const numMatches = line.match(/[\d,]+(?:\.\d+)?/g);
      const shares = numMatches
        ? parseFloat(numMatches[0].replace(/,/g, ''))
        : 0;

      const valueMatch = line.match(/\$[\d,]+(?:\.\d+)?/);
      const value = valueMatch
        ? parseFloat(valueMatch[0].replace(/[$,]/g, ''))
        : undefined;

      if (shares > 0 || value) {
        seen.add(ticker);
        holdings.push({ ticker, shares: isNaN(shares) ? 0 : shares, value });
      }
    }
  }

  return holdings;
}

// Fetch Yahoo Finance quotes for multiple tickers
async function fetchQuotes(tickers: string[], baseUrl: string) {
  if (tickers.length === 0) return [];
  const url = `${baseUrl}/api/securities/quote?tickers=${tickers.join(',')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name.toLowerCase();

  let holdings: ImportedHolding[] = [];
  try {
    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      holdings = await parseXlsx(buffer);
    } else if (filename.endsWith('.pdf')) {
      holdings = await parsePdf(buffer);
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Please upload .xlsx or .pdf' }, { status: 400 });
    }
  } catch (err) {
    console.error('Parse error:', err);
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 400 });
  }

  if (holdings.length === 0) {
    return NextResponse.json({ error: 'No holdings found in file. Make sure your file has Symbol/Ticker and Shares/Quantity columns.' }, { status: 400 });
  }

  // Fetch quotes for all tickers
  const origin = request.headers.get('origin') || `https://${request.headers.get('host')}`;
  const uniqueTickers = [...new Set(holdings.map(h => h.ticker))].slice(0, 30);

  // Call the existing quote endpoint directly
  const yahooFinance = (await import('yahoo-finance2')).default;
  const quoteMap: Record<string, { price: number; year_return?: number; name?: string; asset_type?: 'stock' | 'etf' | 'bond' }> = {};

  await Promise.allSettled(
    uniqueTickers.map(async (ticker) => {
      try {
        const summary = await yahooFinance.quoteSummary(ticker, {
          modules: ['price', 'defaultKeyStatistics'],
        });
        const price = (summary as any).price;
        const stats = (summary as any).defaultKeyStatistics;
        const yearReturn = stats?.['52WeekChange'];
        const quoteType = price?.quoteType?.toUpperCase();
        const assetType: 'stock' | 'etf' | 'bond' =
          quoteType === 'ETF' || quoteType === 'MUTUALFUND' ? 'etf'
          : quoteType === 'BOND' ? 'bond'
          : 'stock';

        quoteMap[ticker] = {
          price: price?.regularMarketPrice ?? 0,
          year_return: typeof yearReturn === 'number' ? yearReturn : undefined,
          name: price?.longName || price?.shortName || ticker,
          asset_type: assetType,
        };
      } catch {
        quoteMap[ticker] = { price: 0 };
      }
    })
  );

  // Enrich holdings with quote data
  const enriched: ImportedHolding[] = holdings.map(h => {
    const q = quoteMap[h.ticker];
    const price = q?.price ?? 0;
    return {
      ...h,
      price,
      name: q?.name || h.ticker,
      year_return: q?.year_return,
      asset_type: q?.asset_type ?? 'stock',
      value: h.value ?? (price > 0 && h.shares > 0 ? price * h.shares : undefined),
    };
  });

  return NextResponse.json({ holdings: enriched });
}
