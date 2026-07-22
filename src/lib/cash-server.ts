import { read_json_store, write_json_store } from '@/lib/data-store';
import type { cash_transaction, day_summary } from '@/lib/types';

const store_key = 'cash-transactions';

async function load_transactions(): Promise<cash_transaction[]> {
  return read_json_store<cash_transaction[]>(store_key, []);
}

async function save_transactions(transactions: cash_transaction[]) {
  await write_json_store(store_key, transactions);
}

export type cash_filters = {
  shift_date?: string;
  shift_id?: string;
  spot_id?: string;
  seller_id?: string;
};

export async function get_transactions(filters: cash_filters | string = {}): Promise<cash_transaction[]> {
  const all = await load_transactions();
  const f: cash_filters = typeof filters === 'string' ? { shift_date: filters } : filters || {};
  return all.filter((t) => {
    if (f.shift_id) {
      const exact = t.shift_id === f.shift_id;
      const orphan_same_day =
        !t.shift_id &&
        Boolean(f.shift_date) &&
        t.shift_date === f.shift_date &&
        (!f.spot_id || !t.spot_id || t.spot_id === f.spot_id);
      if (!exact && !orphan_same_day) return false;
    } else if (f.shift_date && t.shift_date !== f.shift_date) {
      return false;
    }

    if (f.spot_id && t.spot_id && t.spot_id !== f.spot_id) return false;
    if (f.seller_id && t.seller_id !== f.seller_id) return false;
    return true;
  });
}

/** записать оплату в кассу; повтор по order_id не дублирует */
export async function record_cash_for_order(
  tx: Omit<cash_transaction, 'id' | 'created_at'> & {
    id?: string;
    created_at?: string;
  }
): Promise<cash_transaction> {
  const all = await load_transactions();
  if (tx.order_id) {
    const existing = all.find((t) => t.order_id === tx.order_id);
    if (existing) {
      const merged: cash_transaction = {
        ...existing,
        ...tx,
        id: existing.id,
        created_at: existing.created_at,
        order_id: tx.order_id,
        shift_id: tx.shift_id ?? existing.shift_id ?? null,
        spot_id: tx.spot_id ?? existing.spot_id ?? null,
        spot_address: tx.spot_address ?? existing.spot_address ?? null,
      };
      const idx = all.findIndex((t) => t.id === existing.id);
      all[idx] = merged;
      await save_transactions(all);
      return merged;
    }
  }

  const record: cash_transaction = {
    ...tx,
    id: tx.id || `cash-${Date.now()}`,
    created_at: tx.created_at || new Date().toISOString(),
    shift_date: tx.shift_date,
    spot_id: tx.spot_id ?? null,
    spot_address: tx.spot_address ?? null,
    shift_id: tx.shift_id ?? null,
  };
  all.push(record);
  await save_transactions(all);
  return record;
}

export async function add_transaction(tx: cash_transaction): Promise<cash_transaction> {
  return record_cash_for_order(tx);
}

export async function calc_day_summary(
  shift_date: string,
  transactions?: cash_transaction[]
): Promise<day_summary> {
  const txs = (transactions || (await get_transactions({ shift_date }))).filter(
    (t) => t.shift_date === shift_date
  );
  let cash_total = 0;
  let card_total = 0;
  let cash_received = 0;
  let cash_change = 0;

  for (const t of txs) {
    if (t.payment_method === 'cash') {
      cash_total += t.order_total;
      cash_received += t.amount_received || 0;
      cash_change += t.change_given || 0;
    } else {
      card_total += t.order_total;
    }
  }

  return {
    shift_date,
    cash_total,
    card_total,
    grand_total: cash_total + card_total,
    transaction_count: txs.length,
    cash_received,
    cash_change,
  };
}
