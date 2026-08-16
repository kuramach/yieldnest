import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const holdingId = parseInt(id, 10);
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.weight !== undefined) updates.weight = body.weight;
  if (body.quantity !== undefined) updates.quantity = body.quantity;
  if (body.purchase_price !== undefined) updates.purchase_price = body.purchase_price;
  if (body.cost_basis !== undefined) updates.cost_basis = body.cost_basis;
  if (body.name !== undefined) updates.name = body.name;
  if (['standard', '1256', 'collectible', 'ric'].includes(body.tax_treatment)) updates.tax_treatment = body.tax_treatment;

  const { data, error } = await supabase
    .from('portfolio_holdings')
    .update(updates)
    .eq('id', holdingId)
    .filter('portfolio_id', 'in', `(SELECT id FROM portfolios WHERE user_id = '${user.id}')`)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const holdingId = parseInt(id, 10);

  const { error } = await supabase
    .from('portfolio_holdings')
    .delete()
    .eq('id', holdingId)
    .filter('portfolio_id', 'in', `(SELECT id FROM portfolios WHERE user_id = '${user.id}')`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
