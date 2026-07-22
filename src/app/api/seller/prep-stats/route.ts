import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  add_fulfillment_event,
  add_prep_event,
  get_barista_analytics,
} from '@/lib/prep-stats-server';
import { moscow_today_iso } from '@/lib/order-number';
import type { fulfillment_event, prep_event } from '@/lib/types';

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
  const shift_date = url.searchParams.get('shift_date') || moscow_today_iso();
  const seller_id = url.searchParams.get('seller_id') || undefined;

  const analytics = await get_barista_analytics({ shift_date, seller_id });
  return NextResponse.json({ analytics });
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = await request.json();
  const kind = body.kind as 'prep' | 'fulfillment';

  if (kind === 'prep') {
    const event = body.event as Omit<prep_event, 'id' | 'drink_pace' | 'shift_date'> & {
      id?: string;
      drink_pace?: prep_event['drink_pace'];
      shift_date?: string;
    };
    if (!event?.seller_id || !event.order_id || !event.drink_name) {
      return NextResponse.json({ error: 'неполные данные' }, { status: 400 });
    }
    const saved = await add_prep_event(event);
    return NextResponse.json({ event: saved });
  }

  if (kind === 'fulfillment') {
    const event = body.event as Omit<
      fulfillment_event,
      'id' | 'timing' | 'shift_date' | 'duration_ms'
    > & {
      id?: string;
      timing?: fulfillment_event['timing'];
      shift_date?: string;
      duration_ms?: number;
    };
    if (!event?.seller_id || !event.order_id) {
      return NextResponse.json({ error: 'неполные данные' }, { status: 400 });
    }
    const saved = await add_fulfillment_event(event);
    return NextResponse.json({ event: saved });
  }

  return NextResponse.json({ error: 'неизвестный kind' }, { status: 400 });
}
