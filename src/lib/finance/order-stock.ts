import { read_published_menu } from '@/lib/menu-catalog-server';
import { upgrade_menu_store } from '@/lib/menu-store';
import {
  apply_order_consumption,
  bind_spot,
  commit_spot,
  consumption_for_items,
  format_stock_shortages,
  order_stock_shortages,
  resolve_stock_spot,
  reverse_order_consumption,
  type finance_state,
  type order_stock_item,
  type stock_shortage,
} from '@/lib/finance/model';
import {
  marinade_order_block,
  normalize_prep_stations,
  prep_station_id_for_material,
} from '@/lib/finance/prep-stations';
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

function marinade_stop(
  state: finance_state,
  items: order_stock_item[],
  menu: menu_item[]
): { error: string; shortages: stock_shortage_row[] } | null {
  const block = marinade_order_block(state, consumption_for_items(state, items, menu));
  if (!block) return null;
  const station = normalize_station(state, block.stationId);
  return {
    error: block.error,
    shortages: station
      ? [
          {
            materialId: station.cookedMaterialId,
            name: station.label,
            need: 0,
            have: 0,
            stationId: station.id,
          },
        ]
      : [],
  };
}

function normalize_station(state: finance_state, stationId: string) {
  return normalize_prep_stations(state.prepStations).find((s) => s.id === stationId) ?? null;
}

/** проверка до создания/правки заказа — без списания */
export async function assert_order_stock(opts: {
  items: order_stock_item[];
  /** при правке заказа: сначала «вернуть» его прошлый расход */
  releaseOrderId?: string;
  spotId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; shortages: stock_shortage_row[] }> {
  if (!opts.items.length) return { ok: true };
  try {
    const [full, menu] = await Promise.all([read_finance_state(), load_menu()]);
    const state = bind_spot(full, opts.spotId);
    const blocked = marinade_stop(state, opts.items, menu);
    if (blocked) return { ok: false, error: blocked.error, shortages: blocked.shortages };
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
  spotId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts.orderId || !opts.items.length) return { ok: true };
  try {
    const menu = await load_menu();
    const spot = resolve_stock_spot(opts.spotId);
    return await mutate_finance_state<{ ok: true } | { ok: false; error: string }>((full) => {
      const state = bind_spot(full, spot);
      const blocked = marinade_stop(state, opts.items, menu);
      if (blocked) return { state: null, value: { ok: false as const, error: blocked.error } };
      const shortages = order_stock_shortages(state, opts.items, menu, {
        releaseOrderId: opts.orderId,
      });
      if (shortages.length) {
        const error = format_stock_shortages(state, shortages);
        console.error('record_order_stock blocked', opts.orderId, error);
        return { state: null, value: { ok: false as const, error } };
      }
      return {
        state: commit_spot(
          full,
          spot,
          apply_order_consumption(state, {
            orderId: opts.orderId,
            items: opts.items,
            kind: opts.kind,
            date: opts.date,
            menu,
          })
        ),
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
  spotId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts.orderId) return { ok: true };
  try {
    const menu = opts.keep ? await load_menu() : [];
    const spot = resolve_stock_spot(opts.spotId);
    return await mutate_finance_state<{ ok: true } | { ok: false; error: string }>((state) => {
      const released = reverse_order_consumption(state, opts.orderId);
      if (!opts.keep || !opts.items.length) {
        const changed = released.stockMovements.length !== state.stockMovements.length;
        return { state: changed ? released : null, value: { ok: true as const } };
      }
      const view = bind_spot(released, spot);
      const blocked = marinade_stop(view, opts.items, menu);
      if (blocked) return { state: null, value: { ok: false as const, error: blocked.error } };
      const shortages = order_stock_shortages(view, opts.items, menu);
      if (shortages.length) {
        return {
          state: null,
          value: { ok: false as const, error: format_stock_shortages(view, shortages) },
        };
      }
      return {
        state: commit_spot(
          released,
          spot,
          apply_order_consumption(view, {
            orderId: opts.orderId,
            items: opts.items,
            kind: opts.kind,
            date: opts.date,
            menu,
          })
        ),
        value: { ok: true as const },
      };
    });
  } catch (e) {
    console.error('replace_order_stock', opts.orderId, e instanceof Error ? e.message : e);
    return { ok: false, error: 'не удалось обновить склад' };
  }
}
