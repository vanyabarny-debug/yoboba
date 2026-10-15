import { read_durable_json, write_durable_json } from '@/lib/durable-json';

const store_key = 'money-anchor';

/** снимок реальных нал/безнал: старые ошибочные отметки кассы в баланс больше не входят */
export type money_anchor = {
  at: string;
  cash: number;
  card: number;
};

export async function read_money_anchor(): Promise<money_anchor | null> {
  const raw = await read_durable_json<money_anchor | null>(store_key, null);
  if (!raw || typeof raw !== 'object') return null;
  const cash = Number(raw.cash);
  const card = Number(raw.card);
  if (typeof raw.at !== 'string' || !Number.isFinite(cash) || !Number.isFinite(card)) return null;
  return { at: raw.at, cash: Math.round(cash), card: Math.round(card) };
}

export async function write_money_anchor(cash: number, card: number): Promise<money_anchor> {
  const row: money_anchor = {
    at: new Date().toISOString(),
    cash: Math.round(cash),
    card: Math.round(card),
  };
  await write_durable_json(store_key, row);
  return row;
}
