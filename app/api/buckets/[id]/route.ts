import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

async function verifyBucketOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucketId: number,
  userId: string
): Promise<boolean> {
  // Use a count query through join to check ownership without type issues
  const { count } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucketId)
    .eq('portfolios.user_id', userId);

  return (count ?? 0) > 0;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const isOwner = await verifyBucketOwner(supabase, bucketId, user.id);
  if (!isOwner) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.target_return !== undefined) updates.target_return = body.target_return;
  if (body.lifespan_years !== undefined) updates.lifespan_years = body.lifespan_years;
  if (body.initial_amount !== undefined) updates.initial_amount = body.initial_amount;
  if (body.order_index !== undefined) updates.order_index = body.order_index;

  const { data, error } = await supabase
    .from('buckets')
    .update(updates)
    .eq('id', bucketId)
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
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const isOwner = await verifyBucketOwner(supabase, bucketId, user.id);
  if (!isOwner) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

  const { error } = await supabase.from('buckets').delete().eq('id', bucketId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
