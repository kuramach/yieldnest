import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ token: string }> };

// GET /api/invite/[token] — look up invite details (public, no auth required)
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { token } = await params;

  const { data: invite, error } = await supabase
    .from('bucket_collaborators')
    .select(`
      id,
      invited_email,
      role,
      status,
      bucket_id,
      buckets (
        name,
        portfolios ( name )
      )
    `)
    .eq('invite_token', token)
    .single();

  if (error || !invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'This invite has been revoked' }, { status: 410 });
  if (invite.status === 'active')  return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 });

  return NextResponse.json({
    invited_email: invite.invited_email,
    role: invite.role,
    bucket_name: (invite.buckets as any)?.name,
    portfolio_name: (invite.buckets as any)?.portfolios?.name,
  });
}

// POST /api/invite/[token] — accept invite (must be signed in as invited_email)
export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be signed in to accept this invite' }, { status: 401 });

  const { token } = await params;

  const { data: invite, error } = await supabase
    .from('bucket_collaborators')
    .select('*')
    .eq('invite_token', token)
    .single();

  if (error || !invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (invite.status === 'revoked') return NextResponse.json({ error: 'This invite has been revoked' }, { status: 410 });
  if (invite.status === 'active')  return NextResponse.json({ error: 'Already accepted' }, { status: 409 });

  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase())
    return NextResponse.json({
      error: `This invite is for ${invite.invited_email}. You are signed in as ${user.email}.`,
    }, { status: 403 });

  const { data: updated, error: updateErr } = await supabase
    .from('bucket_collaborators')
    .update({
      user_id: user.id,
      status: 'active',
      accepted_at: new Date().toISOString(),
    })
    .eq('invite_token', token)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Fetch portfolio_id so we can build the correct bucket URL
  const { data: bucket } = await supabase
    .from('buckets')
    .select('portfolio_id')
    .eq('id', updated.bucket_id)
    .single();

  const portfolioId = bucket?.portfolio_id ?? 0;

  return NextResponse.json({
    success: true,
    bucket_id: updated.bucket_id,
    role: updated.role,
    redirect: `/dashboard/portfolio/${portfolioId}/bucket/${updated.bucket_id}`,
  });
}
