import { is_boby_earning_item } from '@/lib/cart-summary';

export const STUDENT_DISCOUNT_PCT = 30;
export const STUDENT_DISCOUNT_LABEL = 'личная скидка −30%';

export type student_status = {
  student_claimed: boolean;
  student_verified: boolean;
  student_verified_at?: string | null;
  student_verified_by?: string | null;
};

export function empty_student_status(): student_status {
  return {
    student_claimed: false,
    student_verified: false,
    student_verified_at: null,
    student_verified_by: null,
  };
}

export function parse_student_status(row: Record<string, unknown> | null | undefined): student_status {
  if (!row) return empty_student_status();
  return {
    student_claimed: row.student_claimed === true,
    student_verified: row.student_verified === true,
    student_verified_at:
      typeof row.student_verified_at === 'string' ? row.student_verified_at : null,
    student_verified_by:
      typeof row.student_verified_by === 'string' ? row.student_verified_by : null,
  };
}

/** закуски/десерты/добавки без скидки; напитки и комбо — да */
export function item_gets_student_discount(item: {
  category?: string | null;
  id?: string | null;
  menu_id?: string | null;
}) {
  const cat = (item.category || '').trim().toLowerCase();
  if (cat === 'закуски' || cat === 'десерты' || cat === 'добавки') return false;
  const id = item.id || item.menu_id || '';
  if (id.startsWith('topping-') || id.startsWith('addon-')) return true;
  if (cat === 'комбо') return true;
  return is_boby_earning_item({
    category: item.category,
    id: item.id,
    menu_id: item.menu_id,
    quantity: 1,
  });
}

export function with_student_price(price: number, active: boolean) {
  const n = Math.max(0, Number(price) || 0);
  if (!active) return Math.round(n);
  return Math.round(n * (1 - STUDENT_DISCOUNT_PCT / 100));
}

export function student_line_price(
  unit_price: number,
  item: { category?: string | null; id?: string | null; menu_id?: string | null },
  verified: boolean
) {
  return with_student_price(unit_price, verified && item_gets_student_discount(item));
}
