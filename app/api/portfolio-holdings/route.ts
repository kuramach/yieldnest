import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const portfolioId = request.nextUrl.searchParams.get('portfolio_id');
  if (!portfolioId) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });

  // Verify ownership
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('added_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { portfolio_id, ticker, name, asset_type, weight } = body;

  if (!portfolio_id || !ticker) {
    return NextResponse.json({ error: 'portfolio_id and ticker are required' }, { status: 400 });
  }

  // Verify ownership
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolio_id)
    .eq('user_id', user.id)
    .single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('portfolio_holdings')
    .upsert({
      portfolio_id,
      ticker: ticker.toUpperCase(),
      name: name || null,
      asset_type: asset_type || 'etf',
      weight: weight ?? 0,
    }, { onConflict: 'portfolio_id,ticker' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
