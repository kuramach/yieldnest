import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/portfolios/[id]/holdings-flat — all holdings across all buckets as ImportedHolding-compatible objects
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portfolio } = await supabase
    .from('portfolios').select('id').eq('id', id).eq('user_id', user.id).single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: buckets } = await supabase
    .from('buckets').select('id').eq('portfolio_id', id);
  const bucketIds = (buckets ?? []).map(b => b.id);
  if (bucketIds.length === 0) return NextResponse.json({ holdings: [] });

  const { data: rows } = await supabase
    .from('bucket_holdings')
    .select('ticker, name, asset_type, weight, quantity, purchase_price')
    .in('bucket_id', bucketIds);

  // Deduplicate by ticker (sum weights, average price)
  const map: Record<string, { ticker: string; name: string; asset_type: string; weight: number; shares: number; price: number }> = {};
  for (const r of (rows ?? [])) {
    if (!map[r.ticker]) {
      map[r.ticker] = { ticker: r.ticker, name: r.name || r.ticker, asset_type: r.asset_type, weight: 0, shares: 0, price: r.purchase_price ?? 0 };
    }
    map[r.ticker].weight += r.weight;
    map[r.ticker].shares += r.quantity ?? 0;
  }

  const holdings = Object.values(map);
  return NextResponse.json({ holdings });
}
