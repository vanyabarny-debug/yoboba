import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  close_shift,
  get_shift,
  list_shifts,
  open_or_resume_shift,
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

  // продавец видит свои; админ — все (или фильтр)
  const shifts = await list_shifts({
    spot_id,
    seller_id: role === 'seller' && seller_id ? seller_id : role === 'admin' ? seller_id : seller_id,
    shift_date,
    open_only,
  });

  return NextResponse.json({ shifts });
}

export async function POST(request: Request) {
  const role = await staff_role();
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as {
    spot_id?: string;
    spot_address?: string;
    spot_city?: string;
    seller_id?: string;
    seller_name?: string;
  };

  if (!body.spot_id || !body.seller_id || !body.seller_name) {
    return NextResponse.json({ error: 'неполные данные' }, { status: 400 });
  }

  const shift = await open_or_resume_shift({
    spot_id: body.spot_id,
    spot_address: body.spot_address || '',
    spot_city: body.spot_city || '',
    seller_id: body.seller_id,
    seller_name: body.seller_name,
  });

  return NextResponse.json({ shift });
}

export async function PATCH(request: Request) {
  const role = await staff_role();
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as { id?: string; action?: string };
  if (!body.id || body.action !== 'close') {
    return NextResponse.json({ error: 'неверные данные' }, { status: 400 });
  }

  const shift = await close_shift(body.id);
  if (!shift) return NextResponse.json({ error: 'смена не найдена' }, { status: 404 });
  return NextResponse.json({ shift });
}
