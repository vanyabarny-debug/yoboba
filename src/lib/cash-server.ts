import { read_json_store, write_json_store } from '@/lib/data-store';
import type { cash_transaction, day_summary } from '@/lib/types';

const store_key = 'cash-transactions';

async function load_transactions(): Promise<cash_transaction[]> {
  return read_json_store<cash_transaction[]>(store_key, []);
}

async function save_transactions(transactions: cash_transaction[]) {
  await write_json_store(store_key, transactions);
}

export async function get_transactions(shift_date?: string): Promise<cash_transaction[]> {
  const all = await load_transactions();
  if (!shift_date) return all;
  return all.filter((t) => t.shift_date === shift_date);
}

export async function add_transaction(tx: cash_transaction): Promise<cash_transaction> {
  const all = await load_transactions();
  all.push(tx);
  await save_transactions(all);
  return tx;
}

export async function calc_day_summary(
  shift_date: string,
  transactions?: cash_transaction[]
): Promise<day_summary> {
  const txs = (transactions || (await get_transactions(shift_date))).filter(
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
