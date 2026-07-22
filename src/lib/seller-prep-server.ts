import { read_json_store, write_json_store } from '@/lib/data-store';

export type seller_prep_state = {
  started_at: number | null;
  done: boolean;
  finished_at?: number | null;
};

export type seller_prep_map = Record<string, Record<string, seller_prep_state>>;

const store_key = 'seller-prep-state';

export async function get_seller_prep_map(): Promise<seller_prep_map> {
  return read_json_store<seller_prep_map>(store_key, {});
}

export async function save_seller_prep_map(map: seller_prep_map): Promise<void> {
  await write_json_store(store_key, map);
}

export async function set_order_prep(
  order_id: string,
  prep: Record<string, seller_prep_state>
): Promise<seller_prep_map> {
  const all = await get_seller_prep_map();
  all[order_id] = prep;
  await save_seller_prep_map(all);
  return all;
}

export async function clear_order_prep(order_id: string): Promise<void> {
  const all = await get_seller_prep_map();
  if (!(order_id in all)) return;
  delete all[order_id];
  await save_seller_prep_map(all);
}
