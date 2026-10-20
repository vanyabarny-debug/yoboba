import { read_published_menu } from '@/lib/menu-catalog-server';
import { upgrade_menu_store } from '@/lib/menu-store';
import {
  apply_order_consumption,
  format_stock_shortages,
  order_stock_shortages,
  reverse_order_consumption,
  type order_stock_item,
  type stock_shortage,
} from '@/lib/finance/model';
import { prep_station_id_for_material } from '@/lib/finance/prep-stations';
import { mutate_finance_state, read_finance_state } from '@/lib/finance/finance-server';
import type { menu_item } from '@/lib/types';

export type stock_shortage_row = stock_shortage & { stationId: string | null };

function enrich_shortages(
  state: Parameters<typeof prep_station_id_for_material>[0],
  rows: stock_shortage[]
): stock_shortage_row[] {
  return rows.map((s) => ({
    ...s,
    stationId: prep_station_id_for_material(state, s.materialId),
  }));
}

async function load_menu(): Promise<menu_item[]> {
  return upgrade_menu_store(await read_published_menu()).items;
}

/** проверка до создания/правки заказа — без списания */
export async function assert_order_stock(opts: {
  items: order_stock_item[];
  /** при правке заказа: сначала «вернуть» его прошлый расход */
  releaseOrderId?: string;
}): Promise<{ ok: true } | { ok: false; error: string; shortages: stock_shortage_row[] }> {
  if (!opts.items.length) return { ok: true };
  try {
    const [state, menu] = await Promise.all([read_finance_state(), load_menu()]);
    const shortages = enrich_shortages(
      state,
      order_stock_shortages(state, opts.items, menu, {
        releaseOrderId: opts.releaseOrderId,
      })
    );
    if (!shortages.length) return { ok: true };
    return { ok: false, error: format_stock_shortages(state, shortages), shortages };
  } catch (e) {
    console.error('assert_order_stock', e instanceof Error ? e.message : e);
    return { ok: false, error: 'не удалось проверить склад', shortages: [] };
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
    const menu = await load_menu();
    return await mutate_finance_state<{ ok: true } | { ok: false; error: string }>((state) => {
      const shortages = order_stock_shortages(state, opts.items, menu, {
        releaseOrderId: opts.orderId,
      });
      if (shortages.length) {
        const error = format_stock_shortages(state, shortages);
        console.error('record_order_stock blocked', opts.orderId, error);
        return { state: null, value: { ok: false as const, error } };
      }
      return {
        state: apply_order_consumption(state, {
          orderId: opts.orderId,
          items: opts.items,
          kind: opts.kind,
          date: opts.date,
          menu,
        }),
        value: { ok: true as const },
      };
    });
  } catch (e) {
    console.error('record_order_stock', opts.orderId, e instanceof Error ? e.message : e);
    return { ok: false, error: 'не удалось списать со склада' };
  }
}

export async function release_order_stock(orderId: string) {
  if (!orderId) return;
  try {
    await mutate_finance_state((state) => {
      const next = reverse_order_consumption(state, orderId);
      if (next.stockMovements.length === state.stockMovements.length) {
        return { state: null, value: undefined };
      }
      return { state: next, value: undefined };
    });
  } catch (e) {
    console.error('release_order_stock', orderId, e instanceof Error ? e.message : e);
  }
}

/** снять старый расход заказа и записать новый одним сохранением */
export async function replace_order_stock(opts: {
  orderId: string;
  items: order_stock_item[];
  keep: boolean;
  kind?: 'sale' | 'staff';
  date?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts.orderId) return { ok: true };
  try {
    const menu = opts.keep ? await load_menu() : [];
    return await mutate_finance_state<{ ok: true } | { ok: false; error: string }>((state) => {
      const released = reverse_order_consumption(state, opts.orderId);
      if (!opts.keep || !opts.items.length) {
        const changed = released.stockMovements.length !== state.stockMovements.length;
        return { state: changed ? released : null, value: { ok: true as const } };
      }
      const shortages = order_stock_shortages(released, opts.items, menu);
      if (shortages.length) {
        return {
          state: null,
          value: { ok: false as const, error: format_stock_shortages(released, shortages) },
        };
      }
      return {
        state: apply_order_consumption(released, {
          orderId: opts.orderId,
          items: opts.items,
          kind: opts.kind,
          date: opts.date,
          menu,
        }),
        value: { ok: true as const },
      };
    });
  } catch (e) {
    console.error('replace_order_stock', opts.orderId, e instanceof Error ? e.message : e);
    return { ok: false, error: 'не удалось обновить склад' };
  }
}
