import { iso_weekday_from_day, weekday_labels } from '@/lib/day-task-templates';
import type { seller_schedule } from '@/lib/types';

const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = /^\d{4}-\d{2}-\d{2}$/;

function clamp_int(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function day_number(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function add_iso_days(day: string, n: number) {
  const next = new Date((day_number(day) + n) * 86_400_000);
  return next.toISOString().slice(0, 10);
}

export function default_schedule(start: string): seller_schedule {
  return { kind: 'cycle', on: 2, off: 2, start, from: '10:00', to: '22:00' };
}

export function parse_schedule(raw: unknown): seller_schedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const from = typeof row.from === 'string' && hm.test(row.from) ? row.from : '10:00';
  const to = typeof row.to === 'string' && hm.test(row.to) ? row.to : '22:00';
  if (row.kind === 'week') {
    const days = Array.isArray(row.days)
      ? [...new Set(row.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort()
      : [];
    return { kind: 'week', days, from, to };
  }
  if (row.kind === 'cycle') {
    const start = typeof row.start === 'string' && iso.test(row.start) ? row.start : null;
    if (!start) return null;
    return {
      kind: 'cycle',
      on: clamp_int(row.on, 1, 14, 2),
      off: clamp_int(row.off, 0, 14, 2),
      start,
      from,
      to,
    };
  }
  return null;
}

export function works_on(schedule: seller_schedule | null | undefined, day: string): boolean {
  if (!schedule) return false;
  if (schedule.kind === 'week') return schedule.days.includes(iso_weekday_from_day(day));
  const period = schedule.on + schedule.off;
  if (period <= 0) return false;
  const offset = day_number(day) - day_number(schedule.start);
  return ((offset % period) + period) % period < schedule.on;
}

export function schedule_label(schedule: seller_schedule | null | undefined): string {
  if (!schedule) return 'график не задан';
  const time = `${schedule.from}–${schedule.to}`;
  if (schedule.kind === 'cycle') return `${schedule.on} через ${schedule.off} · ${time}`;
  if (!schedule.days.length) return 'дни не выбраны';
  const days = weekday_labels.filter((d) => schedule.days.includes(d.id)).map((d) => d.label);
  return `${days.join(' ')} · ${time}`;
}

/** зп месяца: при ставке за смену и графике — смены по графику × ставка, иначе фикс-оклад */
export function seller_month_pay(
  s: { salary_net?: number; shift_rate?: number; schedule?: seller_schedule | null },
  month: string
): number {
  const rate = Math.max(0, Math.round(Number(s.shift_rate) || 0));
  if (rate > 0 && s.schedule) return shifts_in_month(s.schedule, month) * rate;
  return Math.max(0, Math.round(Number(s.salary_net) || 0));
}

export function shifts_in_month(schedule: seller_schedule | null | undefined, month: string): number {
  const [y, m] = month.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= total; d++) {
    if (works_on(schedule, `${month}-${String(d).padStart(2, '0')}`)) count++;
  }
  return count;
}
