import type { menu_item } from '@/lib/types';

type cart_row = {
  menu_id: string;
  quantity: number;
  menu: menu_item | null;
};

async function cart_fetch(input: RequestInit & { json?: unknown } = {}) {
  const { json, ...init } = input;
  const res = await fetch('/api/cart', {
    ...init,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: json != null ? JSON.stringify(json) : init.body,
  });

  const body = (await res.json()) as { error?: string; items?: unknown[]; quantity?: number };
  return { res, body };
}

export async function add_to_cart(_user_id: string, item: menu_item, qty: number) {
  const { res, body } = await cart_fetch({
    method: 'POST',
    json: { menu_id: item.id, delta: qty },
  });
  return { error: res.ok ? null : new Error(body.error || 'cart failed') };
}

export async function upsert_cart_item(_user_id: string, menu_id: string, quantity: number) {
  const { res, body } = await cart_fetch({
    method: 'POST',
    json: { menu_id, quantity },
  });
  return { error: res.ok ? null : new Error(body.error || 'cart failed') };
}

export async function clear_cart(_user_id: string) {
  const { res, body } = await cart_fetch({ method: 'DELETE' });
  return { error: res.ok ? null : new Error(body.error || 'cart failed') };
}

export async function get_cart_items(_user_id: string) {
  const { res, body } = await cart_fetch({ method: 'GET' });
  if (!res.ok) {
    return { data: null, error: new Error(body.error || 'cart failed') };
  }
  return { data: (body.items || []) as cart_row[], error: null };
}
