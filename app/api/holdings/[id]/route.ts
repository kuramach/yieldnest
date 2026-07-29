import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

async function verifyHoldingOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  holdingId: number,
  userId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('bucket_holdings')
    .select('buckets!inner(portfolios!inner(user_id))', { count: 'exact', head: true })
    .eq('id', holdingId)
    .eq('buckets.portfolios.user_id', userId);

  return (count ?? 0) > 0;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const holdingId = parseInt(id, 10);
  if (isNaN(holdingId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const isOwner = await verifyHoldingOwner(supabase, holdingId, user.id);
  if (!isOwner) return NextResponse.json({ error: 'Holding not found' }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.weight !== undefined) updates.weight = body.weight;
  if (body.quantity !== undefined) updates.quantity = body.quantity;
  if (body.purchase_price !== undefined) updates.purchase_price = body.purchase_price;
  if (body.name !== undefined) updates.name = body.name;
  if (body.asset_type !== undefined) updates.asset_type = body.asset_type;

  const { data, error } = await supabase
    .from('bucket_holdings')
    .update(updates)
    .eq('id', holdingId)
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
  const holdingId = parseInt(id, 10);
  if (isNaN(holdingId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const isOwner = await verifyHoldingOwner(supabase, holdingId, user.id);
  if (!isOwner) return NextResponse.json({ error: 'Holding not found' }, { status: 404 });

  const { error } = await supabase.from('bucket_holdings').delete().eq('id', holdingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
