import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

async function canAccessProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: number,
  userId: string
): Promise<boolean> {
  const { data: proposal } = await supabase
    .from('bucket_proposals')
    .select('bucket_id')
    .eq('id', proposalId)
    .single();
  if (!proposal) return false;

  const { count: ownerCount } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', proposal.bucket_id)
    .eq('portfolios.user_id', userId);
  if ((ownerCount ?? 0) > 0) return true;

  const { count: collabCount } = await supabase
    .from('bucket_collaborators')
    .select('*', { count: 'exact', head: true })
    .eq('bucket_id', proposal.bucket_id)
    .eq('user_id', userId)
    .eq('status', 'active');
  return (collabCount ?? 0) > 0;
}

// GET /api/proposals/[id]/comments
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  if (!(await canAccessProposal(supabase, proposalId, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('proposal_comments')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

// POST /api/proposals/[id]/comments — body: { body: string }
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  if (!(await canAccessProposal(supabase, proposalId, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const text = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('proposal_comments')
    .insert({ proposal_id: proposalId, user_id: user.id, body: text })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
