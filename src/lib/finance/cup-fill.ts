import { base_unit, stock_category_for, type material } from '@/lib/finance/model';

/** целевой выход продукта в стакане 500 мл — с запасом от края */
export const CUP_FILL_G_PER_500 = 490;

/** цель граммовки для объёма (650 → 637 г) */
export function cup_fill_target_g(volume_ml: number): number {
  const ml = Math.max(1, Math.round(Number(volume_ml) || 500));
  return Math.round(((CUP_FILL_G_PER_500 * ml) / 500) * 10) / 10;
}

/** съедобные граммы: без упаковки и штук */
export function is_edible_fill_material(mat: Pick<material, 'id' | 'name' | 'unit' | 'category'> | undefined) {
  if (!mat) return false;
  if (stock_category_for(mat) === 'packaging') return false;
  if (base_unit(mat.unit) === 'pcs') return false;
  return true;
}

export function edible_grams_from_map(
  ingredients: Record<string, number> | undefined,
  materials: material[]
): number {
  if (!ingredients) return 0;
  const by_id = new Map(materials.map((m) => [m.id, m]));
  let sum = 0;
  for (const [id, q] of Object.entries(ingredients)) {
    const mat = by_id.get(id);
    if (!is_edible_fill_material(mat)) continue;
    const n = Number(q);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 10) / 10;
}

export function edible_grams_from_steps(
  steps: { materialId?: string; qty?: number }[] | undefined,
  materials: material[]
): number {
  if (!steps?.length) return 0;
  const by_id = new Map(materials.map((m) => [m.id, m]));
  let sum = 0;
  for (const s of steps) {
    if (!s.materialId) continue;
    const mat = by_id.get(s.materialId);
    if (!is_edible_fill_material(mat)) continue;
    const n = Number(s.qty);
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return Math.round(sum * 10) / 10;
}

export type fill_summary = {
  target: number;
  actual: number;
  delta: number;
  label: string;
  tone: 'ok' | 'short' | 'over';
};

/** итого / цель / не хватает|лишнее */
export function cup_fill_summary(actual_g: number, volume_ml: number): fill_summary {
  const target = cup_fill_target_g(volume_ml);
  const actual = Math.round(actual_g * 10) / 10;
  const delta = Math.round((actual - target) * 10) / 10;
  const abs = Math.round(Math.abs(delta) * 10) / 10;
  if (abs <= 2) {
    return {
      target,
      actual,
      delta,
      label: `итого ${fmt(actual)} г · цель ${fmt(target)} г`,
      tone: 'ok',
    };
  }
  if (delta < 0) {
    return {
      target,
      actual,
      delta,
      label: `итого ${fmt(actual)} г · цель ${fmt(target)} г · не хватает ${fmt(abs)} г`,
      tone: 'short',
    };
  }
  return {
    target,
    actual,
    delta,
    label: `итого ${fmt(actual)} г · цель ${fmt(target)} г · лишнее ${fmt(abs)} г`,
    tone: 'over',
  };
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : String(n);
}

/** порции топпингов не масштабируем между 500↔650 */
const LOCKED_PORTION_IDS = new Set([
  'tapioca',
  'jelly_lychee',
  'jb_passion',
  'jb_yogurt',
  'jb_mango',
  'jb_strawberry',
  'topping_caramel',
  'matcha',
  'juice_lemon',
]);

/** пересчёт состава между объёмами (топпинги фикс.) */
export function scale_ing_for_volume(
  ingredients: Record<string, number>,
  from_ml: number,
  to_ml: number
): Record<string, number> {
  if (!(from_ml > 0) || Math.abs(from_ml - to_ml) < 0.001) return { ...ingredients };
  const k = to_ml / from_ml;
  const out: Record<string, number> = {};
  for (const [id, q] of Object.entries(ingredients)) {
    const n = Number(q);
    if (!Number.isFinite(n)) continue;
    out[id] = LOCKED_PORTION_IDS.has(id) ? n : Math.round(n * k * 10) / 10;
  }
  return out;
}
