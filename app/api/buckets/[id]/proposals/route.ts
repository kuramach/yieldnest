import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProposalPayload } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

async function canAccessBucket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucketId: number,
  userId: string
): Promise<'owner' | 'collaborator' | null> {
  const { count: ownerCount } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucketId)
    .eq('portfolios.user_id', userId);
  if ((ownerCount ?? 0) > 0) return 'owner';

  const { count: collabCount } = await supabase
    .from('bucket_collaborators')
    .select('*', { count: 'exact', head: true })
    .eq('bucket_id', bucketId)
    .eq('user_id', userId)
    .eq('status', 'active');
  if ((collabCount ?? 0) > 0) return 'collaborator';

  return null;
}

// GET /api/buckets/[id]/proposals — list proposals (owner + collaborators)
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const role = await canAccessBucket(supabase, bucketId, user.id);
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('bucket_proposals')
    .select('*')
    .eq('bucket_id', bucketId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data, role });
}

// POST /api/buckets/[id]/proposals — create proposal (editor collaborator only)
// body: { title, summary?, payload: ProposalPayload }
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Only active editors can propose (not viewers, not owner — owner edits directly)
  const { data: collab } = await supabase
    .from('bucket_collaborators')
    .select('role')
    .eq('bucket_id', bucketId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (!collab) return NextResponse.json({ error: 'Not a collaborator on this bucket' }, { status: 403 });
  if (collab.role !== 'editor') return NextResponse.json({ error: 'Viewer collaborators cannot propose changes' }, { status: 403 });

  const body = await req.json();
  const title   = (body.title ?? '').trim();
  const summary = (body.summary ?? '').trim() || null;
  const payload = body.payload as ProposalPayload;

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!payload || typeof payload !== 'object')
    return NextResponse.json({ error: 'Payload is required' }, { status: 400 });

  const hasChanges =
    (payload.weight_changes?.length ?? 0) > 0 ||
    (payload.additions?.length ?? 0) > 0 ||
    (payload.removals?.length ?? 0) > 0 ||
    payload.meta != null;
  if (!hasChanges) return NextResponse.json({ error: 'Proposal has no changes' }, { status: 400 });

  const { data, error } = await supabase
    .from('bucket_proposals')
    .insert({ bucket_id: bucketId, proposed_by: user.id, title, summary, payload })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposal: data }, { status: 201 });
}
