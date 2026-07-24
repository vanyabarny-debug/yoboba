import type { order } from '@/lib/types';

const STORAGE_KEY = 'yoboba_active_order_id';
const EVENT = 'yoboba-active-order';

export const ACTIVE_ORDER_STATUSES: order['status'][] = ['new', 'preparing', 'ready'];

export function is_active_order_status(status: order['status']) {
  return ACTIVE_ORDER_STATUSES.includes(status);
}

export function get_active_order_id(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function set_active_order_id(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!id) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } }));
}

export function subscribe_active_order_id(cb: (id: string | null) => void) {
  function on_storage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) cb(e.newValue);
  }
  function on_custom(e: Event) {
    const detail = (e as CustomEvent<{ id: string | null }>).detail;
    cb(detail?.id ?? get_active_order_id());
  }
  window.addEventListener('storage', on_storage);
  window.addEventListener(EVENT, on_custom);
  return () => {
    window.removeEventListener('storage', on_storage);
    window.removeEventListener(EVENT, on_custom);
  };
}

export const order_status_ui: Record<
  order['status'],
  { title: string; hint: string; short: string }
> = {
  new: { title: 'принят', hint: 'заказ ушёл на точку', short: 'принят' },
  preparing: { title: 'готовим', hint: 'бариста уже за работой', short: 'готовим' },
  ready: { title: 'готов', hint: 'можно забирать', short: 'готов' },
  completed: { title: 'выдан', hint: 'приятного!', short: 'выдан' },
  cancelled: { title: 'отменён', hint: 'заказ отменён', short: 'отменён' },
};

export const track_step_ids: order['status'][] = ['new', 'preparing', 'ready', 'completed'];

export function order_status_rank(status: order['status']) {
  if (status === 'cancelled') return -1;
  return track_step_ids.indexOf(status);
}
