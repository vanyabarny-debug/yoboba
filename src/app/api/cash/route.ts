import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { add_transaction, calc_day_summary, get_transactions } from '@/lib/cash-server';
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

  const shift_date = new URL(request.url).searchParams.get('shift_date') || undefined;
  const transactions = get_transactions(shift_date);
  const summary = shift_date ? calc_day_summary(shift_date, transactions) : null;

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

  const tx = add_transaction({
    ...body,
    id: body.id || `cash-${Date.now()}`,
    created_at: body.created_at || new Date().toISOString(),
    shift_date: body.shift_date || new Date().toISOString().slice(0, 10),
  });

  return NextResponse.json({ transaction: tx });
}
