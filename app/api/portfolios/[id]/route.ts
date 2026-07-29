import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { data: portfolio, error: pError } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .single();

  if (pError || !portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
  }

  const { data: buckets, error: bError } = await supabase
    .from('buckets')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('order_index', { ascending: true });

  if (bError) return NextResponse.json({ error: bError.message }, { status: 500 });

  const bucketIds = (buckets || []).map((b) => b.id);
  let holdings: Record<number, unknown[]> = {};

  if (bucketIds.length > 0) {
    const { data: allHoldings, error: hError } = await supabase
      .from('bucket_holdings')
      .select('*')
      .in('bucket_id', bucketIds)
      .order('added_at', { ascending: true });

    if (hError) return NextResponse.json({ error: hError.message }, { status: 500 });

    holdings = (allHoldings || []).reduce((acc, h) => {
      if (!acc[h.bucket_id]) acc[h.bucket_id] = [];
      acc[h.bucket_id].push(h);
      return acc;
    }, {} as Record<number, unknown[]>);
  }

  const bucketsWithHoldings = (buckets || []).map((b) => ({
    ...b,
    holdings: (holdings[b.id] || []),
  }));

  return NextResponse.json({ ...portfolio, buckets: bucketsWithHoldings });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const { name, description, linked_360r_scenario_id } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (linked_360r_scenario_id !== undefined) updates.linked_360r_scenario_id = linked_360r_scenario_id;

  const { data, error } = await supabase
    .from('portfolios')
    .update(updates)
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { error } = await supabase
    .from('portfolios')
    .delete()
    .eq('id', portfolioId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
