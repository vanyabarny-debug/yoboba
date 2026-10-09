import {
  base_unit,
  format_base_qty,
  new_id,
  stock_category_for,
  type material,
  type prep_step,
  type tech_card,
  type tech_card_size,
} from '@/lib/finance/model';

const COOK_ORDER = ['dry', 'toppings', 'liquids', 'raw', 'retail', 'packaging'] as const;

const HINT_BY_CAT: Record<string, string> = {
  dry: 'насыпать',
  toppings: 'выложить',
  liquids: 'налить',
  packaging: 'взять',
  retail: 'положить',
  raw: 'добавить',
};

export type cook_step_view = {
  id: string;
  title: string;
  hint: string;
  qty_label: string;
};

function barista_title(name: string) {
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parse_prep_steps(raw: unknown): prep_step[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const steps: prep_step[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const s = row as Partial<prep_step>;
    const title = String(s.title || '').trim();
    if (!title && !s.materialId) continue;
    const qty = Number(s.qty);
    steps.push({
      id: String(s.id || new_id('step')),
      title,
      ...(s.hint ? { hint: String(s.hint).trim() } : {}),
      ...(s.materialId ? { materialId: String(s.materialId) } : {}),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    });
  }
  return steps.length ? steps : undefined;
}

function hint_for(mat: material) {
  const cat = stock_category_for(mat);
  const n = mat.name.toLowerCase();
  if (/сироп|концентр/.test(n)) return 'добавить';
  if (/лёд|лед/.test(n)) return 'засыпать';
  return HINT_BY_CAT[cat] || 'добавить';
}

function step_from_material(mat: material, qty: number): prep_step {
  return {
    id: new_id('step'),
    title: barista_title(mat.name),
    hint: hint_for(mat),
    materialId: mat.id,
    qty,
  };
}

function qty_stays(mat: material | undefined) {
  return !mat || base_unit(mat.unit) === 'pcs' || mat.category === 'packaging';
}

/** базовый объём для граммовок в общих этапах */
export function card_steps_base_ml(card: tech_card): number {
  const base = card.sizes['500'];
  if (base?.volume > 0) return base.volume;
  const first = Object.keys(card.sizes)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))[0];
  if (first) return Number(first) || 500;
  return 500;
}

/** общие этапы техкарты; если пусто — поднимаем из размера (наследие) */
export function get_card_steps(card: tech_card): prep_step[] | undefined {
  if (card.steps?.length) return card.steps;
  const preferred =
    card.sizes['500'] ??
    Object.keys(card.sizes)
      .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
      .map((k) => card.sizes[k])[0];
  return preferred?.steps?.length ? preferred.steps : undefined;
}

function decorate_steps(steps: prep_step[], materials: material[]): prep_step[] {
  return steps.map((s) => {
    const mat = s.materialId ? materials.find((m) => m.id === s.materialId) : undefined;
    return {
      ...s,
      title: s.title.trim() || (mat ? barista_title(mat.name) : 'шаг'),
      hint: (s.hint || '').trim() || (mat ? hint_for(mat) : 'сделать'),
    };
  });
}

/** этапы из состава размера (когда общих ещё нет) */
export function steps_from_size_ingredients(size: tech_card_size, materials: material[]): prep_step[] {
  const by_id = new Map(materials.map((m) => [m.id, m]));
  const rows: { mat: material; qty: number; pack: boolean }[] = [];
  for (const [id, qty] of Object.entries(size.ingredients || {})) {
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const mat = by_id.get(id);
    if (!mat) continue;
    rows.push({ mat, qty, pack: false });
  }
  for (const [id, qty] of Object.entries(size.packaging || {})) {
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const mat = by_id.get(id);
    if (!mat) continue;
    rows.push({ mat, qty, pack: true });
  }
  rows.sort((a, b) => {
    const ia = COOK_ORDER.indexOf(stock_category_for(a.mat) as (typeof COOK_ORDER)[number]);
    const ib = COOK_ORDER.indexOf(stock_category_for(b.mat) as (typeof COOK_ORDER)[number]);
    const ca = ia < 0 ? 99 : ia;
    const cb = ib < 0 ? 99 : ib;
    if (ca !== cb) return ca - cb;
    if (a.pack !== b.pack) return a.pack ? 1 : -1;
    return a.mat.name.localeCompare(b.mat.name, 'ru');
  });
  return rows.map((r) => step_from_material(r.mat, r.qty));
}

export function scale_prep_steps(
  steps: prep_step[],
  from_ml: number,
  to_ml: number,
  materials: material[]
): prep_step[] {
  const by_id = new Map(materials.map((m) => [m.id, m]));
  const k = from_ml > 0 ? to_ml / from_ml : 1;
  if (Math.abs(k - 1) < 0.001) return decorate_steps(steps, materials);
  return decorate_steps(
    steps.map((s) => {
      const mat = s.materialId ? by_id.get(s.materialId) : undefined;
      const qty =
        s.qty > 0 && !qty_stays(mat) ? Math.round(s.qty * k * 10) / 10 : s.qty;
      return { ...s, qty };
    }),
    materials
  );
}

/** этапы для редактора: общие, без пересчёта объёма */
export function resolved_card_prep_steps(card: tech_card, materials: material[]): prep_step[] {
  const saved = get_card_steps(card);
  if (saved?.length) return decorate_steps(saved, materials);
  const base_key = card.sizes['500']
    ? '500'
    : Object.keys(card.sizes).sort((a, b) => (Number(a) || 0) - (Number(b) || 0))[0];
  const base = base_key ? card.sizes[base_key] : undefined;
  return base ? steps_from_size_ingredients(base, materials) : [];
}

/** этапы для кассира под выбранный объём */
export function resolved_prep_steps_for_volume(
  card: tech_card,
  size_key: string,
  materials: material[],
  size?: tech_card_size
): prep_step[] {
  const saved = get_card_steps(card);
  const volume = size?.volume || Number(size_key) || card_steps_base_ml(card);
  if (saved?.length) {
    return scale_prep_steps(saved, card_steps_base_ml(card), volume, materials);
  }
  if (size) return steps_from_size_ingredients(size, materials);
  return [];
}

/** @deprecated используйте resolved_prep_steps_for_volume / resolved_card_prep_steps */
export function resolved_prep_steps(size: tech_card_size, materials: material[]): prep_step[] {
  if (size.steps?.length) return decorate_steps(size.steps, materials);
  return steps_from_size_ingredients(size, materials);
}

export function cook_steps_view(steps: prep_step[], materials: material[]): cook_step_view[] {
  const by_id = new Map(materials.map((m) => [m.id, m]));
  return steps.map((s) => {
    const mat = s.materialId ? by_id.get(s.materialId) : undefined;
    return {
      id: s.id,
      title: s.title,
      hint: s.hint || 'добавить',
      qty_label: mat && s.qty > 0 ? format_base_qty(mat, s.qty) : s.qty > 0 ? `${Math.round(s.qty)}` : '',
    };
  });
}

export function ingredients_from_steps(
  steps: prep_step[],
  materials: material[]
): { ingredients: Record<string, number>; packaging: Record<string, number>; saw_pack: boolean } {
  const by_id = new Map(materials.map((m) => [m.id, m]));
  const ingredients: Record<string, number> = {};
  const packaging: Record<string, number> = {};
  let saw_pack = false;
  for (const s of steps) {
    if (!s.materialId || !(s.qty > 0)) continue;
    const mat = by_id.get(s.materialId);
    if (!mat) continue;
    const cat = stock_category_for(mat);
    if (cat === 'packaging') {
      saw_pack = true;
      packaging[s.materialId] = (packaging[s.materialId] || 0) + s.qty;
    } else {
      ingredients[s.materialId] = (ingredients[s.materialId] || 0) + s.qty;
    }
  }
  return { ingredients, packaging, saw_pack };
}

export function apply_steps_to_size(
  size: tech_card_size,
  steps: prep_step[],
  materials: material[]
): tech_card_size {
  const { ingredients, packaging, saw_pack } = ingredients_from_steps(steps, materials);
  return {
    ...size,
    ingredients,
    packaging: saw_pack ? packaging : { ...size.packaging },
    steps,
  };
}

/** пишет общие этапы на карту и синхронизирует состав базового размера */
export function apply_steps_to_card(
  card: tech_card,
  steps: prep_step[],
  materials: material[]
): tech_card {
  const base_key = card.sizes['500']
    ? '500'
    : Object.keys(card.sizes).sort((a, b) => (Number(a) || 0) - (Number(b) || 0))[0];
  if (!base_key || !card.sizes[base_key]) {
    return { ...card, steps: steps.length ? steps : undefined };
  }
  const { ingredients, packaging, saw_pack } = ingredients_from_steps(steps, materials);
  const base = card.sizes[base_key];
  const next_base: tech_card_size = {
    volume: base.volume || Number(base_key) || card_steps_base_ml(card),
    ingredients,
    packaging: saw_pack ? packaging : { ...base.packaging },
  };
  // авто-650 пересчитается через effective_card_size; ручной 650 не трогаем
  return {
    ...card,
    steps: steps.length ? steps : undefined,
    sizes: { ...card.sizes, [base_key]: next_base },
  };
}

export function scale_steps(steps: prep_step[] | undefined, k: number): prep_step[] | undefined {
  if (!steps?.length) return steps;
  return steps.map((s) => ({
    ...s,
    id: new_id('step'),
    qty: s.qty > 0 ? Math.round(s.qty * k * 10) / 10 : 0,
  }));
}

export function clone_size_with_steps(size: tech_card_size): tech_card_size {
  return {
    volume: size.volume,
    ingredients: { ...size.ingredients },
    packaging: { ...size.packaging },
    ...(size.manual ? { manual: true } : {}),
  };
}

export function unit_label_for_material(mat: material | undefined) {
  if (!mat) return '';
  const b = base_unit(mat.unit);
  if (b === 'pcs') return 'шт';
  if (b === 'g') return 'г';
  return 'мл';
}

export type public_recipe = {
  menu_id: string;
  name: string;
  sizes: Record<
    string,
    {
      volume: number;
      label: string;
      steps: cook_step_view[];
    }
  >;
};

export function pick_recipe_size(recipe: public_recipe | undefined, volume?: string) {
  if (!recipe) return null;
  const keys = Object.keys(recipe.sizes);
  if (!keys.length) return null;
  if (volume && recipe.sizes[volume]) return recipe.sizes[volume];
  if (volume && /^\d+$/.test(volume)) {
    const want = Number(volume);
    return keys
      .map((k) => recipe.sizes[k])
      .reduce((best, cur) =>
        Math.abs(cur.volume - want) < Math.abs(best.volume - want) ? cur : best
      );
  }
  return recipe.sizes[keys.sort((a, b) => (Number(a) || 0) - (Number(b) || 0))[0]];
}
