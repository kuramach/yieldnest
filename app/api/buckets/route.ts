import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { portfolio_id, name, target_return, lifespan_years, initial_amount, order_index } = body;

  if (!portfolio_id || target_return === undefined) {
    return NextResponse.json({ error: 'portfolio_id and target_return are required' }, { status: 400 });
  }

  // Verify user owns the portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolio_id)
    .eq('user_id', user.id)
    .single();

  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('buckets')
    .insert({
      portfolio_id,
      name: name?.trim() || 'Bucket',
      target_return,
      lifespan_years: lifespan_years || 10,
      initial_amount: initial_amount || 0,
      order_index: order_index ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
