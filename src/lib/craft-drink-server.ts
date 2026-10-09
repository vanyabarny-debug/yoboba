import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import {
  cost_per_base_unit,
  material_is_infinite,
  merge_stock_categories,
  new_id,
  stock_category_for,
  type material,
  type prep_step,
  type tech_card,
  type tech_card_size,
} from '@/lib/finance/model';
import { apply_steps_to_size } from '@/lib/finance/prep-steps';
import { craft_cup_ml, menu_price_from_cost } from '@/lib/craft-math';
import { read_published_menu, write_published_menu } from '@/lib/menu-catalog-server';
import { default_categories, store_version, type menu_store } from '@/lib/menu-store';
import type { menu_item } from '@/lib/types';

export type craft_shelf = {
  id: string;
  name: string;
  materials: {
    id: string;
    name: string;
    unit_label: string;
    cost_per_base: number;
  }[];
};

const skip_menu_categories = new Set(['комбо', 'закуски', 'добавки']);

function unit_label(mat: material) {
  const cat = stock_category_for(mat);
  if (cat === 'packaging' || mat.unit === 'pcs') return 'шт';
  if (mat.unit === 'L' || mat.unit === 'ml') return 'мл';
  return 'г';
}

function drink_categories(store: menu_store | null) {
  const source = store?.categories?.length ? store.categories : default_categories;
  const list = source.filter((name) => name.trim() && !skip_menu_categories.has(name.trim()));
  return list.length ? list : default_categories.filter((name) => !skip_menu_categories.has(name));
}

export async function craft_catalog(): Promise<{ categories: string[]; shelves: craft_shelf[] }> {
  const [state, menu] = await Promise.all([read_finance_state(), read_published_menu()]);
  const shelves_meta = merge_stock_categories(state.stockCategories ?? []);
  const shelves: craft_shelf[] = shelves_meta.map((shelf) => ({
    id: shelf.id,
    name: shelf.name,
    materials: [],
  }));
  const by_shelf = new Map(shelves.map((shelf) => [shelf.id, shelf]));

  for (const mat of state.materials) {
    if (!mat.name.trim() || material_is_infinite(mat)) continue;
    const shelf_id = stock_category_for(mat);
    const shelf = by_shelf.get(shelf_id) ?? by_shelf.get('raw');
    if (!shelf) continue;
    shelf.materials.push({
      id: mat.id,
      name: mat.name,
      unit_label: unit_label(mat),
      cost_per_base: Math.round(cost_per_base_unit(mat) * 1000) / 1000,
    });
  }

  for (const shelf of shelves) {
    shelf.materials.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  return {
    categories: drink_categories(menu),
    shelves: shelves.filter((shelf) => shelf.materials.length > 0),
  };
}

function tidy_title(name: string) {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function steps_from_boards(
  boards: { caption?: string; drops?: { material_id?: string; qty?: number; action?: string }[] }[],
  materials: Map<string, material>
): prep_step[] {
  const steps: prep_step[] = [];
  for (const board of boards) {
    const caption = String(board.caption || '').trim();
    for (const drop of board.drops || []) {
      const mat = materials.get(String(drop.material_id || ''));
      const qty = Number(drop.qty);
      if (!mat || !Number.isFinite(qty) || qty <= 0) continue;
      const cap = unit_label(mat) === 'шт' ? 20 : 2000;
      const action = String(drop.action || '').trim();
      steps.push({
        id: new_id('step'),
        title: tidy_title(mat.name) || mat.name,
        hint: action || caption || 'добавить',
        materialId: mat.id,
        qty: Math.min(cap, qty),
      });
    }
  }
  return steps;
}

function size_from_steps(steps: prep_step[], materials: material[], volume: number): tech_card_size {
  const sized = apply_steps_to_size({ volume, ingredients: {}, packaging: {} }, steps, materials);
  return {
    volume: sized.volume,
    ingredients: sized.ingredients,
    packaging: sized.packaging,
  };
}

function scale_steps(steps: prep_step[], materials: Map<string, material>): prep_step[] {
  return steps.map((step) => {
    const mat = step.materialId ? materials.get(step.materialId) : undefined;
    if (!mat || unit_label(mat) === 'шт') return { ...step, id: new_id('step') };
    return { ...step, id: new_id('step'), qty: Math.round(step.qty * 1.3 * 10) / 10 };
  });
}

function recipe_cost(steps: prep_step[], materials: Map<string, material>) {
  let cost = 0;
  for (const step of steps) {
    const mat = step.materialId ? materials.get(step.materialId) : undefined;
    if (!mat || !(step.qty > 0)) continue;
    cost += cost_per_base_unit(mat) * step.qty;
  }
  return cost;
}

export async function add_craft_material(input: {
  name: string;
  measure: string;
  cost: number;
}): Promise<{ material: craft_shelf['materials'][number]; shelf_id: string; existed: boolean }> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 48) throw new Error('название позиции от 2 до 48 букв');
  const measure = input.measure === 'ml' || input.measure === 'pcs' ? input.measure : 'g';
  const cost = Number(input.cost);
  if (!Number.isFinite(cost) || cost <= 0 || cost > 100000) {
    throw new Error('укажите цену закупки');
  }

  const state = await read_finance_state();
  const same = state.materials.find((mat) => mat.name.trim().toLowerCase() === name.toLowerCase());
  if (same) {
    const shelf_id = stock_category_for(same);
    return {
      existed: true,
      shelf_id,
      material: {
        id: same.id,
        name: same.name,
        unit_label: unit_label(same),
        cost_per_base: Math.round(cost_per_base_unit(same) * 1000) / 1000,
      },
    };
  }

  const unit = measure === 'ml' ? 'L' : measure === 'pcs' ? 'pcs' : 'kg';
  const draft = {
    id: new_id('mat'),
    name,
    category: measure === 'pcs' ? 'packaging' : measure === 'ml' ? 'liquids' : 'dry',
    unit,
    costPerUnit: Math.round(cost * 100) / 100,
  } satisfies material;
  draft.category = stock_category_for(draft);
  await write_finance_state({ ...state, materials: [...state.materials, draft] });
  return {
    existed: false,
    shelf_id: draft.category,
    material: {
      id: draft.id,
      name: draft.name,
      unit_label: unit_label(draft),
      cost_per_base: Math.round(cost_per_base_unit(draft) * 1000) / 1000,
    },
  };
}

export async function create_crafted_drink(input: {
  name: string;
  category: string;
  cold?: boolean;
  hot?: boolean;
  boards: { caption?: string; drops?: { material_id?: string; qty?: number; action?: string }[] }[];
}): Promise<{ item: menu_item; cost: number; price: number }> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) {
    throw new Error('название от 2 до 40 букв');
  }
  const menu = await read_published_menu();
  if (!menu?.items?.length) throw new Error('меню не найдено');
  const categories = drink_categories(menu);
  const category = categories.includes(input.category) ? input.category : categories[0];
  if (!category) throw new Error('нет раздела меню');

  const taken = menu.items.some(
    (item) => item.is_available && item.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (taken) throw new Error('такой напиток уже в меню');

  const state = await read_finance_state();
  const materials = new Map(state.materials.map((mat) => [mat.id, mat]));
  const steps = steps_from_boards(input.boards || [], materials);
  if (!steps.length) throw new Error('добавьте хотя бы один ингредиент');
  const large_steps = scale_steps(steps, materials);
  const cost = recipe_cost(steps, materials);
  const price = menu_price_from_cost(cost);
  const large_price = menu_price_from_cost(recipe_cost(large_steps, materials));
  const large_add = Math.max(0, large_price - price);

  const item: menu_item = {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    price,
    image_url: null,
    category,
    categories: [category],
    is_available: true,
    recommendations: [],
    prep_minutes: 3,
    has_toppings: true,
    volumes: [
      { ml: 500, add: 0 },
      { ml: 650, add: large_add },
    ],
    composition: steps
      .map((step) => materials.get(step.materialId || '')?.name || '')
      .filter((part) => part && !/стакан|крышк|трубоч|плёнк|пленк/.test(part.toLowerCase()))
      .join(', '),
    nutrition: { kcal: 0, protein: 0, fat: 0, carb: 0 },
    hot: input.hot !== false,
    cold: input.cold !== false,
  };

  const card: tech_card = {
    id: new_id('craft'),
    name,
    menu_item_id: item.id,
    cold: item.cold,
    hot: item.hot,
    steps,
    sizes: {
      '500': size_from_steps(steps, state.materials, craft_cup_ml),
      '650': {
        ...size_from_steps(large_steps, state.materials, 650),
        manual: true,
      },
    },
  };

  const next_menu: menu_store = {
    ...menu,
    version: store_version,
    categories: menu.categories?.length ? menu.categories : categories,
    items: [...menu.items, item],
  };
  await write_published_menu(next_menu);

  try {
    await write_finance_state({
      ...state,
      techCards: [...state.techCards, card],
    });
  } catch (error) {
    await write_published_menu({
      ...next_menu,
      items: next_menu.items.map((row) => (row.id === item.id ? { ...row, is_available: false } : row)),
    }).catch(() => {});
    throw error;
  }

  return { item, cost, price };
}
