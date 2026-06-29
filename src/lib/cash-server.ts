import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { cash_transaction, day_summary } from '@/lib/types';

const data_dir = join(process.cwd(), 'data');
const file_path = join(data_dir, 'cash-transactions.json');

function ensure_file(): cash_transaction[] {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  if (!existsSync(file_path)) {
    writeFileSync(file_path, '[]', 'utf-8');
    return [];
  }
  try {
    return JSON.parse(readFileSync(file_path, 'utf-8')) as cash_transaction[];
  } catch {
    return [];
  }
}

function save(transactions: cash_transaction[]) {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  writeFileSync(file_path, JSON.stringify(transactions, null, 2), 'utf-8');
}

export function get_transactions(shift_date?: string): cash_transaction[] {
  const all = ensure_file();
  if (!shift_date) return all;
  return all.filter((t) => t.shift_date === shift_date);
}

export function add_transaction(tx: cash_transaction): cash_transaction {
  const all = ensure_file();
  all.push(tx);
  save(all);
  return tx;
}

export function calc_day_summary(shift_date: string, transactions?: cash_transaction[]): day_summary {
  const txs = (transactions || get_transactions(shift_date)).filter((t) => t.shift_date === shift_date);
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
