'use client';

import { useState } from 'react';
import {
  base_unit_label,
  format_rub,
  type material,
  type prep_recipe,
  type prep_step,
  type stock_category,
} from '@/lib/finance/model';
import { ingredients_from_steps } from '@/lib/finance/prep-steps';
import PrepStepsEditor from '@/components/admin/finance/prep-steps-editor';
import { NumInput, btn_ghost_danger, field_class } from '@/components/admin/finance/ui';

export default function PrepRecipeCard({
  recipe,
  materials,
  cost_of,
  tag,
  open,
  on_toggle,
  on_change,
  on_remove,
  drinks = 0,
  swaps = [],
  on_swap,
}: {
  recipe: prep_recipe;
  materials: material[];
  cost_of: (material_id: string, qty: number) => number;
  tag?: stock_category;
  open: boolean;
  on_toggle: () => void;
  on_change: (next: prep_recipe) => void;
  on_remove: () => void;
  /** в скольких напитках уже стоит заготовка */
  drinks?: number;
  /** сырьё, которое стоит в напитках: можно разом заменить на заготовку */
  swaps?: { id: string; name: string; drinks: number }[];
  on_swap?: (material_id: string) => void;
}) {
  const [adding, set_adding] = useState('');
  const [swap_id, set_swap_id] = useState('');
  const options = materials
    .filter((m) => m.name.trim() && !m.id.startsWith('batch_'))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const used = new Set(Object.keys(recipe.ingredients));
  const available = options.filter((m) => !used.has(m.id));
  const batch_cost = Object.entries(recipe.ingredients).reduce((sum, [id, qty]) => sum + cost_of(id, qty), 0);
  const implied = Object.values(recipe.ingredients).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);
  const yield_g = recipe.yieldG > 0 ? recipe.yieldG : implied;
  const per_gram = yield_g > 0 ? batch_cost / yield_g : 0;

  function patch(next: Partial<prep_recipe>) {
    on_change({ ...recipe, ...next });
  }

  function set_ingredient(id: string, qty: number) {
    patch({
      ingredients: { ...recipe.ingredients, [id]: qty },
      steps: (recipe.steps ?? []).map((step) => (step.materialId === id ? { ...step, qty } : step)),
    });
  }

  function drop_ingredient(id: string) {
    const ingredients = { ...recipe.ingredients };
    delete ingredients[id];
    patch({
      ingredients,
      steps: (recipe.steps ?? []).filter((step) => step.materialId !== id),
    });
  }

  function set_steps(steps: prep_step[]) {
    const from_steps = ingredients_from_steps(steps, materials).ingredients;
    const ingredients = { ...recipe.ingredients };
    for (const step of recipe.steps ?? []) {
      if (step.materialId && !steps.some((next) => next.materialId === step.materialId)) {
        delete ingredients[step.materialId];
      }
    }
    patch({ steps, ingredients: { ...ingredients, ...from_steps } });
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
        <span className="inline-flex max-w-[9.5rem] shrink-0 items-center gap-1.5 px-1 py-0.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tag?.color ?? '#34C759' }} />
          <span className="truncate text-xs text-neutral-500">{tag?.name ?? 'заготовки'}</span>
        </span>
        <input
          autoFocus={open && !recipe.name.trim()}
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none"
          value={recipe.name}
          placeholder="название заготовки"
          onChange={(e) => patch({ name: e.target.value })}
        />
        <button type="button" className="text-xs text-neutral-400 hover:text-neutral-700" onClick={on_toggle}>
          {open ? 'свернуть' : 'состав'}
        </button>
        <button type="button" className={btn_ghost_danger} onClick={on_remove}>
          ×
        </button>
      </div>
      {open ? (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <label className="block w-36 text-xs text-neutral-500">
            выход, г
            <NumInput
              value={recipe.yieldG}
              min={0}
              className={`${field_class} mt-1 text-right`}
              on_change={(yieldG) => patch({ yieldG })}
            />
          </label>
          <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-neutral-400">ингредиенты</p>
          <div className="space-y-1.5">
            {Object.entries(recipe.ingredients).map(([id, qty]) => {
              const mat = materials.find((row) => row.id === id);
              return (
                <div key={id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-neutral-800">
                    {mat?.name || 'удалённый ингредиент'}
                  </span>
                  <div className="flex w-28 items-center gap-1">
                    <NumInput value={qty} min={0} on_change={(value) => set_ingredient(id, value)} />
                    <span className="w-6 text-xs text-neutral-400">{mat ? base_unit_label(mat.unit) : ''}</span>
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-neutral-500">
                    {format_rub(cost_of(id, qty), 1)}
                  </span>
                  <button type="button" className={btn_ghost_danger} onClick={() => drop_ingredient(id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          {available.length ? (
            <select
              className={`${field_class} mt-2 text-xs`}
              value={adding}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                set_ingredient(id, recipe.ingredients[id] ?? 0);
                set_adding('');
              }}
            >
              <option value="">+ ингредиент…</option>
              {available.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name}
                </option>
              ))}
            </select>
          ) : null}
          <p className="mt-2 text-[11px] text-neutral-500">
            {yield_g > 0
              ? `рецепт на ${yield_g.toLocaleString('ru-RU')} г · ${format_rub(batch_cost, 1)}${
                  per_gram > 0 ? ` · ${format_rub(per_gram, 2)}/г` : ''
                }`
              : 'добавьте ингредиенты и их граммы — из них считается цена'}
          </p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">действия</p>
            <PrepStepsEditor
              steps={recipe.steps ?? []}
              materials={materials.filter((mat) => !mat.id.startsWith('batch_'))}
              show_header={false}
              on_change={set_steps}
            />
          </div>
          <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">в напитках</p>
            <p className="mt-1 text-xs text-neutral-600">
              {drinks <= 0
                ? 'пока ни в одном напитке — сырьё по заказам не списывается'
                : yield_g > 0 && Object.keys(recipe.ingredients).length
                  ? `стоит в ${drinks} напитк${drinks === 1 ? 'е' : 'ах'}. по каждому стакану сырьё списывается в пропорции рецепта`
                  : `стоит в ${drinks} напитк${drinks === 1 ? 'е' : 'ах'}, но состав пустой — сырьё по заказам не списывается`}
            </p>
            {on_swap && swaps.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className={`${field_class} min-w-0 flex-1 text-xs`}
                  value={swap_id}
                  onChange={(e) => set_swap_id(e.target.value)}
                >
                  <option value="">заменить в напитках сырьё на эту заготовку…</option>
                  {swaps.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.drinks} напит.
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!swap_id || !recipe.name.trim()}
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  onClick={() => {
                    const row = swaps.find((item) => item.id === swap_id);
                    if (!row) return;
                    if (
                      !window.confirm(
                        `в ${row.drinks} напитк${row.drinks === 1 ? 'е' : 'ах'} «${row.name}» заменится на «${recipe.name.trim()}». граммы останутся те же — это граммы готовой заготовки в стакане`
                      )
                    )
                      return;
                    on_swap(row.id);
                    set_swap_id('');
                  }}
                >
                  заменить
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
