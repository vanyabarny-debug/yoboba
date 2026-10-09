import type { seller_shift_record } from '@/lib/types';

/** имена бариста на смене (crew + opener) */
export function shift_crew_names(shift: seller_shift_record): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const m of shift.crew || []) {
    if (!m.seller_id || seen.has(m.seller_id)) continue;
    seen.add(m.seller_id);
    names.push(m.seller_name || 'бариста');
  }
  if (shift.seller_id && !seen.has(shift.seller_id)) {
    names.unshift(shift.seller_name || 'бариста');
  }
  return names;
}
