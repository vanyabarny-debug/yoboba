/**
 * Заготовки на кассе (сырная шапка, пюре и т.п.).
 * Заготовка — это рецепт-фильтр: на складе её нет, по заказам списывается её сырьё в пропорции рецепта.
 * Партия только показывает, сколько осталось в контейнере, и даёт:
 * приготовить / доготовить, долить ингредиент (молоко 20 г), списать остаток, поправить по факту.
 */

import {
  actor_on_movement,
  base_unit,
  base_unit_label,
  fifo_consume_cost,
  material_cost,
  material_is_free,
  material_is_infinite,
  new_id,
  push_stock_audit,
  stock_qty_map,
  type finance_state,
  type material,
  type prep_batch,
  type prep_recipe,
  type stock_actor,
  type stock_audit_entry,
  type stock_movement,
} from '@/lib/finance/model';

export type prep_batch_alert = 'ok' | 'low' | 'empty' | 'idle';

export type prep_batch_ingredient = {
  materialId: string;
  name: string;
  /** на весь выход рецепта, в базовых единицах */
  qty: number;
  unit: string;
  /** остаток на складе точки */
  have: number;
};

export type prep_batch_view = {
  id: string;
  name: string;
  /** выход рецепта, г */
  yieldG: number;
  ingredients: prep_batch_ingredient[];
  steps: { title: string; hint: string; qty: number; unit: string }[];
  /** есть состав — по заказам списывается сырьё */
  ready: boolean;
  /** партию отмечали — уровень известен */
  tracked: boolean;
  levelG: number;
  fullG: number;
  startedAt: string | null;
  /** 0–1 */
  fill: number;
  alert: prep_batch_alert;
  costPerG: number;
  /** в скольких напитках стоит */
  drinks: number;
};

type actor_opt = { actor?: stock_actor | null; date?: string };
type fail = { ok: false; error: string };
type done = { ok: true; state: finance_state; message: string };

const MAX_G = 20000;

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function audit_actor(actor?: stock_actor | null) {
  return {
    actorId: actor?.id || 'unknown',
    actorName: actor?.name || 'неизвестно',
    actorRole: (actor?.role === 'seller' ? 'seller' : 'admin') as 'admin' | 'seller',
  };
}

export function prep_recipe_yield(recipe: prep_recipe) {
  if (recipe.yieldG > 0) return recipe.yieldG;
  return Object.values(recipe.ingredients).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);
}

function batch_of(state: finance_state, recipeId: string): prep_batch | null {
  return (state.prepBatches ?? []).find((row) => row.recipeId === recipeId) ?? null;
}

/** сколько граммов сейчас в контейнере (может уйти в минус — продали больше, чем отметили) */
export function prep_batch_level(state: finance_state, batch: prep_batch) {
  const used = (state.prepUsage ?? [])
    .filter((row) => row.recipeId === batch.recipeId && row.date > batch.baseAt)
    .reduce((sum, row) => sum + row.grams, 0);
  return round1(batch.baseG - used);
}

function alert_of(tracked: boolean, level: number, full: number): prep_batch_alert {
  if (!tracked) return 'idle';
  if (level <= 0.5) return 'empty';
  if (full > 0 && level / full <= 0.25) return 'low';
  return 'ok';
}

/** сырьё → в скольких напитках стоит (для замены на заготовку в админке) */
export function materials_in_drinks(state: Pick<finance_state, 'techCards'>): Map<string, number> {
  const out = new Map<string, number>();
  for (const card of state.techCards) {
    const ids = new Set<string>();
    for (const size of Object.values(card.sizes)) {
      for (const [id, q] of Object.entries(size?.ingredients ?? {})) if (q > 0) ids.add(id);
    }
    for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/**
 * во всех напитках заменить сырьё на заготовку, граммы те же.
 * пример: «сырная шапка» 50 г в стакане → 50 г заготовки, а сухая смесь и молоко спишутся по её рецепту.
 */
export function swap_material_for_prep<T extends Pick<finance_state, 'techCards' | 'prepRecipes'>>(
  state: T,
  materialId: string,
  recipeId: string
): T {
  const recipe = (state.prepRecipes ?? []).find((row) => row.id === recipeId);
  if (!recipe || !materialId || materialId === recipeId) return state;
  const swap_steps = (steps: prep_recipe['steps']) =>
    steps?.map((step) => (step.materialId === materialId ? { ...step, materialId: recipeId } : step));
  let changed = false;
  const techCards = state.techCards.map((card) => {
    const uses =
      Object.values(card.sizes).some((size) => (size?.ingredients?.[materialId] ?? 0) > 0) ||
      (card.steps ?? []).some((step) => step.materialId === materialId);
    if (!uses) return card;
    changed = true;
    const sizes = Object.fromEntries(
      Object.entries(card.sizes).map(([key, size]) => {
        if (!size) return [key, size];
        const ingredients = { ...size.ingredients };
        const q = ingredients[materialId];
        if (q != null) {
          delete ingredients[materialId];
          if (q > 0) ingredients[recipeId] = round1((ingredients[recipeId] ?? 0) + q);
        }
        return [key, { ...size, ingredients, ...(size.steps ? { steps: swap_steps(size.steps) } : {}) }];
      })
    );
    return { ...card, sizes, ...(card.steps ? { steps: swap_steps(card.steps) } : {}) };
  });
  return changed ? { ...state, techCards } : state;
}

function drinks_using(state: finance_state, recipeId: string) {
  return state.techCards.filter((card) =>
    Object.values(card.sizes).some((size) => (size?.ingredients?.[recipeId] ?? 0) > 0)
  ).length;
}

export function prep_batch_views(state: finance_state): prep_batch_view[] {
  const qty = stock_qty_map(state);
  const mats = new Map(state.materials.map((m) => [m.id, m]));
  return (state.prepRecipes ?? [])
    .filter((recipe) => recipe.name.trim())
    .map((recipe) => {
      const yieldG = prep_recipe_yield(recipe);
      const ingredients = Object.entries(recipe.ingredients)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => {
          const mat = mats.get(id);
          return {
            materialId: id,
            name: mat?.name || 'удалённый ингредиент',
            qty: q,
            unit: mat ? base_unit_label(mat.unit) : 'г',
            have: round1(qty.get(id) ?? 0),
          };
        });
      const batch = batch_of(state, recipe.id);
      const level = batch ? prep_batch_level(state, batch) : 0;
      const full = batch ? Math.max(batch.fullG, Math.max(0, level)) : 0;
      return {
        id: recipe.id,
        name: recipe.name.trim(),
        yieldG,
        ingredients,
        steps: (recipe.steps ?? []).map((step) => {
          const mat = step.materialId ? mats.get(step.materialId) : undefined;
          return {
            title: step.title,
            hint: step.hint || '',
            qty: step.qty,
            unit: step.qty_label || (mat ? base_unit_label(mat.unit) : step.qty > 0 ? 'г' : ''),
          };
        }),
        ready: yieldG > 0 && ingredients.length > 0,
        tracked: Boolean(batch),
        levelG: level,
        fullG: full,
        startedAt: batch?.startedAt ?? null,
        fill: batch && full > 0 ? Math.min(1, Math.max(0, level) / full) : 0,
        alert: alert_of(Boolean(batch), level, full),
        costPerG: yieldG > 0 ? material_cost(state, recipe.id, yieldG) / yieldG : 0,
        drinks: drinks_using(state, recipe.id),
      };
    });
}

/** сырьё на `grams` готовой заготовки */
export function prep_portion(recipe: prep_recipe, grams: number, materials: material[]) {
  const yieldG = prep_recipe_yield(recipe);
  if (!(yieldG > 0) || !(grams > 0)) return [];
  const mats = new Map(materials.map((m) => [m.id, m]));
  const out: { mat: material; qty: number }[] = [];
  for (const [id, q] of Object.entries(recipe.ingredients)) {
    const mat = mats.get(id);
    if (!mat || !(q > 0) || material_is_free(mat) || material_is_infinite(mat)) continue;
    const part = round1((q * grams) / yieldG);
    if (part > 0) out.push({ mat, qty: part });
  }
  return out;
}

/** новая отметка уровня: старые строки расхода больше не нужны */
function set_batch(
  state: finance_state,
  recipeId: string,
  patch: { baseG: number; date: string; startedAt?: string; fullG?: number }
): finance_state {
  const prev = batch_of(state, recipeId);
  const next: prep_batch = {
    recipeId,
    ...(prev?.spotId ? { spotId: prev.spotId } : {}),
    startedAt: patch.startedAt || prev?.startedAt || patch.date,
    baseG: round1(patch.baseG),
    baseAt: patch.date,
    fullG: Math.max(0, Math.round(patch.fullG ?? prev?.fullG ?? Math.max(0, patch.baseG))),
  };
  return {
    ...state,
    prepBatches: [...(state.prepBatches ?? []).filter((row) => row.recipeId !== recipeId), next],
    prepUsage: (state.prepUsage ?? []).filter((row) => row.recipeId !== recipeId || row.date > patch.date),
  };
}

function find_recipe(state: finance_state, recipeId: string): prep_recipe | fail {
  const recipe = (state.prepRecipes ?? []).find((row) => row.id === recipeId);
  if (!recipe || !recipe.name.trim()) return { ok: false, error: 'заготовка не найдена' };
  return recipe;
}

function clean_grams(raw: unknown, allow_zero = false): number | null {
  const n = Math.round(Number(raw) * 10) / 10;
  if (!Number.isFinite(n) || n > MAX_G) return null;
  if (allow_zero ? n < 0 : n <= 0) return null;
  return n;
}

/** списать сырьё на `grams` заготовки (выбросили / не хватило по факту) */
function write_off_portion(
  state: finance_state,
  recipe: prep_recipe,
  grams: number,
  note: string,
  opts: actor_opt
): { state: finance_state; movements: stock_movement[] } {
  const date = opts.date || new Date().toISOString();
  const movements: stock_movement[] = [];
  let cursor = state;
  for (const { mat, qty } of prep_portion(recipe, grams, state.materials)) {
    const mv: stock_movement = {
      id: new_id('mv'),
      date,
      type: 'writeoff',
      materialId: mat.id,
      qty,
      total: fifo_consume_cost(cursor, mat.id, qty),
      note,
      ...actor_on_movement(opts.actor),
    };
    movements.push(mv);
    cursor = { ...cursor, stockMovements: [...cursor.stockMovements, mv] };
  }
  return { state: cursor, movements };
}

function audit(
  state: finance_state,
  recipe: prep_recipe,
  entry: Pick<stock_audit_entry, 'action' | 'note'> & { before: number; after: number; movementId?: string },
  opts: actor_opt
) {
  return push_stock_audit(state, [
    {
      id: new_id('aud'),
      at: opts.date || new Date().toISOString(),
      ...audit_actor(opts.actor),
      action: entry.action,
      materialId: recipe.id,
      materialName: recipe.name.trim(),
      qtyBefore: entry.before,
      qtyAfter: entry.after,
      note: entry.note,
      ...(entry.movementId ? { movementId: entry.movementId } : {}),
    },
  ]);
}

function format_g(n: number) {
  const v = Math.round(n);
  return v >= 1000 ? `${(v / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кг` : `${v} г`;
}

/**
 * приготовил заготовку. склад не трогаем — сырьё уйдёт по заказам.
 * more — доготовил в тот же контейнер; иначе новая партия, а старый остаток уходит в списание.
 */
export function apply_prep_batch_make(
  state: finance_state,
  input: { recipeId: string; grams: unknown; mode?: 'new' | 'more' } & actor_opt
): done | fail {
  const recipe = find_recipe(state, input.recipeId);
  if ('ok' in recipe) return recipe;
  const grams = clean_grams(input.grams);
  if (grams == null) return { ok: false, error: 'сколько граммов приготовили?' };
  const date = input.date || new Date().toISOString();
  const batch = batch_of(state, recipe.id);
  const level = batch ? prep_batch_level(state, batch) : 0;
  const left = Math.max(0, level);
  const name = recipe.name.trim();

  if (input.mode === 'more' && batch) {
    const after = left + grams;
    let next = set_batch(state, recipe.id, { baseG: after, date, fullG: after });
    next = audit(next, recipe, { action: 'prep', note: `доготовили ${name}: +${format_g(grams)}`, before: level, after }, input);
    return { ok: true, state: next, message: `${name}: +${format_g(grams)}, теперь ${format_g(after)}` };
  }

  let next = state;
  let tail = '';
  if (left > 0.5) {
    const off = write_off_portion(next, recipe, left, `списание заготовки: ${name} (новая партия)`, input);
    next = off.state;
    tail = ` · старый остаток ${format_g(left)} списан`;
  }
  next = set_batch(next, recipe.id, { baseG: grams, date, startedAt: date, fullG: grams });
  next = audit(next, recipe, { action: 'prep', note: `приготовили ${name}: ${format_g(grams)}${tail}`, before: level, after: grams }, input);
  return { ok: true, state: next, message: `${name}: ${format_g(grams)}${tail}` };
}

/** долили ингредиент в контейнер (молоко 20 г в сырную шапку). сырьё сразу уходит со склада */
export function apply_prep_batch_add(
  state: finance_state,
  input: { recipeId: string; materialId: string; qty: unknown } & actor_opt
): done | fail {
  const recipe = find_recipe(state, input.recipeId);
  if ('ok' in recipe) return recipe;
  const qty = clean_grams(input.qty);
  if (qty == null) return { ok: false, error: 'сколько добавили?' };
  const mat = state.materials.find((row) => row.id === input.materialId);
  if (!mat) return { ok: false, error: 'выберите, что добавили' };
  const date = input.date || new Date().toISOString();
  const name = recipe.name.trim();
  const unit = base_unit_label(mat.unit);
  const counted = !material_is_free(mat) && !material_is_infinite(mat);

  let next = state;
  let movementId: string | undefined;
  if (counted) {
    const mv: stock_movement = {
      id: new_id('mv'),
      date,
      type: 'out',
      materialId: mat.id,
      qty,
      total: fifo_consume_cost(state, mat.id, qty),
      note: `заготовка: ${name} · добавили ${mat.name}`,
      ...actor_on_movement(input.actor),
    };
    movementId = mv.id;
    next = { ...next, stockMovements: [...next.stockMovements, mv] };
  }

  const batch = batch_of(next, recipe.id);
  const level = batch ? prep_batch_level(next, batch) : 0;
  // штуки вес контейнера не меняют
  const grows = base_unit(mat.unit) !== 'pcs';
  const after = grows ? Math.max(0, level) + qty : level;
  if (batch && grows) {
    next = set_batch(next, recipe.id, { baseG: after, date, fullG: Math.max(batch.fullG, after) });
  }
  next = audit(
    next,
    recipe,
    { action: 'prep', note: `${name}: добавили ${qty} ${unit} ${mat.name}`, before: level, after, movementId },
    input
  );
  return {
    ok: true,
    state: next,
    message: `${name}: +${qty} ${unit} ${mat.name}${counted ? ' списано со склада' : ''}`,
  };
}

/** выбросили часть или весь остаток — списываем сырьё в пропорции рецепта */
export function apply_prep_batch_writeoff(
  state: finance_state,
  input: { recipeId: string; grams?: unknown; note?: string } & actor_opt
): done | fail {
  const recipe = find_recipe(state, input.recipeId);
  if ('ok' in recipe) return recipe;
  if (!(prep_recipe_yield(recipe) > 0) || !Object.keys(recipe.ingredients).length) {
    return { ok: false, error: 'у заготовки не заполнен состав — нечего списывать' };
  }
  const batch = batch_of(state, recipe.id);
  const level = batch ? prep_batch_level(state, batch) : 0;
  const all = input.grams == null || input.grams === '';
  const grams = all ? Math.max(0, level) : clean_grams(input.grams);
  if (grams == null || grams <= 0) {
    return { ok: false, error: all ? 'в контейнере пусто — нечего списывать' : 'сколько граммов списать?' };
  }
  const date = input.date || new Date().toISOString();
  const name = recipe.name.trim();
  const note = input.note?.trim() || `списание заготовки: ${name}`;
  const off = write_off_portion(state, recipe, grams, note, { ...input, date });
  let next = off.state;
  const after = Math.max(0, round1(level - grams));
  if (batch) next = set_batch(next, recipe.id, { baseG: after, date });
  next = audit(
    next,
    recipe,
    { action: 'writeoff', note: `${note}: ${format_g(grams)}`, before: level, after, movementId: off.movements[0]?.id },
    { ...input, date }
  );
  return { ok: true, state: next, message: `${name}: списано ${format_g(grams)}` };
}

/** сколько реально в контейнере. недостачу списываем как потерю сырья, излишек просто ставим */
export function apply_prep_batch_fact(
  state: finance_state,
  input: { recipeId: string; grams: unknown } & actor_opt
): done | fail {
  const recipe = find_recipe(state, input.recipeId);
  if ('ok' in recipe) return recipe;
  const actual = clean_grams(input.grams, true);
  if (actual == null) return { ok: false, error: 'сколько граммов в контейнере? можно 0' };
  const date = input.date || new Date().toISOString();
  const name = recipe.name.trim();
  const batch = batch_of(state, recipe.id);
  const level = batch ? prep_batch_level(state, batch) : actual;
  const short = round1(Math.max(0, level) - actual);
  let next = state;
  let movementId: string | undefined;
  let message = `${name}: ${format_g(actual)}`;
  if (batch && short > 0.5 && prep_recipe_yield(recipe) > 0) {
    const off = write_off_portion(next, recipe, short, `потеряно: ${name}`, { ...input, date });
    next = off.state;
    movementId = off.movements[0]?.id;
    message += ` · не хватало ${format_g(short)} — списано`;
  }
  next = set_batch(next, recipe.id, {
    baseG: actual,
    date,
    ...(batch ? {} : { startedAt: date }),
    fullG: Math.max(batch?.fullG ?? 0, actual),
  });
  next = audit(next, recipe, { action: 'adjust', note: `факт: ${message}`, before: level, after: actual, movementId }, input);
  return { ok: true, state: next, message };
}
