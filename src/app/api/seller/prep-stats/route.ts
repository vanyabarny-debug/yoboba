import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { seller_id_cookie, seller_name_cookie, session_cookie } from '@/lib/session';
import {
  add_fulfillment_event,
  add_prep_event,
  get_barista_analytics,
} from '@/lib/prep-stats-server';
import { record_handed_order } from '@/lib/handed-orders-server';
import { moscow_today_iso } from '@/lib/order-number';
import type { fulfillment_event, order, prep_event } from '@/lib/types';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

async function cashier_from_cookie() {
  const store = await cookies();
  return {
    seller_id: store.get(seller_id_cookie)?.value || '',
    seller_name: store.get(seller_name_cookie)?.value || 'бариста',
  };
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
  const kind = body.kind as 'prep' | 'fulfillment' | 'sales';

  try {
    if (kind === 'sales') {
      const cashier = await cashier_from_cookie();
      if (!cashier.seller_id) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      const shift_date = (body.shift_date as string) || moscow_today_iso();
      const { completed_orders_for_day, remember_cashier_sales } = await import(
        '@/lib/cashier-sales-server'
      );
      const orders = await completed_orders_for_day(shift_date);
      await remember_cashier_sales({
        seller_id: cashier.seller_id,
        seller_name: cashier.seller_name,
        shift_date,
        orders,
      });
      return NextResponse.json({ ok: true, count: orders.length });
    }

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
      const finished_at = event.finished_at || new Date().toISOString();
      const shift_date = event.shift_date || moscow_today_iso();
      const snapshot = body.order as order | undefined;
      const [saved] = await Promise.all([
        add_fulfillment_event({ ...event, finished_at, shift_date }),
        record_handed_order({
          order:
            snapshot && snapshot.id
              ? snapshot
              : {
                  id: event.order_id,
                  user_id: '',
                  items: [],
                  total_price: 0,
                  status: 'completed',
                  payment_type: 'cash',
                  is_paid: true,
                  pickup_time: event.pickup_at || finished_at,
                  created_at: finished_at,
                },
          seller_id: event.seller_id,
          seller_name: event.seller_name || 'бариста',
          shift_date,
          handed_at: finished_at,
        }),
      ]);

      return NextResponse.json({ event: saved });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'не удалось записать';
    console.error('prep-stats POST', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ error: 'неизвестный kind' }, { status: 400 });
}
