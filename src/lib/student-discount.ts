import { is_boby_earning_item } from '@/lib/cart-summary';

export const STUDENT_DISCOUNT_PCT = 30;
export const STUDENT_DISCOUNT_LABEL = 'личная скидка −30%';

export type student_status = {
  student_claimed: boolean;
  student_verified: boolean;
  student_verified_at?: string | null;
  student_verified_by?: string | null;
  /** YYYY-MM-DD — скидка до этой даты включительно */
  student_expires_at?: string | null;
};

export function empty_student_status(): student_status {
  return {
    student_claimed: false,
    student_verified: false,
    student_verified_at: null,
    student_verified_by: null,
    student_expires_at: null,
  };
}

function as_date_iso(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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
    student_expires_at: as_date_iso(row.student_expires_at),
  };
}

/** конец учебного года (31 авг) — ближайший ещё не прошедший */
export function default_student_expiry_iso(now = new Date()): string {
  const y = now.getFullYear();
  const this_aug = new Date(y, 7, 31, 23, 59, 59);
  const end = now.getTime() > this_aug.getTime() ? new Date(y + 1, 7, 31) : new Date(y, 7, 31);
  const yy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  const dd = String(end.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function moscow_today_iso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** подтверждён и срок студенческого ещё не вышел (дата включительно) */
export function is_student_discount_active(
  status: Pick<student_status, 'student_verified' | 'student_expires_at'> | null | undefined,
  now = new Date()
): boolean {
  if (!status?.student_verified) return false;
  const until = as_date_iso(status.student_expires_at);
  if (!until) return true; // старые записи без срока — пока действуют
  return until >= moscow_today_iso(now);
}

export function student_expiry_label(expires_at: string | null | undefined): string {
  const until = as_date_iso(expires_at);
  if (!until) return '';
  const [y, m, d] = until.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
