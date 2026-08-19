import { NextResponse } from 'next/server';
import { resolve_gift_actor } from '@/lib/gift-actor';
import {
  create_gift,
  list_gifts_inbox,
  list_gifts_sent,
  public_gift_view,
} from '@/lib/gifts-server';
import type { order_item } from '@/lib/types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const actor = await resolve_gift_actor(request, {
    user_id: url.searchParams.get('user_id') || undefined,
    phone: url.searchParams.get('phone'),
  });
  if (!actor) {
    return NextResponse.json({ error: 'войдите, чтобы смотреть подарки' }, { status: 401 });
  }

  const [sent, inbox] = await Promise.all([
    list_gifts_sent(actor.id),
    actor.phone ? list_gifts_inbox(actor.phone) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    sent: sent.map(public_gift_view),
    inbox: inbox.map(public_gift_view),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    items?: order_item[];
    recipient_phone?: string;
    message?: string;
    sender_id?: string;
    sender_name?: string;
    sender_phone?: string | null;
  };

  const actor = await resolve_gift_actor(request, body);
  if (!actor) {
    return NextResponse.json({ error: 'войдите, чтобы подарить напиток' }, { status: 401 });
  }

  try {
    const gift = await create_gift({
      sender_id: actor.id,
      sender_name: actor.name,
      sender_phone: actor.phone,
      recipient_phone: String(body.recipient_phone || ''),
      items: body.items || [],
      message: body.message,
    });
    return NextResponse.json({ gift: public_gift_view(gift) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось создать подарок';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
