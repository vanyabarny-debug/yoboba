/** категории рассылки. в интерфейсе сотрудника это подписи и числа, не люди */

export const PUSH_CATEGORIES = [
  { id: 'new', label: 'новичок', hint: 'уровень 0–1' },
  { id: 'second', label: 'второй раз', hint: 'уровень 2–3' },
  { id: 'sometimes', label: 'иногда заходит', hint: 'уровень 4–10' },
  { id: 'regular', label: 'постоянник', hint: 'уровень 11–14' },
  { id: 'legend', label: 'легенда', hint: 'уровень 15 и выше' },
  { id: 'cooling', label: 'статус остывает', hint: 'уровень 4+ и больше 14 дней без визита' },
  { id: 'fresh_hot', label: 'зелёная точка', hint: 'новичок, 1–3 дня с визита' },
  { id: 'fresh_nudge', label: 'жёлтая точка', hint: 'новичок, 4–10 дней' },
  { id: 'fresh_gone', label: 'красная точка', hint: 'новичок, 11+ дней' },
] as const;

export type push_category_id = (typeof PUSH_CATEGORIES)[number]['id'];

const ids = new Set<string>(PUSH_CATEGORIES.map((row) => row.id));

export function parse_push_categories(raw: unknown): push_category_id[] {
  if (!Array.isArray(raw)) return [];
  const picked: push_category_id[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && ids.has(id) && !picked.includes(id as push_category_id)) {
      picked.push(id as push_category_id);
    }
  }
  return picked;
}

export function push_category_label(id: string) {
  return PUSH_CATEGORIES.find((row) => row.id === id)?.label || id;
}
