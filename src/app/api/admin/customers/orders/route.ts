import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { delete_demo_order, update_demo_order } from '@/lib/demo-orders-server';
import { record_order_stock, release_order_stock } from '@/lib/finance/order-stock';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { order, order_item } from '@/lib/types';

const statuses = new Set<order['status']>(['new', 'preparing', 'ready', 'completed', 'cancelled']);

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

function parse_items(raw: unknown): { ok: true; items: order_item[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) {
    return { ok: false, error: 'в покупке нужна хотя бы одна позиция' };
  }
  const items: order_item[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return { ok: false, error: 'неверная позиция' };
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name || name.length > 120) return { ok: false, error: 'укажите название позиции' };
    const quantity = Number(rec.quantity);
    const price = Number(rec.price);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return { ok: false, error: 'количество — целое от 1 до 500' };
    }
    if (!Number.isInteger(price) || price < 0 || price > 100_000) {
      return { ok: false, error: 'цена — целое число от 0 до 100000' };
    }
    const menu_id = typeof rec.menu_id === 'string' ? rec.menu_id.trim() : '';
    const volume = typeof rec.volume === 'string' && /^\d+$/.test(rec.volume) ? rec.volume : undefined;
    const kind = rec.kind === 'staff' || rec.kind === 'sale' ? rec.kind : undefined;
    items.push({
      menu_id,
      name,
      price,
      quantity,
      ...(volume ? { volume } : {}),
      ...(kind ? { kind } : {}),
    });
  }
  return { ok: true, items };
}

function order_id_ok(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id) || id.startsWith('demo-order');
}

async function sync_stock(id: string, items: order_item[], status: order['status'], date?: string) {
  await release_order_stock(id);
  if (status === 'cancelled') return;
  const stock_items = items.filter((item) => item.menu_id);
  if (!stock_items.length) return;
  await record_order_stock({
    orderId: id,
    items: stock_items,
    date,
    kind: stock_items.every((item) => item.kind === 'staff') ? 'staff' : 'sale',
  });
}

export async function PATCH(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    items?: unknown;
    status?: string;
  } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!order_id_ok(id)) {
    return NextResponse.json({ error: 'покупка не найдена' }, { status: 400 });
  }
  const parsed = parse_items(body?.items);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const status = body?.status;
  if (status != null && !statuses.has(status as order['status'])) {
    return NextResponse.json({ error: 'неверный статус' }, { status: 400 });
  }

  const total_price = parsed.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const patch: Partial<order> = {
    items: parsed.items,
    total_price,
    ...(status ? { status: status as order['status'] } : {}),
  };

  if (id.startsWith('demo-order')) {
    const updated = await update_demo_order(id, patch);
    if (!updated) return NextResponse.json({ error: 'покупка не найдена' }, { status: 404 });
    await sync_stock(id, parsed.items, updated.status, updated.created_at);
    return NextResponse.json({ order: updated });
  }

  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'supabase не настроен' }, { status: 500 });
  }

  const admin = create_service_client();
  const existing = await admin.from('orders').select('id, created_at, status').eq('id', id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ error: 'покупка не найдена' }, { status: 404 });

  const next_status = (status as order['status'] | undefined) || (existing.data.status as order['status']);
  const { data, error } = await admin
    .from('orders')
    .update({ ...patch, status: next_status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, items, total_price, status, payment_type, created_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'не удалось сохранить покупку' }, { status: 500 });
  }

  await sync_stock(id, parsed.items, next_status, existing.data.created_at as string);
  return NextResponse.json({ order: data });
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!order_id_ok(id)) {
    return NextResponse.json({ error: 'покупка не найдена' }, { status: 400 });
  }

  await release_order_stock(id);

  if (id.startsWith('demo-order')) {
    const removed = await delete_demo_order(id);
    if (!removed) return NextResponse.json({ error: 'покупка не найдена' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'supabase не настроен' }, { status: 500 });
  }

  const admin = create_service_client();
  const { error } = await admin.from('orders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
