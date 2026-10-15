import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { staff_actor } from '@/lib/staff-actor';
import {
  create_operation,
  list_ledger,
  list_operations,
  type operations_sort,
} from '@/lib/admin-operations-server';
import { list_order_audit } from '@/lib/order-audit-server';
import { delete_order, parse_order_items, revise_order, set_sale_payment } from '@/lib/order-revise-server';
import { write_money_anchor } from '@/lib/money-anchor';
import type { order } from '@/lib/types';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

const sorts = new Set<operations_sort>([
  'created_at_desc',
  'created_at_asc',
  'total_desc',
  'total_asc',
  'customer_asc',
]);

const statuses = new Set<order['status']>([
  'new',
  'preparing',
  'ready',
  'completed',
  'cancelled',
]);

const payments = new Set<order['payment_type']>(['cash', 'card', 'online', 'bonus']);

export async function GET(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('feed') === '1') {
    const feed = await list_ledger({
      spot_id: url.searchParams.get('spot_id') || undefined,
    });
    return NextResponse.json(feed);
  }
  if (url.searchParams.get('audit') === '1') {
    const events = await list_order_audit();
    return NextResponse.json({ events });
  }

  const sort_raw = url.searchParams.get('sort') || 'created_at_desc';
  const status_raw = url.searchParams.get('status') || 'all';
  const payment_raw = url.searchParams.get('payment') || 'all';

  const result = await list_operations({
    q: url.searchParams.get('q') || undefined,
    status:
      status_raw === 'all' || statuses.has(status_raw as order['status'])
        ? (status_raw as order['status'] | 'all')
        : 'all',
    payment:
      payment_raw === 'all' || payments.has(payment_raw as order['payment_type'])
        ? (payment_raw as order['payment_type'] | 'all')
        : 'all',
    spot_id: url.searchParams.get('spot_id') || undefined,
    from: url.searchParams.get('from') || undefined,
    to: url.searchParams.get('to') || undefined,
    sort: sorts.has(sort_raw as operations_sort)
      ? (sort_raw as operations_sort)
      : 'created_at_desc',
    page: Number(url.searchParams.get('page') || 1),
    page_size: Number(url.searchParams.get('page_size') || 40),
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    items?: unknown;
    customer_name?: string;
    customer_phone?: string | null;
    payment_type?: string;
    status?: string;
    is_paid?: boolean;
    spot_id?: string | null;
    user_id?: string | null;
  } | null;

  const payment =
    body?.payment_type && payments.has(body.payment_type as order['payment_type'])
      ? (body.payment_type as order['payment_type'])
      : 'cash';
  const status =
    body?.status && statuses.has(body.status as order['status'])
      ? (body.status as order['status'])
      : 'completed';

  const result = await create_operation({
    items: body?.items,
    customer_name: body?.customer_name,
    customer_phone: body?.customer_phone,
    payment_type: payment,
    status,
    is_paid: body?.is_paid,
    spot_id: body?.spot_id,
    user_id: body?.user_id,
    actor,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ operation: result.operation });
}

export async function PATCH(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    items?: unknown;
    status?: string;
    payment_type?: string;
    anchor?: { cash?: number; card?: number };
  } | null;

  if (body?.anchor && typeof body.anchor === 'object') {
    const cash = Number(body.anchor.cash);
    const card = Number(body.anchor.card);
    if (!Number.isFinite(cash) || !Number.isFinite(card)) {
      return NextResponse.json({ error: 'укажите нал и безнал' }, { status: 400 });
    }
    const anchor = await write_money_anchor(cash, card);
    return NextResponse.json({ anchor });
  }

  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if ((body?.payment_type === 'cash' || body?.payment_type === 'card') && !body.items) {
    const result = await set_sale_payment({ id, payment: body.payment_type, actor });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ payment: result.payment });
  }
  const parsed = parse_order_items(body?.items);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const status = body?.status;
  if (status != null && !statuses.has(status as order['status'])) {
    return NextResponse.json({ error: 'неверный статус' }, { status: 400 });
  }

  const result = await revise_order({
    id,
    items: parsed.items,
    ...(status ? { status: status as order['status'] } : {}),
    actor,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ order: result.order });
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const result = await delete_order({ id, actor });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
