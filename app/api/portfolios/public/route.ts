import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  // Public portfolios are readable by anyone via RLS policy
  const { data, error } = await supabase
    .from('portfolios')
    .select(`
      id,
      user_id,
      name,
      description,
      is_public,
      created_at,
      buckets (
        id,
        target_return,
        bucket_holdings ( id )
      )
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const portfolios = (data ?? []).map(p => {
    const buckets = (p.buckets as any[]) ?? [];
    const holdingCount = buckets.reduce((sum: number, b: any) => sum + (b.bucket_holdings?.length ?? 0), 0);
    const returns = buckets.map((b: any) => b.target_return).filter(Boolean);
    const avgReturn = returns.length > 0
      ? returns.reduce((a: number, b: number) => a + b, 0) / returns.length
      : undefined;

    return {
      id: p.id,
      user_id: p.user_id,
      name: p.name,
      description: p.description,
      is_public: p.is_public,
      created_at: p.created_at,
      bucket_count: buckets.length,
      holding_count: holdingCount,
      avg_return: avgReturn,
    };
  });

  return NextResponse.json(portfolios);
}

// Copy a public portfolio into the current user's account
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { portfolio_id, name } = await request.json();
  if (!portfolio_id) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });

  // Fetch source portfolio (must be public)
  const { data: source, error: srcErr } = await supabase
    .from('portfolios')
    .select(`
      id, name, description,
      buckets (
        id, name, target_return, lifespan_years, initial_amount, order_index,
        bucket_holdings ( ticker, name, asset_type, weight, quantity, purchase_price )
      )
    `)
    .eq('id', portfolio_id)
    .eq('is_public', true)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: 'Portfolio not found or not public' }, { status: 404 });
  }

  // Create new portfolio for the user
  const { data: newPortfolio, error: pErr } = await supabase
    .from('portfolios')
    .insert({
      user_id: user.id,
      name: name?.trim() || `${source.name} (imported)`,
      description: source.description,
      is_public: false,
      imported_from_id: source.id,
    })
    .select()
    .single();

  if (pErr || !newPortfolio) {
    return NextResponse.json({ error: pErr?.message ?? 'Failed to create portfolio' }, { status: 500 });
  }

  // Copy buckets and holdings
  const buckets = (source.buckets as any[]) ?? [];
  for (const bucket of buckets) {
    const { data: newBucket, error: bErr } = await supabase
      .from('buckets')
      .insert({
        portfolio_id: newPortfolio.id,
        name: bucket.name,
        target_return: bucket.target_return,
        lifespan_years: bucket.lifespan_years,
        initial_amount: bucket.initial_amount,
        order_index: bucket.order_index,
      })
      .select()
      .single();

    if (bErr || !newBucket) continue;

    const holdings = (bucket.bucket_holdings as any[]) ?? [];
    if (holdings.length > 0) {
      await supabase.from('bucket_holdings').insert(
        holdings.map((h: any) => ({
          bucket_id: newBucket.id,
          ticker: h.ticker,
          name: h.name,
          asset_type: h.asset_type,
          weight: h.weight,
          quantity: h.quantity,
          purchase_price: h.purchase_price,
        }))
      );
    }
  }

  return NextResponse.json(newPortfolio, { status: 201 });
}
