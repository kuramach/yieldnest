import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

// GET /api/portfolios/[id]/analyses — list all saved analyses
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portfolio } = await supabase
    .from('portfolios').select('id').eq('id', id).eq('user_id', user.id).single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase
    .from('portfolio_analyses')
    .select('id, stats, ai_narrative, target_return, available_cash, portfolio_best, portfolio_worst, portfolio_median, created_at')
    .eq('portfolio_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({ analyses: data ?? [] });
}

// POST /api/portfolios/[id]/analyses — save a new analysis snapshot
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portfolio } = await supabase
    .from('portfolios').select('id').eq('id', id).eq('user_id', user.id).single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { stats, ai_narrative, target_return, available_cash, portfolio_best, portfolio_worst, portfolio_median } = body;

  const { data, error } = await supabase
    .from('portfolio_analyses')
    .insert({
      portfolio_id: Number(id),
      user_id: user.id,
      stats: stats ?? [],
      ai_narrative: ai_narrative ?? '',
      target_return: target_return ?? 0.07,
      available_cash: available_cash ?? 0,
      portfolio_best,
      portfolio_worst,
      portfolio_median,
    })
    .select('id, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
