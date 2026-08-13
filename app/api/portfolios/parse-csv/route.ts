import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  // Strip UTF-8 BOM if present
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.trim().split(/\r?\n/);
  for (const line of lines) {
    const cols: string[] = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim()); cur = '';
      } else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function findHeaderRow(rows: string[][]): { idx: number; headers: string[] } | null {
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(h => h.toLowerCase().replace(/[\s"]/g, ''));
    if (lower.includes('symbol') || lower.includes('ticker')) return { idx: i, headers: lower };
  }
  return null;
}

function detectBroker(headers: string[]): 'schwab' | 'fidelity' | 'unknown' {
  if (headers.some(h => h.includes('marketvalue') || h.includes('costbasis'))) return 'schwab';
  if (headers.some(h => h.includes('currentvalue') || h.includes('costbasistotal'))) return 'fidelity';
  return 'unknown';
}

function col(row: string[], headers: string[], ...names: string[]): string {
  for (const n of names) {
    const idx = headers.indexOf(n);
    if (idx !== -1 && row[idx] !== undefined) return row[idx].replace(/[$,%]/g, '').trim();
  }
  return '';
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export interface ParsedCsvHolding {
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  market_value: number;
  cost_basis: number;
  gain_loss: number;
  gain_loss_pct: number;
  asset_type: 'stock' | 'etf' | 'bond';
  weight: number;
}

function parseSchwab(rows: string[][], headerIdx: number, headers: string[]): Omit<ParsedCsvHolding, 'weight'>[] {
  const result: Omit<ParsedCsvHolding, 'weight'>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    const ticker = col(row, headers, 'symbol');
    if (!ticker || ticker === 'Account Total' || ticker === '--' || ticker === 'Cash & Cash Investments') continue;
    const qty = parseNum(col(row, headers, 'quantity'));
    if (!qty) continue;
    const price = parseNum(col(row, headers, 'price'));
    const marketValue = parseNum(col(row, headers, 'marketvalue'));
    const costBasis = parseNum(col(row, headers, 'costbasis'));
    const gainLoss = parseNum(col(row, headers, 'gain/loss$', 'gainloss$', 'gain/loss'));
    const gainLossPct = parseNum(col(row, headers, 'gain/loss%', 'gainloss%'));
    const description = col(row, headers, 'description') || '';
    const asset_type: 'stock' | 'etf' | 'bond' = description.toLowerCase().includes('etf') ? 'etf'
      : description.toLowerCase().includes('bond') ? 'bond' : 'stock';
    result.push({ ticker: ticker.toUpperCase(), name: description, quantity: qty, price, market_value: marketValue, cost_basis: costBasis, gain_loss: gainLoss, gain_loss_pct: gainLossPct, asset_type });
  }
  return result;
}

function parseFidelity(rows: string[][], headerIdx: number, headers: string[]): Omit<ParsedCsvHolding, 'weight'>[] {
  const result: Omit<ParsedCsvHolding, 'weight'>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue;
    const ticker = col(row, headers, 'symbol', 'ticker');
    if (!ticker || ticker.startsWith('Account') || ticker === 'Pending Activity') continue;
    const qty = parseNum(col(row, headers, 'quantity'));
    if (!qty) continue;
    const price = parseNum(col(row, headers, 'lastprice', 'price'));
    const marketValue = parseNum(col(row, headers, 'currentvalue', 'lastvalue'));
    const costBasis = parseNum(col(row, headers, 'costbasistotal', 'costbasis'));
    const gainLoss = parseNum(col(row, headers, 'totalgain/loss$', 'gain/loss$'));
    const gainLossPct = parseNum(col(row, headers, 'totalgain/loss%', 'gain/loss%'));
    const description = col(row, headers, 'description') || '';
    const asset_type: 'stock' | 'etf' | 'bond' = description.toLowerCase().includes('etf') ? 'etf'
      : description.toLowerCase().includes('bond') ? 'bond' : 'stock';
    result.push({ ticker: ticker.toUpperCase(), name: description, quantity: qty, price, market_value: marketValue, cost_basis: costBasis, gain_loss: gainLoss, gain_loss_pct: gainLossPct, asset_type });
  }
  return result;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);
  const header = findHeaderRow(rows);
  if (!header) return NextResponse.json({ error: 'Could not find header row (expected Symbol/Ticker column)' }, { status: 422 });

  const broker = detectBroker(header.headers);
  const parsed = broker === 'fidelity'
    ? parseFidelity(rows, header.idx, header.headers)
    : parseSchwab(rows, header.idx, header.headers);

  if (!parsed.length) return NextResponse.json({
    error: 'No valid rows found in CSV',
    debug: {
      broker,
      header_idx: header.idx,
      headers: header.headers,
      total_rows: rows.length,
      rows_after_header: rows.slice(header.idx + 1, header.idx + 6).map(r => r.slice(0, 6)),
    },
  }, { status: 422 });

  const totalMarketValue = parsed.reduce((s, r) => s + r.market_value, 0);
  const holdings: ParsedCsvHolding[] = parsed.map(r => ({
    ...r,
    weight: totalMarketValue > 0 ? r.market_value / totalMarketValue : 1 / parsed.length,
  }));

  return NextResponse.json({ broker, holdings, total_market_value: totalMarketValue });
}
