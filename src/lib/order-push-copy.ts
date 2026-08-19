import { format_order_number } from '@/lib/order-number';
import type { order } from '@/lib/types';

export type order_push_payload = {
  /** в шторке сверху — суть события; бренд iOS/Android сами пишут как from yomoyo */
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

/** title = статус, не бренд: ОС уже показывает «from yomoyo» */
export function build_order_status_push(
  order: Pick<order, 'id' | 'status' | 'pickup_time' | 'order_number' | 'order_day' | 'created_at'>
): order_push_payload {
  const num = format_order_number(order);
  const when = pickup_hm(order.pickup_time);
  const url = `/orders/${order.id}`;

  const base = {
    tag: `yoboba-order-${order.id}`,
    renotify: true,
    data: { url, order_id: order.id, status: order.status },
  };

  switch (order.status) {
    case 'new':
      return {
        ...base,
        title: `заказ № ${num} принят`,
        body: when ? `заберёте в ${when}` : 'уже на точке',
        requireInteraction: false,
        vibrate: [80, 40, 80],
      };
    case 'preparing':
      return {
        ...base,
        title: `готовим № ${num}`,
        body: when
          ? `бариста за работой · к ${when}`
          : 'бариста уже взбивает напиток',
        requireInteraction: false,
        vibrate: [100, 50, 100, 50, 100],
      };
    case 'ready':
      return {
        ...base,
        title: `готово · № ${num}`,
        body: 'можно забирать на кассе',
        requireInteraction: true,
        vibrate: [200, 80, 200, 80, 400],
      };
    case 'completed':
      return {
        ...base,
        title: `№ ${num} выдан`,
        body: 'приятного! ждём снова',
        requireInteraction: false,
        vibrate: [60],
      };
    case 'cancelled':
      return {
        ...base,
        title: `заказ № ${num} отменён`,
        body: 'если что — напишите нам',
        requireInteraction: false,
        vibrate: [40, 40, 40],
      };
    default:
      return {
        ...base,
        title: `заказ № ${num}`,
        body: 'обновление статуса',
        requireInteraction: false,
        vibrate: [80],
      };
  }
}
