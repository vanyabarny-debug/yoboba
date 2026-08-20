import { read_json_store, write_json_store } from '@/lib/data-store';

const store_key = 'demo-bonuses';

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

/** списать бобабаллы; вернёт null если не хватает / нет гостя */
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
