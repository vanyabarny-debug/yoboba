import { NextResponse } from 'next/server';
import { normalize_phone } from '@/lib/phone';
import {
  cancel_gift,
  claim_gift,
  get_gift_by_id,
  mark_gift_paid,
  public_gift_view,
} from '@/lib/gifts-server';
import { resolve_gift_actor } from '@/lib/gift-actor';

type params = { params: Promise<{ id: string }> };

function can_see(gift: Awaited<ReturnType<typeof get_gift_by_id>>, actor: { id: string; phone: string | null }) {
  if (!gift) return false;
  if (gift.sender_id === actor.id) return true;
  const phone = normalize_phone(actor.phone);
  return Boolean(phone && phone === gift.recipient_phone);
}

export async function GET(request: Request, { params }: params) {
  const { id } = await params;
  const url = new URL(request.url);
  const actor = await resolve_gift_actor(request, {
    user_id: url.searchParams.get('user_id') || undefined,
    phone: url.searchParams.get('phone'),
  });
  if (!actor) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const gift = await get_gift_by_id(id);
  if (!gift || !can_see(gift, actor)) {
    return NextResponse.json({ error: 'подарок не найден' }, { status: 404 });
  }

  return NextResponse.json({ gift: public_gift_view(gift) });
}

export async function PATCH(request: Request, { params }: params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    pickup_time?: string;
    sender_id?: string;
    sender_name?: string;
    sender_phone?: string | null;
  };

  const actor = await resolve_gift_actor(request, body);
  if (!actor) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const gift = await get_gift_by_id(id);
  if (!gift) {
    return NextResponse.json({ error: 'подарок не найден' }, { status: 404 });
  }

  const action = String(body.action || '');

  if (action === 'confirm_payment') {
    if (gift.sender_id !== actor.id) {
      return NextResponse.json({ error: 'оплатить может только отправитель' }, { status: 403 });
    }
    if (gift.payment_provider !== 'stub') {
      return NextResponse.json(
        { error: 'оплата идёт через кассу — дождитесь подтверждения' },
        { status: 400 }
      );
    }
    const paid = await mark_gift_paid(id);
    if (!paid) {
      return NextResponse.json({ error: 'не удалось подтвердить оплату' }, { status: 400 });
    }
    return NextResponse.json({ gift: public_gift_view(paid) });
  }

  if (action === 'claim') {
    try {
      const result = await claim_gift({
        gift_id: id,
        actor_phone: actor.phone,
        actor_id: actor.id,
        pickup_time: String(body.pickup_time || ''),
      });
      return NextResponse.json({
        gift: public_gift_view(result.gift),
        order: result.order,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'не удалось забрать подарок';
      const status = /занято/.test(message) ? 409 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (action === 'cancel') {
    const cancelled = await cancel_gift(id, actor.id);
    if (!cancelled) {
      return NextResponse.json({ error: 'нельзя отменить этот подарок' }, { status: 400 });
    }
    return NextResponse.json({ gift: public_gift_view(cancelled) });
  }

  return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
}
