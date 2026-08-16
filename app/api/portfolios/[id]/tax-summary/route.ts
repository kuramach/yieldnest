import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { compute1256Mtm, TAX_TREATMENT_META } from '@/lib/tax-classification';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const taxYear = parseInt(searchParams.get('tax_year') ?? String(new Date().getFullYear()), 10);

  const { data: portfolio } = await supabase
    .from('portfolios').select('id').eq('id', portfolioId).eq('user_id', user.id).single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Load holdings with tax_treatment
  const { data: holdings } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('portfolio_id', portfolioId);

  // Load distributions for tax year
  const { data: distributions } = await supabase
    .from('portfolio_holding_distributions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('tax_year', taxYear);

  // Try to find a year-end snapshot (Dec import) for 1256 MTM calculation
  const yearEnd = `${taxYear}-12-31`;
  const { data: snapshots } = await supabase
    .from('portfolio_import_snapshots')
    .select('id, imported_at, holdings')
    .eq('portfolio_id', portfolioId)
    .gte('imported_at', `${taxYear}-10-01`)
    .lte('imported_at', `${taxYear}-12-31T23:59:59`)
    .order('imported_at', { ascending: false })
    .limit(1);

  const yearEndSnapshot = snapshots?.[0] ?? null;

  const holdingsByTicker = Object.fromEntries(
    (holdings ?? []).map(h => [h.ticker, h])
  );

  // Build per-ticker distribution summary
  const distByTicker: Record<string, {
    ordinary: number; qualified: number; roc: number;
    stcg: number; ltcg: number; section1256: number;
    spillback_amount: number;
  }> = {};

  for (const d of distributions ?? []) {
    if (!distByTicker[d.ticker]) {
      distByTicker[d.ticker] = { ordinary: 0, qualified: 0, roc: 0, stcg: 0, ltcg: 0, section1256: 0, spillback_amount: 0 };
    }
    const amount = d.total_amount ?? (d.amount_per_share * (d.shares_held ?? 0));
    distByTicker[d.ticker][d.distribution_type as keyof typeof distByTicker[string]] += amount;
    if (d.spillback) distByTicker[d.ticker].spillback_amount += amount;
  }

  // Build per-holding tax summary
  const holdingSummaries = (holdings ?? []).map(h => {
    const treatment = (h.tax_treatment ?? 'standard') as string;
    const meta = TAX_TREATMENT_META[treatment as keyof typeof TAX_TREATMENT_META];
    const dist = distByTicker[h.ticker] ?? null;

    // Effective cost basis after ROC adjustments
    const rocAdjustment = dist?.roc ?? 0;
    const adjustedCostBasis = Math.max(0, (h.cost_basis ?? 0) - rocAdjustment);

    // 1256 MTM calculation
    let mtm: ReturnType<typeof compute1256Mtm> | null = null;
    if (treatment === '1256') {
      // Use year-end snapshot value if available, else current price
      const snapshotHolding = yearEndSnapshot
        ? (yearEndSnapshot.holdings as { ticker: string; market_value: number }[])
            .find(s => s.ticker === h.ticker)
        : null;
      const yearEndValue = snapshotHolding?.market_value ?? ((h.price ?? 0) * (h.quantity ?? 0));
      mtm = compute1256Mtm(h.ticker, adjustedCostBasis, yearEndValue);
    }

    // Unrealized gain on current position (non-1256)
    const currentValue = (h.price ?? 0) * (h.quantity ?? 0);
    const unrealizedGainLoss = treatment !== '1256' && currentValue > 0
      ? currentValue - adjustedCostBasis
      : null;

    return {
      ticker: h.ticker,
      name: h.name,
      tax_treatment: treatment,
      tax_treatment_label: meta?.label ?? treatment,
      quantity: h.quantity,
      cost_basis: h.cost_basis,
      adjusted_cost_basis: adjustedCostBasis,
      current_value: currentValue > 0 ? currentValue : null,
      unrealized_gain_loss: unrealizedGainLoss,
      distributions: dist,
      mtm_1256: mtm,
    };
  });

  // Portfolio-level totals
  const totals = {
    ordinary_income: Object.values(distByTicker).reduce((s, d) => s + d.ordinary, 0),
    qualified_dividends: Object.values(distByTicker).reduce((s, d) => s + d.qualified, 0),
    return_of_capital: Object.values(distByTicker).reduce((s, d) => s + d.roc, 0),
    stcg_distributions: Object.values(distByTicker).reduce((s, d) => s + d.stcg, 0),
    ltcg_distributions: Object.values(distByTicker).reduce((s, d) => s + d.ltcg, 0),
    spillback_total: Object.values(distByTicker).reduce((s, d) => s + d.spillback_amount, 0),
    mtm_1256_ltcg: holdingSummaries.reduce((s, h) => s + (h.mtm_1256?.ltcg_portion ?? 0), 0),
    mtm_1256_stcg: holdingSummaries.reduce((s, h) => s + (h.mtm_1256?.stcg_portion ?? 0), 0),
  };

  return NextResponse.json({
    tax_year: taxYear,
    portfolio_id: portfolioId,
    year_end_snapshot: yearEndSnapshot ? { id: yearEndSnapshot.id, imported_at: yearEndSnapshot.imported_at } : null,
    holdings: holdingSummaries,
    totals,
    distributions_count: (distributions ?? []).length,
  });
}
