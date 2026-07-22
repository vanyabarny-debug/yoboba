import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { add_transaction, calc_day_summary, get_transactions } from '@/lib/cash-server';
import { moscow_today_iso } from '@/lib/order-number';
import type { cash_transaction } from '@/lib/types';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const url = new URL(request.url);
  const shift_date = url.searchParams.get('shift_date') || undefined;
  const shift_id = url.searchParams.get('shift_id') || undefined;
  const spot_id = url.searchParams.get('spot_id') || undefined;
  const seller_id = url.searchParams.get('seller_id') || undefined;

  const transactions = await get_transactions({ shift_date, shift_id, spot_id, seller_id });
  const summary = shift_date ? await calc_day_summary(shift_date, transactions) : null;

  return NextResponse.json({ transactions, summary });
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as cash_transaction;
  if (!body.seller_id || !body.order_total || !body.payment_method) {
    return NextResponse.json({ error: 'неполные данные' }, { status: 400 });
  }

  const tx = await add_transaction({
    ...body,
    id: body.id || `cash-${Date.now()}`,
    created_at: body.created_at || new Date().toISOString(),
    shift_date: body.shift_date || moscow_today_iso(),
    spot_id: body.spot_id || null,
    spot_address: body.spot_address || null,
    shift_id: body.shift_id || null,
  });

  return NextResponse.json({ transaction: tx });
}
