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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yieldnest.eazybudget.com';
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
    const roleLabel = role === 'editor' ? 'Editor' : 'Viewer';
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- Logo / Wordmark -->
        <tr><td style="padding-bottom:24px;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#059669;letter-spacing:-0.5px">Yield</span><span style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px">Nest</span>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">

          <!-- Green header bar -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#059669;padding:28px 32px">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px">Collaboration Invite</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3">
                ${inviterName} invited you to collaborate
              </h1>
            </td></tr>
          </table>

          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:28px 32px">

              <!-- Invite detail pill -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">
                <tr><td style="padding:14px 18px">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px">Bucket</p>
                  <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a">${bucketName}</p>
                  ${portfolioName ? `<p style="margin:4px 0 0;font-size:13px;color:#64748b">in ${portfolioName}</p>` : ''}
                  <p style="margin:8px 0 0;font-size:12px;color:#64748b">Your role: <span style="font-weight:600;color:#0f172a">${roleLabel}</span></p>
                </td></tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                <tr><td align="center">
                  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:#059669;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
                    Accept Invite →
                  </a>
                </td></tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #f1f5f9;margin:0 0 24px">

              <!-- What is YieldNest blurb -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background:#f8fafc;border-radius:10px">
                <tr><td style="padding:16px 18px">
                  <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">What is YieldNest?</p>
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">
                    YieldNest is a retirement portfolio builder that helps you design a bucket-strategy — splitting your investments into goal-based buckets (e.g. conservative income, moderate growth, long-term growth) each with its own target return and lifespan. You can run Monte Carlo stress tests, track real performance from your Schwab or Fidelity account, and now — collaborate with trusted people on your portfolio strategy.
                  </p>
                </td></tr>
              </table>

              <!-- Fine print -->
              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center">
                This invite is for <strong>${email}</strong> only. Sign in with this email to accept.
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;word-break:break-all">
                ${inviteUrl}
              </p>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0;text-align:center">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            © ${new Date().getFullYear()} YieldNest · <a href="https://yieldnest.eazybudget.com" style="color:#94a3b8">yieldnest.eazybudget.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from:    'YieldNest <noreply@eazybudget.com>',
      to:      email,
      subject: `${inviterName} invited you to collaborate on "${bucketName}" — YieldNest`,
      html,
    }).catch(err => console.error('Resend error:', err));
  }

  return NextResponse.json({ collaborator: data, invite_url: inviteUrl }, { status: 201 });
}
