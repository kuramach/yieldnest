import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, description, linked_360r_scenario_id, is_public, imported_from_id } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Portfolio name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('portfolios')
    .insert({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      linked_360r_scenario_id: linked_360r_scenario_id || null,
      is_public: is_public === true,
      imported_from_id: imported_from_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
