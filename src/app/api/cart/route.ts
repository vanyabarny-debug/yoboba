import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { create_service_client } from '@/lib/supabase/service';
import { normalize_menu_item_images } from '@/lib/menu-store';
import type { menu_item } from '@/lib/types';

async function require_user() {
  const supabase = await create_server_client();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await require_user();
  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('cart_items')
    .select('id, menu_id, quantity, menu:menu_id(id, name, price, image_url, category, is_available, recommendations)')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []).map((row) => {
    const raw_menu = row.menu as menu_item | menu_item[] | null;
    const menu_row = Array.isArray(raw_menu) ? raw_menu[0] : raw_menu;
    if (!menu_row) return row;
    const [menu] = normalize_menu_item_images([menu_row]);
    return { ...row, menu };
  });

  return NextResponse.json({ items: rows });
}

export async function POST(request: Request) {
  const { supabase, user } = await require_user();
  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const body = await request.json();
  const menu_id = body.menu_id as string | undefined;
  const quantity = Number(body.quantity);
  const delta = body.delta != null ? Number(body.delta) : null;

  if (!menu_id || Number.isNaN(quantity) && delta == null) {
    return NextResponse.json({ error: 'неверные данные' }, { status: 400 });
  }

  const admin = create_service_client();
  const { data: profile } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    await admin.from('profiles').upsert(
      { id: user.id, name: 'гость', bonus_balance: 0, role: 'user' },
      { onConflict: 'id' }
    );
  }

  let next_qty = quantity;

  if (delta != null) {
    const { data: existing } = await supabase
      .from('cart_items')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('menu_id', menu_id)
      .maybeSingle();
    next_qty = (existing?.quantity || 0) + delta;
  }

  if (next_qty <= 0) {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id)
      .eq('menu_id', menu_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, quantity: 0 });
  }

  const { error } = await supabase.from('cart_items').upsert(
    {
      user_id: user.id,
      menu_id,
      quantity: next_qty,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,menu_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, quantity: next_qty });
}

export async function DELETE() {
  const { supabase, user } = await require_user();
  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
