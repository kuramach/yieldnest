import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProposalPayload } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// GET /api/proposals/[id] — get single proposal with comment count
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { data: proposal, error } = await supabase
    .from('bucket_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (error || !proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify access (owner or collaborator)
  const { count: ownerCount } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', proposal.bucket_id)
    .eq('portfolios.user_id', user.id);

  const { count: collabCount } = await supabase
    .from('bucket_collaborators')
    .select('*', { count: 'exact', head: true })
    .eq('bucket_id', proposal.bucket_id)
    .eq('user_id', user.id)
    .eq('status', 'active');

  if ((ownerCount ?? 0) === 0 && (collabCount ?? 0) === 0)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = (ownerCount ?? 0) > 0;
  return NextResponse.json({ proposal, isOwner });
}

// PATCH /api/proposals/[id] — accept/reject (owner) or withdraw (proposer)
// body: { action: 'accept' | 'reject' | 'withdraw', comment?: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const proposalId = parseInt(id, 10);
  if (isNaN(proposalId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { data: proposal, error: fetchErr } = await supabase
    .from('bucket_proposals')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (fetchErr || !proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (proposal.status !== 'open') return NextResponse.json({ error: 'Proposal is already resolved' }, { status: 409 });

  const { count: ownerCount } = await supabase
    .from('buckets')
    .select('portfolios!inner(user_id)', { count: 'exact', head: true })
    .eq('id', proposal.bucket_id)
    .eq('portfolios.user_id', user.id);
  const isOwner = (ownerCount ?? 0) > 0;

  const body = await req.json();
  const action  = body.action as 'accept' | 'reject' | 'withdraw';
  const comment = (body.comment ?? '').trim() || null;

  if (action === 'withdraw') {
    if (proposal.proposed_by !== user.id)
      return NextResponse.json({ error: 'Only the proposer can withdraw' }, { status: 403 });
    await supabase.from('bucket_proposals').update({
      status: 'withdrawn',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    }).eq('id', proposalId);
    return NextResponse.json({ success: true });
  }

  if (action === 'reject') {
    if (!isOwner) return NextResponse.json({ error: 'Only the bucket owner can reject' }, { status: 403 });
    await supabase.from('bucket_proposals').update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    }).eq('id', proposalId);
    if (comment) {
      await supabase.from('proposal_comments').insert({
        proposal_id: proposalId,
        user_id: user.id,
        body: comment,
      });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'accept') {
    if (!isOwner) return NextResponse.json({ error: 'Only the bucket owner can accept' }, { status: 403 });

    const payload = proposal.payload as ProposalPayload;

    // Apply weight changes
    if (payload.weight_changes?.length) {
      await Promise.all(payload.weight_changes.map(wc =>
        supabase.from('bucket_holdings')
          .update({ weight: wc.new_weight })
          .eq('id', wc.holding_id)
          .eq('bucket_id', proposal.bucket_id)
      ));
    }

    // Apply removals
    if (payload.removals?.length) {
      await Promise.all(payload.removals.map(r =>
        supabase.from('bucket_holdings').delete().eq('id', r.holding_id)
      ));
    }

    // Apply additions
    if (payload.additions?.length) {
      await supabase.from('bucket_holdings').insert(
        payload.additions.map(a => ({
          bucket_id: proposal.bucket_id,
          ticker:    a.ticker,
          name:      a.name,
          asset_type: a.asset_type,
          weight:    a.weight,
          quantity:  0,
          purchase_price: 0,
        }))
      );
    }

    // Apply meta changes (lifespan, target_return)
    if (payload.meta) {
      const bucketUpdates: Record<string, unknown> = {};
      if (payload.meta.lifespan_years) bucketUpdates.lifespan_years = payload.meta.lifespan_years.new;
      if (payload.meta.target_return)  bucketUpdates.target_return  = payload.meta.target_return.new;
      if (Object.keys(bucketUpdates).length) {
        await supabase.from('buckets').update(bucketUpdates).eq('id', proposal.bucket_id);
      }
    }

    await supabase.from('bucket_proposals').update({
      status: 'accepted',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    }).eq('id', proposalId);

    if (comment) {
      await supabase.from('proposal_comments').insert({
        proposal_id: proposalId,
        user_id: user.id,
        body: comment,
      });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
