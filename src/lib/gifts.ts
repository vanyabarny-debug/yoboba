import type { gift, order, order_item } from '@/lib/types';

export const gift_status_label: Record<gift['status'], string> = {
  pending_payment: 'ждёт оплату',
  paid: 'можно забрать',
  claimed: 'готовим',
  redeemed: 'забрали',
  cancelled: 'не действует',
};

export function gift_items_label(items: order_item[]) {
  return items.map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(', ');
}

export type gift_actor = {
  id: string;
  name: string;
  phone: string | null;
};

export async function fetch_my_gifts(actor: gift_actor) {
  const qs = new URLSearchParams({
    user_id: actor.id,
    phone: actor.phone || '',
  });
  const res = await fetch(`/api/gifts?${qs.toString()}`, { credentials: 'same-origin' });
  const body = (await res.json()) as {
    sent?: gift[];
    inbox?: gift[];
    error?: string;
  };
  if (!res.ok) {
    return {
      sent: [] as gift[],
      inbox: [] as gift[],
      error: new Error(body.error || 'не удалось загрузить подарки'),
    };
  }
  return {
    sent: body.sent || [],
    inbox: body.inbox || [],
    error: null,
  };
}

export async function create_gift_checkout(input: {
  items: order_item[];
  recipient_phone: string;
  message?: string;
  actor: gift_actor;
}) {
  const res = await fetch('/api/gifts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: input.items,
      recipient_phone: input.recipient_phone,
      message: input.message || '',
      sender_id: input.actor.id,
      sender_name: input.actor.name,
      sender_phone: input.actor.phone,
    }),
  });
  const body = (await res.json()) as { gift?: gift; error?: string };
  if (!res.ok || !body.gift) {
    return { gift: null, error: new Error(body.error || 'не удалось создать подарок') };
  }
  return { gift: body.gift, error: null };
}

export async function confirm_gift_payment(id: string, actor: gift_actor) {
  const res = await fetch(`/api/gifts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'confirm_payment',
      sender_id: actor.id,
      sender_phone: actor.phone,
    }),
  });
  const body = (await res.json()) as { gift?: gift; error?: string };
  if (!res.ok || !body.gift) {
    return { gift: null, error: new Error(body.error || 'не удалось оплатить') };
  }
  return { gift: body.gift, error: null };
}

export async function claim_gift_pickup(input: {
  id: string;
  pickup_time: string;
  actor: gift_actor;
}) {
  const res = await fetch(`/api/gifts/${encodeURIComponent(input.id)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'claim',
      pickup_time: input.pickup_time,
      sender_id: input.actor.id,
      sender_phone: input.actor.phone,
    }),
  });
  const body = (await res.json()) as { gift?: gift; order?: order; error?: string };
  if (!res.ok || !body.gift) {
    return {
      gift: null,
      order: null,
      error: new Error(body.error || 'не удалось забрать подарок'),
    };
  }
  return { gift: body.gift, order: body.order ?? null, error: null };
}

export async function fetch_gift_by_id(id: string, actor: gift_actor) {
  const qs = new URLSearchParams({
    user_id: actor.id,
    phone: actor.phone || '',
  });
  const res = await fetch(`/api/gifts/${encodeURIComponent(id)}?${qs.toString()}`, {
    credentials: 'same-origin',
  });
  const body = (await res.json()) as { gift?: gift; error?: string };
  if (!res.ok || !body.gift) {
    return { gift: null, error: new Error(body.error || 'подарок не найден') };
  }
  return { gift: body.gift, error: null };
}
