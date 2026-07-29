import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { bucket_id, ticker, name, asset_type, weight, quantity, purchase_price } = body;

  if (!bucket_id || !ticker) {
    return NextResponse.json({ error: 'bucket_id and ticker are required' }, { status: 400 });
  }

  // Verify ownership via count query
  const { count } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucket_id)
    .eq('portfolios.user_id', user.id);

  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('bucket_holdings')
    .insert({
      bucket_id,
      ticker: ticker.toUpperCase().trim(),
      name: name?.trim() || null,
      asset_type: asset_type || 'etf',
      weight: weight ?? 0,
      quantity: quantity ?? 0,
      purchase_price: purchase_price ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
