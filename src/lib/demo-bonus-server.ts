import { read_json_store, write_json_store } from '@/lib/data-store';

const store_key = 'demo-bonuses';
const earned_orders_key = 'demo-bonus-earned-orders';

type bonus_row = {
  phone: string;
  name: string | null;
  bonus_balance: number;
};

async function load_all(): Promise<bonus_row[]> {
  return read_json_store<bonus_row[]>(store_key, []);
}

async function save_all(rows: bonus_row[]) {
  await write_json_store(store_key, rows);
}

export async function get_demo_bonus(phone: string): Promise<bonus_row | null> {
  const all = await load_all();
  return all.find((r) => r.phone === phone) || null;
}

export async function upsert_demo_bonus(input: {
  phone: string;
  name?: string | null;
  bonus_balance: number;
}): Promise<bonus_row> {
  const all = await load_all();
  const idx = all.findIndex((r) => r.phone === input.phone);
  const row: bonus_row = {
    phone: input.phone,
    name: input.name ?? (idx >= 0 ? all[idx].name : null),
    bonus_balance: Math.max(0, Math.floor(input.bonus_balance)),
  };
  if (idx >= 0) all[idx] = row;
  else all.push(row);
  await save_all(all);
  return row;
}

/** списать бобаллы; вернёт null если не хватает / нет гостя */
export async function redeem_demo_bonus(
  phone: string,
  amount: number
): Promise<bonus_row | null> {
  const all = await load_all();
  const idx = all.findIndex((r) => r.phone === phone);
  if (idx < 0) return null;
  if (all[idx].bonus_balance < amount) return null;
  all[idx] = {
    ...all[idx],
    bonus_balance: all[idx].bonus_balance - amount,
  };
  await save_all(all);
  return all[idx];
}

/** уже начисляли бобаллы за этот демо-заказ */
export async function has_demo_order_earn(order_id: string): Promise<boolean> {
  const ids = await read_json_store<string[]>(earned_orders_key, []);
  return ids.includes(order_id);
}

/** начислить бобаллы за оплаченный демо-заказ (идемпотентно по order_id) */
export async function earn_demo_bonus(input: {
  order_id: string;
  phone: string;
  name?: string | null;
  amount: number;
}): Promise<{ earned: number; bonus_balance: number; already: boolean } | null> {
  const amount = Math.round(input.amount);
  if (amount <= 0) return null;

  const ids = await read_json_store<string[]>(earned_orders_key, []);
  if (ids.includes(input.order_id)) {
    const existing = await get_demo_bonus(input.phone);
    return {
      earned: 0,
      bonus_balance: existing?.bonus_balance ?? 0,
      already: true,
    };
  }

  const existing = await get_demo_bonus(input.phone);
  const next = await upsert_demo_bonus({
    phone: input.phone,
    name: input.name ?? existing?.name ?? null,
    bonus_balance: (existing?.bonus_balance ?? 0) + amount,
  });
  await write_json_store(earned_orders_key, [...ids, input.order_id]);
  return { earned: amount, bonus_balance: next.bonus_balance, already: false };
}
