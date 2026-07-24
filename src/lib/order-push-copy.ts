import { BRAND_NAME } from '@/lib/brand';
import { format_order_number } from '@/lib/order-number';
import type { order } from '@/lib/types';

export type order_push_payload = {
  /** в шторке уведомлений сверху — бренд */
  title: string;
  body: string;
  tag: string;
  renotify: boolean;
  requireInteraction: boolean;
  vibrate: number[];
  data: {
    url: string;
    order_id: string;
    status: order['status'];
  };
};

function pickup_hm(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** красивые пуши: title = бренд (центр внимания в шторке), body = статус */
export function build_order_status_push(
  order: Pick<order, 'id' | 'status' | 'pickup_time' | 'order_number' | 'order_day' | 'created_at'>
): order_push_payload {
  const num = format_order_number(order);
  const when = pickup_hm(order.pickup_time);
  const url = `/orders/${order.id}`;

  const base = {
    title: BRAND_NAME,
    tag: `yoboba-order-${order.id}`,
    renotify: true,
    data: { url, order_id: order.id, status: order.status },
  };

  switch (order.status) {
    case 'new':
      return {
        ...base,
        body: when
          ? `заказ № ${num} принят\nзаберёте в ${when}`
          : `заказ № ${num} принят\nуже на точке`,
        requireInteraction: false,
        vibrate: [80, 40, 80],
      };
    case 'preparing':
      return {
        ...base,
        body: when
          ? `готовим № ${num}\nбариста за работой · к ${when}`
          : `готовим № ${num}\nбариста уже взбивает напиток`,
        requireInteraction: false,
        vibrate: [100, 50, 100, 50, 100],
      };
    case 'ready':
      return {
        ...base,
        body: `готово · № ${num}\nможно забирать на кассе`,
        requireInteraction: true,
        vibrate: [200, 80, 200, 80, 400],
      };
    case 'completed':
      return {
        ...base,
        body: `№ ${num} выдан\nприятного! ждём снова`,
        requireInteraction: false,
        vibrate: [60],
      };
    case 'cancelled':
      return {
        ...base,
        body: `заказ № ${num} отменён\nесли что — напишите нам`,
        requireInteraction: false,
        vibrate: [40, 40, 40],
      };
    default:
      return {
        ...base,
        body: `заказ № ${num}\nобновление статуса`,
        requireInteraction: false,
        vibrate: [80],
      };
  }
}
