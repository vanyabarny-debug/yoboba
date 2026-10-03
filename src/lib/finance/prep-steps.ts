import {
  base_unit,
  format_base_qty,
  new_id,
  stock_category_for,
  type material,
  type prep_step,
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

/** этапы для кассира: сохранённые или собранные из техкарты */
export function resolved_prep_steps(size: tech_card_size, materials: material[]): prep_step[] {
  if (size.steps?.length) {
    return size.steps.map((s) => {
      const mat = s.materialId ? materials.find((m) => m.id === s.materialId) : undefined;
      return {
        ...s,
        title: s.title.trim() || (mat ? barista_title(mat.name) : 'шаг'),
        hint: (s.hint || '').trim() || (mat ? hint_for(mat) : 'сделать'),
      };
    });
  }

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

export function apply_steps_to_size(
  size: tech_card_size,
  steps: prep_step[],
  materials: material[]
): tech_card_size {
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
  return {
    ...size,
    ingredients,
    packaging: saw_pack ? packaging : { ...size.packaging },
    steps,
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
    ...(size.steps?.length
      ? { steps: size.steps.map((s) => ({ ...s })) }
      : {}),
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
