import { read_published_menu } from '@/lib/menu-catalog-server';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import { apply_order_consumption, reverse_order_consumption, type order_stock_item } from '@/lib/finance/model';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import type { menu_item } from '@/lib/types';

async function load_menu(): Promise<menu_item[]> {
  const stored = await read_published_menu();
  if (stored && stored.version >= store_version && stored.items?.length) {
    return merge_menu_item_catalog(stored.items);
  }
  return get_default_store().items;
}

export async function record_order_stock(opts: {
  orderId: string;
  items: order_stock_item[];
  kind?: 'sale' | 'staff';
  date?: string;
}) {
  if (!opts.orderId || !opts.items.length) return;
  try {
    const [state, menu] = await Promise.all([read_finance_state(), load_menu()]);
    const next = apply_order_consumption(state, {
      orderId: opts.orderId,
      items: opts.items,
      kind: opts.kind,
      date: opts.date,
      menu,
    });
    await write_finance_state(next);
  } catch (e) {
    console.error('record_order_stock', opts.orderId, e instanceof Error ? e.message : e);
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
