import type { menu_item } from '@/lib/types';

/** сколько напитков выбираем в комбо */
export const combo_drink_counts: Record<string, number> = {
  'combo-dabl-drop': 2,
  'combo-semeiny': 3,
  'combo-druzhba': 6,
};

export function get_combo_drink_count(item: menu_item | null | undefined): number | null {
  if (!item) return null;
  const n = combo_drink_counts[item.id];
  return typeof n === 'number' && n > 0 ? n : null;
}

export function is_combo_item(item: menu_item | null | undefined): boolean {
  return get_combo_drink_count(item) != null;
}

/** напитки, которые можно положить в комбо (не сами комбо) */
export function combo_selectable_drinks(items: menu_item[]): menu_item[] {
  return items.filter(
    (m) =>
      m.is_available &&
      m.category !== 'комбо' &&
      !m.id.startsWith('topping-') &&
      !m.id.startsWith('addon-')
  );
}

export function format_combo_picks(picks: string[]): string {
  if (!picks.length) return '';
  const counts = new Map<string, number>();
  for (const name of picks) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ');
}
