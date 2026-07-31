import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

async function resolveOwner(supabase: Awaited<ReturnType<typeof createClient>>, bucketId: number, userId: string) {
  const { count } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', bucketId)
    .eq('portfolios.user_id', userId);
  return (count ?? 0) > 0;
}

// GET /api/buckets/[id]/collaborators — list all collaborators (owner only)
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  if (!(await resolveOwner(supabase, bucketId, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('bucket_collaborators')
    .select('*')
    .eq('bucket_id', bucketId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ collaborators: data });
}

// POST /api/buckets/[id]/collaborators — invite someone (owner only)
// body: { email: string, role?: 'viewer' | 'editor' }
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const bucketId = parseInt(id, 10);
  if (isNaN(bucketId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  if (!(await resolveOwner(supabase, bucketId, user.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const email = (body.email ?? '').trim().toLowerCase();
  const role  = body.role === 'viewer' ? 'viewer' : 'editor';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });

  if (email === user.email)
    return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 });

  // Upsert: if already invited with a different role, update it
  const { data, error } = await supabase
    .from('bucket_collaborators')
    .upsert(
      { bucket_id: bucketId, invited_by: user.id, invited_email: email, role },
      { onConflict: 'bucket_id,invited_email', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${data.invite_token}`;
  return NextResponse.json({ collaborator: data, invite_url: inviteUrl }, { status: 201 });
}
