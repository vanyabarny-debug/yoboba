import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { moscow_today_iso } from '@/lib/order-number';
import { shift_closed_message, shift_is_open } from '@/lib/shift-window';
import {
  list_shift_log,
  mark_shift_row,
  settle_shift_log,
  type shift_log_kind,
  type shift_log_status,
} from '@/lib/shift-log-server';

async function staff_role() {
  const store = await cookies();
  return store.get(session_cookie)?.value || null;
}

export async function GET(request: Request) {
  const role = await staff_role();
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const url = new URL(request.url);
  const shift_date = url.searchParams.get('shift_date') || moscow_today_iso();
  const spot_id = url.searchParams.get('spot_id') || undefined;
  const rows = await list_shift_log(shift_date, spot_id);
  return NextResponse.json({ rows });
}

const kinds = new Set<shift_log_kind>(['opening', 'closing', 'card', 'order']);
const positive = new Set<shift_log_status>(['пробил', 'закрыл', 'выдал']);

export async function POST(request: Request) {
  const role = await staff_role();
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    spot_id?: string;
    shift_date?: string;
    spot_address?: string;
    spot_city?: string;
    seller_name?: string;
    ref?: string;
    kind?: string;
    title?: string;
    status?: string;
    cards?: { ref: string; title: string; done: boolean; seller_name?: string | null }[];
    orders?: { ref: string; title: string; handed: boolean; seller_name?: string | null }[];
  } | null;

  if (!body?.spot_id) {
    return NextResponse.json({ error: 'не хватает точки' }, { status: 400 });
  }

  if (body.action === 'settle') {
    const result = await settle_shift_log({
      spot_id: body.spot_id,
      shift_date: body.shift_date,
      spot_address: body.spot_address,
      spot_city: body.spot_city,
      seller_name: body.seller_name,
      cards: body.cards,
      orders: body.orders,
    });
    return NextResponse.json(result);
  }

  if (
    !body.ref ||
    !kinds.has(body.kind as shift_log_kind) ||
    !positive.has(body.status as shift_log_status)
  ) {
    return NextResponse.json({ error: 'неверная запись' }, { status: 400 });
  }
  if (!shift_is_open() && body.kind !== 'order') {
    return NextResponse.json({ error: shift_closed_message }, { status: 409 });
  }
  await mark_shift_row({
    spot_id: body.spot_id,
    shift_date: body.shift_date || moscow_today_iso(),
    ref: body.ref,
    kind: body.kind as shift_log_kind,
    title: body.title || 'карточка',
    status: body.status as shift_log_status,
    seller_name: body.seller_name || null,
  });
  return NextResponse.json({ ok: true });
}
