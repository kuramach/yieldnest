import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: buckets } = await supabase
    .from('buckets')
    .select('id, name, target_return, initial_amount')
    .eq('portfolio_id', id)
    .order('order_index');

  return NextResponse.json({ ...portfolio, buckets: buckets ?? [] });
}
