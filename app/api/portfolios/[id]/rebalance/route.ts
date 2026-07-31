import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/portfolios/[id]/rebalance — apply suggested weights to all bucket holdings
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portfolio } = await supabase
    .from('portfolios').select('id').eq('id', id).eq('user_id', user.id).single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { suggestions } = await req.json() as {
    suggestions: { ticker: string; suggested_weight: number; price: number; shares_to_buy: number }[];
  };
  if (!suggestions?.length) return NextResponse.json({ error: 'No suggestions' }, { status: 400 });

  const { data: buckets } = await supabase
    .from('buckets').select('id').eq('portfolio_id', id);
  const bucketIds = (buckets ?? []).map(b => b.id);
  if (bucketIds.length === 0) return NextResponse.json({ error: 'No buckets' }, { status: 400 });

  // Update weights for each holding across all buckets
  const weightMap: Record<string, { weight: number; shares_to_buy: number }> = {};
  suggestions.forEach(s => { weightMap[s.ticker] = { weight: s.suggested_weight, shares_to_buy: s.shares_to_buy }; });

  const { data: holdings } = await supabase
    .from('bucket_holdings')
    .select('id, ticker, quantity')
    .in('bucket_id', bucketIds);

  await Promise.all(
    (holdings ?? []).map(h => {
      const s = weightMap[h.ticker];
      if (!s) return Promise.resolve();
      return supabase
        .from('bucket_holdings')
        .update({
          weight: s.weight,
          quantity: s.shares_to_buy || h.quantity,
        })
        .eq('id', h.id);
    })
  );

  return NextResponse.json({ ok: true });
}
