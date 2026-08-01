import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yieldnest.vercel.app';
  const inviteUrl = `${appUrl}/invite/${data.invite_token}`;

  // Look up the bucket name for the email
  const { data: bucket } = await supabase
    .from('buckets')
    .select('name, portfolios(name)')
    .eq('id', bucketId)
    .single();

  const bucketName    = bucket?.name ?? 'a bucket';
  const portfolioName = (bucket?.portfolios as any)?.name;
  const inviterName   = user.email ?? 'Someone';

  if (resend) {
    await resend.emails.send({
      from:    'YieldNest <invites@yieldnest.app>',
      to:      email,
      subject: `${inviterName} invited you to collaborate on "${bucketName}"`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px;border:1px solid #e2e8f0">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">You've been invited to collaborate</h2>
          ${portfolioName ? `<p style="margin:0 0 16px;color:#64748b;font-size:14px">Portfolio: <strong>${portfolioName}</strong></p>` : ''}
          <p style="margin:0 0 20px;color:#334155;font-size:15px">
            <strong>${inviterName}</strong> has invited you as a <strong>${role}</strong> on the bucket <strong>"${bucketName}"</strong>.
          </p>
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
            Accept Invite
          </a>
          <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">
            Or copy this link: ${inviteUrl}
          </p>
          <p style="margin:12px 0 0;color:#94a3b8;font-size:11px">
            This invite is for ${email} only. You must sign in with this email to accept.
          </p>
        </div>
      `,
    }).catch(err => console.error('Resend error:', err));
  }

  return NextResponse.json({ collaborator: data, invite_url: inviteUrl }, { status: 201 });
}
