import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CsvHoldingRow } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// ── CSV parsers ─────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    const cols: string[] = [];
    let inQuote = false;
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function findHeaderRow(rows: string[][]): { idx: number; headers: string[] } | null {
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(h => h.toLowerCase().replace(/[\s"]/g, ''));
    if (lower.includes('symbol') || lower.includes('ticker')) {
      return { idx: i, headers: lower };
    }
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

function parseSchwab(rows: string[][], headerIdx: number, headers: string[]): CsvHoldingRow[] {
  const result: CsvHoldingRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) break;
    const ticker = col(row, headers, 'symbol');
    if (!ticker || ticker === 'Account Total' || ticker === '--') continue;
    const qty = parseNum(col(row, headers, 'quantity'));
    const costBasis = parseNum(col(row, headers, 'costbasis'));
    const mktValue = parseNum(col(row, headers, 'marketvalue'));
    if (!qty) continue;
    result.push({ ticker: ticker.toUpperCase(), quantity: qty, cost_basis: costBasis, current_value: mktValue });
  }
  return result;
}

function parseFidelity(rows: string[][], headerIdx: number, headers: string[]): CsvHoldingRow[] {
  const result: CsvHoldingRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) break;
    const ticker = col(row, headers, 'symbol', 'ticker');
    if (!ticker || ticker.startsWith('Account') || ticker === 'Pending Activity') continue;
    const qty = parseNum(col(row, headers, 'quantity'));
    const costBasis = parseNum(col(row, headers, 'costbasistotal', 'costbasis'));
    const curValue = parseNum(col(row, headers, 'currentvalue', 'lastvalue'));
    if (!qty) continue;
    result.push({ ticker: ticker.toUpperCase(), quantity: qty, cost_basis: costBasis, current_value: curValue });
  }
  return result;
}

// ── Route ───────────────────────────────────────────────────────────────────

// POST /api/buckets/[id]/sync-csv
// multipart/form-data: file=<csv>, preview=true|false
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Verify ownership
  const { count } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucketId)
    .eq('portfolios.user_id', user.id);
  if ((count ?? 0) === 0) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const preview = formData.get('preview') === 'true';

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);
  const header = findHeaderRow(rows);
  if (!header) return NextResponse.json({ error: 'Could not find header row (expected Symbol/Ticker column)' }, { status: 422 });

  const broker = detectBroker(header.headers);
  let parsed: CsvHoldingRow[];

  if (broker === 'fidelity') {
    parsed = parseFidelity(rows, header.idx, header.headers);
  } else {
    // Schwab or unknown — try Schwab parser
    parsed = parseSchwab(rows, header.idx, header.headers);
  }

  if (!parsed.length) return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 422 });

  // Load existing holdings to match by ticker
  const { data: holdings } = await supabase
    .from('bucket_holdings')
    .select('id, ticker, quantity, purchase_price')
    .eq('bucket_id', bucketId);

  const holdingByTicker = Object.fromEntries((holdings ?? []).map(h => [h.ticker.toUpperCase(), h]));

  const matched: { holding_id: number; ticker: string; quantity: number; cost_basis: number; current_value?: number }[] = [];
  const unmatched: string[] = [];

  for (const row of parsed) {
    const h = holdingByTicker[row.ticker];
    if (h) {
      matched.push({ holding_id: h.id, ...row });
    } else {
      unmatched.push(row.ticker);
    }
  }

  // Preview mode: return what would change without writing
  if (preview) {
    return NextResponse.json({ broker, matched, unmatched, total_rows: parsed.length });
  }

  // Apply: update each matched holding's quantity + cost_basis
  const now = new Date().toISOString();
  await Promise.all(matched.map(m =>
    supabase.from('bucket_holdings').update({
      quantity: m.quantity,
      cost_basis: m.cost_basis,
      brokerage: broker,
      last_synced_at: now,
    }).eq('id', m.holding_id)
  ));

  // Log the sync
  await supabase.from('brokerage_syncs').insert({
    user_id: user.id,
    bucket_id: bucketId,
    source: broker,
    holdings_updated: matched.length,
    unmatched_tickers: unmatched,
    raw_snapshot: parsed as any,
  });

  return NextResponse.json({
    success: true,
    broker,
    holdings_updated: matched.length,
    unmatched_tickers: unmatched,
  });
}
