import { base_unit, type material } from '@/lib/finance/model';

export type weigh_kind = 'g' | 'L' | 'pcs';

export function weigh_kind_of(m: Pick<material, 'unit'>): weigh_kind {
  const b = base_unit(m.unit);
  if (b === 'pcs') return 'pcs';
  if (b === 'ml') return 'L';
  return 'g';
}

export function weigh_prompt(name: string, kind: weigh_kind) {
  if (kind === 'pcs') return `посчитайте\n${name}`;
  if (kind === 'L') return `сколько литров\n${name}`;
  return `взвесьте\n${name}`;
}

export function weigh_unit(kind: weigh_kind) {
  if (kind === 'pcs') return 'шт';
  if (kind === 'L') return 'л';
  return 'г';
}

export function weigh_hint(kind: weigh_kind) {
  if (kind === 'pcs') return 'по штукам, как лежит на полке';
  if (kind === 'L') return 'сколько налито, в литрах; тара вычитается отдельно';
  return 'сколько на весах, в граммах; тара вычитается отдельно';
}

/** вес тары в тех же единицах, что поле инвентаризации (г или л) */
export function stored_tare(m: { tareWeight?: number }) {
  const n = Number(m.tareWeight);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function to_base_qty(m: Pick<material, 'unit'>, entered: number) {
  const kind = weigh_kind_of(m);
  if (kind === 'pcs') return Math.max(0, Math.round(entered));
  if (kind === 'L') return Math.max(0, Math.round(entered * 1000 * 10) / 10);
  return Math.max(0, entered);
}

export function entered_from_base(m: Pick<material, 'unit'>, qty: number) {
  const kind = weigh_kind_of(m);
  if (kind === 'pcs') return Math.max(0, Math.round(qty));
  if (kind === 'L') return Math.round((qty / 1000) * 1000) / 1000;
  return Math.max(0, Math.round(qty * 10) / 10);
}

/** 1280 мл → «1 л 280 мл». так проще сверить, чем «1,28 л». */
export function format_ml(qty: number) {
  const n = Math.max(0, Math.round(qty));
  const liters = Math.floor(n / 1000);
  const rest = n % 1000;
  if (liters > 0 && rest > 0) return `${liters.toLocaleString('ru-RU')} л ${rest} мл`;
  if (liters > 0) return `${liters.toLocaleString('ru-RU')} л`;
  return `${rest.toLocaleString('ru-RU')} мл`;
}

/** списание жидкости — целые миллилитры. «1,28» не превращаем в 1 мл. */
export function parse_ml(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!t || /[.,]/.test(t) || !/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function parse_qty(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
