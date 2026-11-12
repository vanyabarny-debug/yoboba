import type { menu_item } from '@/lib/types';
import { combo_selectable_drinks, get_combo_config } from '@/lib/combo';
import {
  effective_card_size,
  material_unpriced,
  size_key_for_item,
  tech_card_cost,
  type finance_state,
} from '@/lib/finance/model';

export type combo_cost = {
  drink_count: number;
  /** себестоимость одного напитка набора по техкартам */
  cheapest: { name: string; cost: number } | null;
  priciest: { name: string; cost: number } | null;
  avg_drink: number;
  includes: number;
  /** весь набор: напитки × количество + фиксированные позиции */
  min: number;
  avg: number;
  max: number;
  priced: number;
  total: number;
  /** напитки, где в техкарте есть ингредиент без цены поставки — себестоимость занижена */
  unpriced: string[];
  /** эти ингредиенты и в скольких напитках они встречаются */
  unpriced_materials: { name: string; drinks: number }[];
};

export function combo_cost_estimate(state: finance_state, combo: menu_item, menu: menu_item[]): combo_cost | null {
  const cfg = get_combo_config(combo);
  if (!cfg) return null;
  const card_by_menu = new Map(
    state.techCards.filter((c) => c.menu_item_id).map((c) => [c.menu_item_id as string, c])
  );
  const volume = String(cfg.volume_ml);
  const drinks = combo_selectable_drinks(menu, combo);
  const costs: { name: string; cost: number }[] = [];
  const unpriced: string[] = [];
  const missing = new Map<string, number>();
  for (const item of drinks) {
    const card = card_by_menu.get(item.id);
    if (!card) continue;
    const key = size_key_for_item(card, { volume, menu_item: item });
    const cost = tech_card_cost(state, card, key);
    if (cost > 0) costs.push({ name: item.name, cost });
    const size = effective_card_size(card, key, state.materials);
    const gaps = Object.entries({ ...size?.ingredients, ...size?.packaging })
      .filter(([id, q]) => material_unpriced(state, id, q))
      .map(([id]) => id);
    if (!gaps.length) continue;
    unpriced.push(item.name);
    for (const id of gaps) missing.set(id, (missing.get(id) ?? 0) + 1);
  }
  const material_name = (id: string) =>
    state.materials.find((m) => m.id === id)?.name ??
    (state.prepRecipes ?? []).find((p) => p.id === id)?.name ??
    id;
  const unpriced_materials = [...missing.entries()]
    .map(([id, drinks]) => ({ name: material_name(id), drinks }))
    .sort((a, b) => b.drinks - a.drinks);

  let includes = 0;
  const by_id = new Map(menu.map((m) => [m.id, m]));
  for (const row of cfg.includes ?? []) {
    const card = card_by_menu.get(row.menu_id);
    const item = by_id.get(row.menu_id);
    if (!card || !item) continue;
    includes += tech_card_cost(state, card, size_key_for_item(card, { menu_item: item })) * Math.max(1, row.qty);
  }

  if (!costs.length) {
    return {
      drink_count: cfg.drink_count,
      cheapest: null,
      priciest: null,
      avg_drink: 0,
      includes,
      min: includes,
      avg: includes,
      max: includes,
      priced: 0,
      total: drinks.length,
      unpriced,
      unpriced_materials,
    };
  }
  const sorted = [...costs].sort((a, b) => a.cost - b.cost);
  const avg_drink = costs.reduce((sum, row) => sum + row.cost, 0) / costs.length;
  const n = cfg.drink_count;
  return {
    drink_count: n,
    cheapest: sorted[0],
    priciest: sorted[sorted.length - 1],
    avg_drink,
    includes,
    min: sorted[0].cost * n + includes,
    avg: avg_drink * n + includes,
    max: sorted[sorted.length - 1].cost * n + includes,
    priced: costs.length,
    total: drinks.length,
    unpriced,
    unpriced_materials,
  };
}
