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
  if (kind === 'L') return 'молоко, вода, сиропы — в литрах; 0,5 л = пол-литра';
  return 'на весах, в граммах';
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

export function parse_qty(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
