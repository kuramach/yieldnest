import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSpillbackDividend } from '@/lib/tax-classification';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const taxYear = searchParams.get('tax_year');

  let query = supabase
    .from('portfolio_holding_distributions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('ex_date', { ascending: false });

  if (taxYear) query = query.eq('tax_year', parseInt(taxYear, 10));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { data: portfolio } = await supabase
    .from('portfolios').select('id').eq('id', portfolioId).eq('user_id', user.id).single();
  if (!portfolio) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { ticker, ex_date, pay_date, distribution_type, amount_per_share, shares_held, notes } = body;

  if (!ticker || !ex_date || !distribution_type || amount_per_share === undefined) {
    return NextResponse.json({ error: 'ticker, ex_date, distribution_type, amount_per_share required' }, { status: 400 });
  }

  const exDate = new Date(ex_date);
  const payDate = pay_date ? new Date(pay_date) : null;

  // Determine effective tax year — apply 852(b)(6) spillback if applicable
  let tax_year = exDate.getFullYear();
  let spillback = false;
  if (payDate && isSpillbackDividend(exDate, payDate)) {
    tax_year = exDate.getFullYear(); // still attributed to the ex_date year per 852(b)(6)
    spillback = true;
  }

  const total_amount = shares_held != null ? amount_per_share * shares_held : null;

  const { data, error } = await supabase
    .from('portfolio_holding_distributions')
    .insert({
      portfolio_id: portfolioId,
      ticker: ticker.toUpperCase().trim(),
      ex_date,
      pay_date: pay_date || null,
      tax_year,
      distribution_type,
      amount_per_share,
      shares_held: shares_held ?? null,
      total_amount,
      spillback,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  const { searchParams } = new URL(req.url);
  const distId = searchParams.get('id');
  if (!distId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('portfolio_holding_distributions')
    .delete()
    .eq('id', parseInt(distId, 10))
    .eq('portfolio_id', portfolioId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
