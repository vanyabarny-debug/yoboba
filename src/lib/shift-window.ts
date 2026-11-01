/** смена точки: каждый день с 11:00 до 22:00 по Москве */

import { moscow_today_iso } from '@/lib/order-number';

export const shift_start_hm = '11:00';
export const shift_end_hm = '22:00';

export const shift_closed_message = 'смена с 11:00 до 22:00 — сейчас карточку не пробить';

function hm_to_minutes(hm: string) {
  const [h, m] = hm.split(':').map((part) => Number(part) || 0);
  return h * 60 + m;
}

export function moscow_hm(date = new Date()) {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return text === '24:00' ? '00:00' : text;
}

export function shift_is_open(now = new Date()) {
  const minutes = hm_to_minutes(moscow_hm(now));
  return minutes >= hm_to_minutes(shift_start_hm) && minutes < hm_to_minutes(shift_end_hm);
}

export function yesterday_iso(day = moscow_today_iso()) {
  return moscow_today_iso(new Date(new Date(`${day}T12:00:00+03:00`).getTime() - 86_400_000));
}

/** окно этого дня уже закрылось */
export function shift_has_ended(day: string, now = new Date()) {
  const today = moscow_today_iso(now);
  if (day < today) return true;
  if (day > today) return false;
  return hm_to_minutes(moscow_hm(now)) >= hm_to_minutes(shift_end_hm);
}

export function shift_end_iso(day: string) {
  return new Date(`${day}T${shift_end_hm}:00+03:00`).toISOString();
}
