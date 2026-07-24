import { BRAND_NAME } from '@/lib/brand';
import { format_order_number } from '@/lib/order-number';
import type { order } from '@/lib/types';

export type order_push_payload = {
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

/** красивые тексты пуша по статусу заказа */
export function build_order_status_push(order: Pick<order, 'id' | 'status' | 'pickup_time' | 'order_number' | 'order_day' | 'created_at'>): order_push_payload {
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
        title: `${BRAND_NAME} · заказ № ${num}`,
        body: when
          ? `принят ✓  ·  заберёте в ${when}`
          : 'принят ✓  ·  заказ уже на точке',
        requireInteraction: false,
        vibrate: [80, 40, 80],
      };
    case 'preparing':
      return {
        ...base,
        title: `готовим № ${num}`,
        body: when
          ? `бариста за работой  ·  к ${when}`
          : 'бариста уже взбивает ваш напиток',
        requireInteraction: false,
        vibrate: [100, 50, 100, 50, 100],
      };
    case 'ready':
      return {
        ...base,
        title: `готово · № ${num}`,
        body: 'можно забирать на кассе — ждём вас',
        requireInteraction: true,
        vibrate: [200, 80, 200, 80, 400],
      };
    case 'completed':
      return {
        ...base,
        title: `выдан · № ${num}`,
        body: `приятного! спасибо, что выбрали ${BRAND_NAME}`,
        requireInteraction: false,
        vibrate: [60],
      };
    case 'cancelled':
      return {
        ...base,
        title: `заказ № ${num} отменён`,
        body: 'если что-то пошло не так — напишите нам',
        requireInteraction: false,
        vibrate: [40, 40, 40],
      };
    default:
      return {
        ...base,
        title: `${BRAND_NAME} · № ${num}`,
        body: 'обновление по заказу',
        requireInteraction: false,
        vibrate: [80],
      };
  }
}
