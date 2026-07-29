import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ImportedHolding } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractHoldingsWithClaude(rows: Record<string, unknown>[]): Promise<ImportedHolding[]> {
  const preview = JSON.stringify(rows.slice(0, 50), null, 2);

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are parsing a brokerage portfolio export. Extract all stock/ETF/fund holdings from this data.

Return ONLY a JSON array with no explanation. Each item must have:
- ticker: string (stock symbol, e.g. "AAPL")
- shares: number (quantity held, 0 if not found)
- value: number or null (market value in USD, null if not found)

Skip rows that are cash, money market, totals, headers, or blank.
Skip anything that isn't a real security with a ticker symbol.

Data:
${preview}

Return only the JSON array, nothing else.`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
  const json = text.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');

  const parsed = JSON.parse(json);
  return (parsed as any[])
    .filter(h => h.ticker && typeof h.ticker === 'string')
    .map(h => ({
      ticker: String(h.ticker).trim().toUpperCase(),
      shares: Number(h.shares) || 0,
      value: h.value != null ? Number(h.value) : undefined,
    }))
    .filter(h => /^[A-Z0-9.^-]{1,6}$/.test(h.ticker));
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

  if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls') && !filename.endsWith('.csv')) {
    return NextResponse.json({ error: 'Please upload an Excel file (.xlsx, .xls) or CSV.' }, { status: 400 });
  }

  // Parse Excel to raw rows
  let rows: Record<string, unknown>[] = [];
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  } catch (err) {
    console.error('Excel parse error:', err);
    return NextResponse.json({ error: 'Failed to read file. Make sure it is a valid Excel file.' }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });
  }

  // Let Claude extract holdings regardless of column naming
  let holdings: ImportedHolding[] = [];
  try {
    holdings = await extractHoldingsWithClaude(rows);
  } catch (err) {
    console.error('Claude extraction error:', err);
    return NextResponse.json({ error: 'Failed to parse holdings from file.' }, { status: 400 });
  }

  if (holdings.length === 0) {
    return NextResponse.json({ error: 'No holdings found in file.' }, { status: 400 });
  }

  // Fetch live prices from Yahoo Finance
  const uniqueTickers = [...new Set(holdings.map(h => h.ticker))].slice(0, 30);
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
        quoteMap[ticker] = {
          price: price?.regularMarketPrice ?? 0,
          year_return: typeof yearReturn === 'number' ? yearReturn : undefined,
          name: price?.longName || price?.shortName || ticker,
          asset_type: quoteType === 'ETF' || quoteType === 'MUTUALFUND' ? 'etf'
            : quoteType === 'BOND' ? 'bond' : 'stock',
        };
      } catch {
        quoteMap[ticker] = { price: 0 };
      }
    })
  );

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
