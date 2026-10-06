import { forget_cash_for_order, retitle_cash_for_order } from '@/lib/cash-server';
import { delete_demo_order, get_demo_orders, update_demo_order } from '@/lib/demo-orders-server';
import { record_order_stock, release_order_stock } from '@/lib/finance/order-stock';
import type { stock_actor } from '@/lib/finance/model';
import { forget_handed_order, replace_handed_snapshot } from '@/lib/handed-orders-server';
import { format_order_number } from '@/lib/order-number';
import { record_order_audit } from '@/lib/order-audit-server';
import { forget_order_activity } from '@/lib/prep-stats-server';
import { clear_order_prep } from '@/lib/seller-prep-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { order, order_item } from '@/lib/types';

const statuses = new Set<order['status']>(['new', 'preparing', 'ready', 'completed', 'cancelled']);

export function order_id_ok(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id) || id.startsWith('demo-order');
}

export function parse_order_items(raw: unknown): { ok: true; items: order_item[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) {
    return { ok: false, error: 'в заказе нужна хотя бы одна позиция' };
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
    const temp = rec.temp === 'cold' || rec.temp === 'hot' ? rec.temp : undefined;
    const kind = rec.kind === 'staff' || rec.kind === 'sale' ? rec.kind : undefined;
    items.push({
      menu_id,
      name,
      price,
      quantity,
      ...(volume ? { volume } : {}),
      ...(temp ? { temp } : {}),
      ...(kind ? { kind } : {}),
    });
  }
  return { ok: true, items };
}

function items_text(items: order_item[]) {
  return items.map((item) => `${item.name} ×${item.quantity}`).join(', ');
}

function same_items(a: order_item[], b: order_item[]) {
  return items_text(a) === items_text(b) && a.every((item, i) => item.price === b[i]?.price);
}

async function load_order(id: string): Promise<order | null> {
  if (id.startsWith('demo-order')) {
    const all = await get_demo_orders(false);
    return all.find((row) => row.id === id) || null;
  }
  if (!is_supabase_configured()) return null;
  const admin = create_service_client();
  const { data, error } = await admin.from('orders').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data as order;
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

export async function revise_order(input: {
  id: string;
  items: order_item[];
  status?: order['status'];
  actor: stock_actor;
}): Promise<{ ok: true; order: order } | { ok: false; error: string; status: number }> {
  if (!order_id_ok(input.id)) return { ok: false, error: 'заказ не найден', status: 400 };
  if (input.status && !statuses.has(input.status)) {
    return { ok: false, error: 'неверный статус', status: 400 };
  }

  const existing = await load_order(input.id);
  if (!existing) return { ok: false, error: 'заказ не найден', status: 404 };

  const next_status = input.status || existing.status;
  const total_price = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const patch: Partial<order> = {
    items: input.items,
    total_price,
    status: next_status,
  };

  let updated: order | null = null;
  if (input.id.startsWith('demo-order')) {
    updated = await update_demo_order(input.id, patch);
  } else {
    if (!is_supabase_configured()) return { ok: false, error: 'supabase не настроен', status: 500 };
    const admin = create_service_client();
    const { data, error } = await admin
      .from('orders')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message || 'не удалось сохранить заказ', status: 500 };
    }
    updated = data as order;
  }
  if (!updated) return { ok: false, error: 'заказ не найден', status: 404 };

  await sync_stock(input.id, input.items, updated.status, existing.created_at);
  await replace_handed_snapshot(updated);
  await retitle_cash_for_order(input.id, total_price, items_text(input.items));

  if (!same_items(existing.items || [], input.items) || existing.status !== next_status) {
    await record_order_audit({
      action: 'update',
      actor_id: input.actor.id,
      actor_name: input.actor.name,
      order_id: input.id,
      order_label: `№${format_order_number(existing)}`,
      before: items_text(existing.items || []),
      after: items_text(input.items),
      before_total: Number(existing.total_price) || 0,
      after_total: total_price,
    });
  }

  return { ok: true, order: updated };
}

export async function delete_order(input: {
  id: string;
  actor: stock_actor;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!order_id_ok(input.id)) return { ok: false, error: 'заказ не найден', status: 400 };
  const existing = await load_order(input.id);
  if (!existing) return { ok: false, error: 'заказ не найден', status: 404 };

  await release_order_stock(input.id);

  if (input.id.startsWith('demo-order')) {
    const removed = await delete_demo_order(input.id);
    if (!removed) return { ok: false, error: 'заказ не найден', status: 404 };
  } else {
    if (!is_supabase_configured()) return { ok: false, error: 'supabase не настроен', status: 500 };
    const admin = create_service_client();
    const { error } = await admin.from('orders').delete().eq('id', input.id);
    if (error) return { ok: false, error: error.message, status: 500 };
  }

  await forget_handed_order(input.id);
  await forget_cash_for_order(input.id);
  await forget_order_activity(input.id);
  await clear_order_prep(input.id).catch(() => {});

  await record_order_audit({
    action: 'delete',
    actor_id: input.actor.id,
    actor_name: input.actor.name,
    order_id: input.id,
    order_label: `№${format_order_number(existing)}`,
    before: items_text(existing.items || []),
    after: null,
    before_total: Number(existing.total_price) || 0,
    after_total: null,
  });

  return { ok: true };
}
