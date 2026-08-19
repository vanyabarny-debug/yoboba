import { NextResponse } from 'next/server';
import { get_gift_by_id, mark_gift_paid, public_gift_view } from '@/lib/gifts-server';

/**
 * Webhook кассы. Когда подключим провайдера — проверять подпись и
 * `payment_id`, затем вызывать `mark_gift_paid`.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    gift_id?: string;
    payment_id?: string;
    status?: string;
  };

  const secret = process.env.KASSA_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get('x-kassa-signature') || '';
    if (header !== secret) {
      return NextResponse.json({ error: 'неверная подпись' }, { status: 401 });
    }
  } else {
    return NextResponse.json(
      { error: 'касса ещё не подключена' },
      { status: 501 }
    );
  }

  const gift_id = String(body.gift_id || '');
  if (!gift_id) {
    return NextResponse.json({ error: 'нет gift_id' }, { status: 400 });
  }

  const current = await get_gift_by_id(gift_id);
  if (!current) {
    return NextResponse.json({ error: 'подарок не найден' }, { status: 404 });
  }

  if (body.status && body.status !== 'paid' && body.status !== 'succeeded') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const paid = await mark_gift_paid(gift_id, body.payment_id || current.payment_id);
  if (!paid) {
    return NextResponse.json({ error: 'не удалось отметить оплату' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, gift: public_gift_view(paid) });
}
