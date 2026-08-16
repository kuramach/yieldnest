import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyTicker } from '@/lib/tax-classification';

type Params = { params: Promise<{ id: string }> };

// ── CSV parsers (shared logic) ────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.trim().split(/\r?\n/);
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

interface ParsedRow {
  ticker: string;
  name: string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  price: number;
  gain_loss: number;
  gain_loss_pct: number;
  asset_type: 'stock' | 'etf' | 'bond';
}

function parseSchwab(rows: string[][], headerIdx: number, headers: string[]): ParsedRow[] {
  const result: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) break;
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

    result.push({
      ticker: ticker.toUpperCase(),
      name: description,
      quantity: qty,
      cost_basis: costBasis,
      market_value: marketValue,
      price,
      gain_loss: gainLoss,
      gain_loss_pct: gainLossPct,
      asset_type,
    });
  }
  return result;
}

function parseFidelity(rows: string[][], headerIdx: number, headers: string[]): ParsedRow[] {
  const result: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) break;
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

    result.push({
      ticker: ticker.toUpperCase(),
      name: description,
      quantity: qty,
      cost_basis: costBasis,
      market_value: marketValue,
      price,
      gain_loss: gainLoss,
      gain_loss_pct: gainLossPct,
      asset_type,
    });
  }
  return result;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .single();
  if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const preview = formData.get('preview') === 'true';
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);
  const header = findHeaderRow(rows);
  if (!header) return NextResponse.json({ error: 'Could not find header row (expected Symbol/Ticker column)' }, { status: 422 });

  const broker = detectBroker(header.headers);
  const parsed = broker === 'fidelity'
    ? parseFidelity(rows, header.idx, header.headers)
    : parseSchwab(rows, header.idx, header.headers);

  if (!parsed.length) return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 422 });

  // Load existing portfolio holdings
  const { data: existing } = await supabase
    .from('portfolio_holdings')
    .select('id, ticker')
    .eq('portfolio_id', portfolioId);

  const existingByTicker = Object.fromEntries((existing ?? []).map(h => [h.ticker.toUpperCase(), h]));

  const matched: (ParsedRow & { holding_id: number; is_new: boolean })[] = [];
  const newTickers: ParsedRow[] = [];

  for (const row of parsed) {
    const h = existingByTicker[row.ticker];
    if (h) {
      matched.push({ ...row, holding_id: h.id, is_new: false });
    } else {
      newTickers.push(row);
      // Will be auto-added on confirm
      matched.push({ ...row, holding_id: -1, is_new: true });
    }
  }

  // Compute weights from market values in the CSV
  const totalMarketValue = parsed.reduce((s, r) => s + r.market_value, 0);
  const withWeights = parsed.map(row => ({
    ...row,
    weight: totalMarketValue > 0 ? row.market_value / totalMarketValue : 0,
  }));

  if (preview) {
    return NextResponse.json({
      broker,
      total_rows: parsed.length,
      total_market_value: totalMarketValue,
      matched: matched.filter(m => !m.is_new).map(m => ({
        ...m,
        weight: totalMarketValue > 0 ? m.market_value / totalMarketValue : 0,
      })),
      new_tickers: newTickers.map(r => ({
        ticker: r.ticker, name: r.name, quantity: r.quantity,
        cost_basis: r.cost_basis, market_value: r.market_value,
        weight: totalMarketValue > 0 ? r.market_value / totalMarketValue : 0,
      })),
    });
  }

  // Confirm: upsert all rows with computed weights
  const now = new Date().toISOString();
  await Promise.all(withWeights.map(row =>
    supabase.from('portfolio_holdings').upsert({
      portfolio_id: portfolioId,
      ticker: row.ticker,
      name: row.name || null,
      asset_type: row.asset_type,
      quantity: row.quantity,
      price: row.price,
      purchase_price: row.quantity > 0 ? row.cost_basis / row.quantity : 0,
      cost_basis: row.cost_basis,
      weight: row.weight,
      tax_treatment: classifyTicker(row.ticker),
    }, { onConflict: 'portfolio_id,ticker' })
      .eq('portfolio_id', portfolioId)
  ));

  // Re-fetch to return updated list
  const { data: updated } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('added_at', { ascending: true });

  // Save a versioned snapshot for tax/audit history
  await supabase.from('portfolio_import_snapshots').insert({
    portfolio_id: portfolioId,
    source: broker,
    total_market_value: totalMarketValue,
    holdings: withWeights.map(r => ({
      ticker: r.ticker,
      name: r.name,
      quantity: r.quantity,
      price: r.price,
      cost_basis: r.cost_basis,
      market_value: r.market_value,
      gain_loss: r.gain_loss,
      gain_loss_pct: r.gain_loss_pct,
      asset_type: r.asset_type,
      weight: r.weight,
    })),
  });

  return NextResponse.json({
    success: true,
    broker,
    holdings_synced: parsed.length,
    holdings: updated,
    last_synced_at: now,
  });
}
