import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string; collabId: string }> };

// DELETE /api/buckets/[id]/collaborators/[collabId] — revoke access (owner only)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, collabId } = await params;
  const bucketId  = parseInt(id, 10);
  const collabIdN = parseInt(collabId, 10);
  if (isNaN(bucketId) || isNaN(collabIdN))
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Verify ownership via join
  const { count } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucketId)
    .eq('portfolios.user_id', user.id);
  if ((count ?? 0) === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('bucket_collaborators')
    .update({ status: 'revoked' })
    .eq('id', collabIdN)
    .eq('bucket_id', bucketId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PATCH /api/buckets/[id]/collaborators/[collabId] — update role (owner only)
// body: { role: 'viewer' | 'editor' }
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, collabId } = await params;
  const bucketId  = parseInt(id, 10);
  const collabIdN = parseInt(collabId, 10);
  if (isNaN(bucketId) || isNaN(collabIdN))
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { count } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucketId)
    .eq('portfolios.user_id', user.id);
  if ((count ?? 0) === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.role === 'viewer' || body.role === 'editor') updates.role = body.role;

  const { data, error } = await supabase
    .from('bucket_collaborators')
    .update(updates)
    .eq('id', collabIdN)
    .eq('bucket_id', bucketId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ collaborator: data });
}
