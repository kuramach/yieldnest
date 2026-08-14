import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolioId)
    .eq('user_id', user.id)
    .single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('portfolio_import_snapshots')
    .select('id, imported_at, source, label, total_market_value, holdings')
    .eq('portfolio_id', portfolioId)
    .order('imported_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { snapshot_id, label } = await req.json();
  if (!snapshot_id) return NextResponse.json({ error: 'snapshot_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('portfolio_import_snapshots')
    .update({ label: label?.trim() || null })
    .eq('id', snapshot_id)
    .eq('portfolio_id', portfolioId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
