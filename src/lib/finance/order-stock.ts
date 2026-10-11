import { read_published_menu } from '@/lib/menu-catalog-server';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import {
  apply_order_consumption,
  format_stock_shortages,
  order_stock_shortages,
  reverse_order_consumption,
  type order_stock_item,
} from '@/lib/finance/model';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import type { menu_item } from '@/lib/types';

async function load_menu(): Promise<menu_item[]> {
  const stored = await read_published_menu();
  if (stored && stored.version >= store_version && stored.items?.length) {
    return merge_menu_item_catalog(stored.items, stored.removed_item_ids ?? []);
  }
  return get_default_store().items;
}

/** проверка до создания/правки заказа — без списания */
export async function assert_order_stock(opts: {
  items: order_stock_item[];
  /** при правке заказа: сначала «вернуть» его прошлый расход */
  releaseOrderId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts.items.length) return { ok: true };
  try {
    const [state, menu] = await Promise.all([read_finance_state(), load_menu()]);
    const shortages = order_stock_shortages(state, opts.items, menu, {
      releaseOrderId: opts.releaseOrderId,
    });
    if (!shortages.length) return { ok: true };
    return { ok: false, error: format_stock_shortages(state, shortages) };
  } catch (e) {
    console.error('assert_order_stock', e instanceof Error ? e.message : e);
    return { ok: false, error: 'не удалось проверить склад' };
  }
}

export async function record_order_stock(opts: {
  orderId: string;
  items: order_stock_item[];
  kind?: 'sale' | 'staff';
  date?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts.orderId || !opts.items.length) return { ok: true };
  try {
    const [state, menu] = await Promise.all([read_finance_state(), load_menu()]);
    const shortages = order_stock_shortages(state, opts.items, menu, {
      releaseOrderId: opts.orderId,
    });
    if (shortages.length) {
      const error = format_stock_shortages(state, shortages);
      console.error('record_order_stock blocked', opts.orderId, error);
      return { ok: false, error };
    }
    const next = apply_order_consumption(state, {
      orderId: opts.orderId,
      items: opts.items,
      kind: opts.kind,
      date: opts.date,
      menu,
    });
    await write_finance_state(next);
    return { ok: true };
  } catch (e) {
    console.error('record_order_stock', opts.orderId, e instanceof Error ? e.message : e);
    return { ok: false, error: 'не удалось списать со склада' };
  }
}

export async function release_order_stock(orderId: string) {
  if (!orderId) return;
  try {
    const state = await read_finance_state();
    const next = reverse_order_consumption(state, orderId);
    if (next.stockMovements.length === state.stockMovements.length) return;
    await write_finance_state(next);
  } catch (e) {
    console.error('release_order_stock', orderId, e instanceof Error ? e.message : e);
  }
}
