export type pos_discount_scope = 'check' | 'lines';
export type pos_discount_kind = 'pct' | 'rub';

export type pos_discount = {
  scope: pos_discount_scope;
  kind: pos_discount_kind;
  value: number;
  lines: number[];
};

export const STAFF_DISCOUNT_PCT = 50;

type priced_line = { unit: number; qty: number };

function round_rub(n: number) {
  return Math.max(0, Math.round(n));
}

/** цена за штуку после скидки кассира. себе → −50%. не поднимает цену выше unit. */
export function discounted_unit(
  lines: priced_line[],
  index: number,
  discount: pos_discount | null,
  staff: boolean
): number {
  const line = lines[index];
  if (!line) return 0;
  if (staff) return round_rub(line.unit * (1 - STAFF_DISCOUNT_PCT / 100));
  if (!discount || discount.value <= 0) return round_rub(line.unit);

  const affected = (i: number) =>
    discount.scope === 'check' || discount.lines.includes(i);

  if (!affected(index)) return round_rub(line.unit);

  if (discount.kind === 'pct') {
    const pct = Math.min(100, Math.max(0, discount.value));
    return round_rub(line.unit * (1 - pct / 100));
  }

  const totals = lines.map((l, i) => (affected(i) ? l.unit * l.qty : 0));
  const pool = totals.reduce((s, n) => s + n, 0);
  if (pool <= 0) return round_rub(line.unit);
  const take = Math.min(pool, Math.max(0, discount.value));
  const share = (line.unit * line.qty) / pool;
  const cut = take * share;
  const after = line.unit * line.qty - cut;
  return round_rub(after / line.qty);
}

export function cart_total_after_discount(lines: priced_line[], discount: pos_discount | null, staff: boolean) {
  return lines.reduce((s, _, i) => s + discounted_unit(lines, i, discount, staff) * lines[i].qty, 0);
}

export function parse_discount(raw: unknown): pos_discount | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const scope = d.scope === 'lines' || d.scope === 'check' ? d.scope : null;
  const kind = d.kind === 'pct' || d.kind === 'rub' ? d.kind : null;
  if (!scope || !kind) return null;
  const value = Math.max(0, Number(d.value) || 0);
  if (!value) return null;
  const lines = Array.isArray(d.lines)
    ? d.lines.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= 0)
    : [];
  if (scope === 'lines' && !lines.length) return null;
  return { scope, kind, value, lines };
}

export function discount_label(discount: pos_discount | null, staff: boolean) {
  if (staff) return `себе · −${STAFF_DISCOUNT_PCT}%`;
  if (!discount || discount.value <= 0) return null;
  const where = discount.scope === 'check' ? 'на чек' : 'на позиции';
  if (discount.kind === 'pct') return `скидка ${discount.value}% ${where}`;
  return `скидка ${discount.value} ₽ ${where}`;
}

/** сумма по меню у позиций, на которые действует скидка */
export function discount_pool(lines: priced_line[], discount: pos_discount | null) {
  if (!discount) {
    return lines.reduce((s, l) => s + l.unit * l.qty, 0);
  }
  return lines.reduce((s, l, i) => {
    const affected = discount.scope === 'check' || discount.lines.includes(i);
    return affected ? s + l.unit * l.qty : s;
  }, 0);
}

/**
 * скидка из суммы, за которую реально продали.
 * sold — итого к оплате (не больше суммы по меню).
 */
export function discount_from_sold(
  lines: priced_line[],
  sold: number,
  opts?: { scope?: pos_discount_scope; lines?: number[] }
): pos_discount | null {
  const scope = opts?.scope ?? 'check';
  const selected = opts?.lines ?? [];
  const draft: pos_discount = { scope, kind: 'rub', value: 0, lines: selected };
  const pool = discount_pool(lines, draft);
  if (pool <= 0) return null;
  const target = Math.max(0, Math.min(pool, Math.round(Number(sold) || 0)));
  const cut = pool - target;
  if (cut <= 0) return null;
  if (scope === 'lines' && !selected.length) return null;
  return { scope, kind: 'rub', value: cut, lines: selected };
}

/** сколько осталось к оплате при текущей скидке (удобно для поля «продано за») */
export function sold_amount_from_discount(
  lines: priced_line[],
  discount: pos_discount | null,
  staff: boolean
) {
  return cart_total_after_discount(lines, discount, staff);
}
