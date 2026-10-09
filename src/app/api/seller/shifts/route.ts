import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  close_shift,
  get_shift,
  get_spot_day_shift,
  join_shift_crew,
  list_shifts,
} from '@/lib/shifts-server';

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
  const id = url.searchParams.get('id');
  if (id) {
    const shift = await get_shift(id);
    if (!shift) return NextResponse.json({ error: 'смена не найдена' }, { status: 404 });
    return NextResponse.json({ shift });
  }

  const spot_id = url.searchParams.get('spot_id') || undefined;
  const seller_id = url.searchParams.get('seller_id') || undefined;
  const shift_date = url.searchParams.get('shift_date') || undefined;
  const open_only = url.searchParams.get('open_only') === '1';

  // быстрый ответ: смена точки на день (выбор точки кассиром)
  if (spot_id && shift_date && !seller_id && !open_only && url.searchParams.get('day') === '1') {
    const shift = await get_spot_day_shift(spot_id, shift_date);
    return NextResponse.json({ shift });
  }

  const shifts = await list_shifts({
    spot_id,
    seller_id,
    shift_date,
    open_only,
  });

  return NextResponse.json({ shifts });
}

/**
 * Выбор точки больше не открывает смену.
 * POST только подтягивает уже открытую (или закрытую) смену точки на день.
 */
export async function POST(request: Request) {
  const role = await staff_role();
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as {
    spot_id?: string;
    shift_date?: string;
    seller_id?: string;
    seller_name?: string;
  };

  if (!body.spot_id) {
    return NextResponse.json({ error: 'неполные данные' }, { status: 400 });
  }

  let shift = await get_spot_day_shift(body.spot_id, body.shift_date);
  // если смена уже открыта — добавляем бариста в состав
  if (shift && !shift.closed_at && body.seller_id) {
    shift =
      (await join_shift_crew({
        spot_id: body.spot_id,
        shift_date: body.shift_date,
        seller_id: body.seller_id,
        seller_name: body.seller_name || 'бариста',
      })) || shift;
  }

  return NextResponse.json({
    shift,
    /** точка выбрана; смена откроется после чек-листа открытия */
    assignment_only: !shift || Boolean(shift.closed_at) ? true : false,
  });
}

/** ручное закрытие только для админа — кассир закрывает через чек-лист */
export async function PATCH(request: Request) {
  const role = await staff_role();
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'закрытие смены — через чек-лист закрытия' },
      { status: 403 }
    );
  }

  const body = (await request.json()) as { id?: string; action?: string };
  if (!body.id || body.action !== 'close') {
    return NextResponse.json({ error: 'неверные данные' }, { status: 400 });
  }

  const shift = await close_shift(body.id);
  if (!shift) return NextResponse.json({ error: 'смена не найдена' }, { status: 404 });
  return NextResponse.json({ shift });
}
