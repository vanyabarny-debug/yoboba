'use client';

import { useState } from 'react';
import {
  base_unit_label,
  format_rub,
  new_id,
  type material,
  type prep_recipe,
} from '@/lib/finance/model';
import { NumInput, btn_ghost_danger, btn_secondary, field_class } from '@/components/admin/finance/ui';

export default function PrepRecipesSection({
  materials,
  recipes,
  cost_of,
  on_change,
}: {
  materials: material[];
  recipes: prep_recipe[];
  cost_of: (material_id: string, qty: number) => number;
  on_change: (next: prep_recipe[], removed_id?: string) => void;
}) {
  const [adding, set_adding] = useState<Record<string, string>>({});
  const options = materials
    .filter((m) => m.name.trim())
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  function patch(id: string, next: (row: prep_recipe) => prep_recipe) {
    on_change(recipes.map((r) => (r.id === id ? next(r) : r)));
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">заготовки</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            рецепт из нескольких ингредиентов. в напитке указываете граммы заготовки — сырьё спишется само
          </p>
        </div>
        <button
          type="button"
          className={btn_secondary}
          onClick={() =>
            on_change([
              ...recipes,
              { id: new_id('batch'), name: '', yieldG: 0, ingredients: {} },
            ])
          }
        >
          + заготовка
        </button>
      </div>
      {recipes.length ? (
        <ul className="border-t border-neutral-100">
          {recipes.map((recipe) => {
            const used = new Set(Object.keys(recipe.ingredients));
            const available = options.filter((m) => !used.has(m.id));
            const batch_cost = Object.entries(recipe.ingredients).reduce(
              (s, [id, q]) => s + cost_of(id, q),
              0
            );
            const implied = Object.values(recipe.ingredients).reduce((s, q) => s + (q > 0 ? q : 0), 0);
            const yield_g = recipe.yieldG > 0 ? recipe.yieldG : implied;
            const per_gram = yield_g > 0 ? batch_cost / yield_g : 0;
            return (
              <li key={recipe.id} className="border-t border-neutral-100 px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[12rem] flex-1 text-xs text-neutral-500">
                    название
                    <input
                      className={`${field_class} mt-1`}
                      value={recipe.name}
                      placeholder="например, сырная пена"
                      onChange={(e) => patch(recipe.id, (row) => ({ ...row, name: e.target.value }))}
                    />
                  </label>
                  <label className="w-36 text-xs text-neutral-500">
                    выход, г
                    <NumInput
                      value={recipe.yieldG}
                      min={0}
                      className={`${field_class} mt-1 text-right`}
                      on_change={(yieldG) => patch(recipe.id, (row) => ({ ...row, yieldG }))}
                    />
                  </label>
                  <button
                    type="button"
                    className={`${btn_ghost_danger} mb-1`}
                    onClick={() => {
                      if (!window.confirm('убрать заготовку из рецептов?')) return;
                      on_change(
                        recipes.filter((r) => r.id !== recipe.id),
                        recipe.id
                      );
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {Object.entries(recipe.ingredients).map(([id, qty]) => {
                    const mat = materials.find((m) => m.id === id);
                    return (
                      <div key={id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-neutral-800">
                          {mat?.name || 'удалённый ингредиент'}
                        </span>
                        <div className="flex w-28 items-center gap-1">
                          <NumInput
                            value={qty}
                            min={0}
                            on_change={(v) =>
                              patch(recipe.id, (row) => ({
                                ...row,
                                ingredients: { ...row.ingredients, [id]: v },
                              }))
                            }
                          />
                          <span className="w-6 text-xs text-neutral-400">
                            {mat ? base_unit_label(mat.unit) : ''}
                          </span>
                        </div>
                        <span className="w-16 text-right text-xs tabular-nums text-neutral-500">
                          {format_rub(cost_of(id, qty), 1)}
                        </span>
                        <button
                          type="button"
                          className={btn_ghost_danger}
                          onClick={() =>
                            patch(recipe.id, (row) => {
                              const ingredients = { ...row.ingredients };
                              delete ingredients[id];
                              return { ...row, ingredients };
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                {available.length ? (
                  <select
                    className={`${field_class} mt-2 text-xs`}
                    value={adding[recipe.id] ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      patch(recipe.id, (row) => ({
                        ...row,
                        ingredients: { ...row.ingredients, [id]: row.ingredients[id] ?? 0 },
                      }));
                      set_adding((prev) => ({ ...prev, [recipe.id]: '' }));
                    }}
                  >
                    <option value="">+ ингредиент…</option>
                    {available.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <p className="mt-2 text-[11px] text-neutral-500">
                  {yield_g > 0 ? (
                    <>
                      рецепт на {yield_g.toLocaleString('ru-RU')} г · {format_rub(batch_cost, 1)}
                      {per_gram > 0 ? ` · ${format_rub(per_gram, 2)}/г` : ''}
                      {recipe.yieldG > 0 ? '' : ' · выход = сумма ингредиентов'}
                    </>
                  ) : (
                    'добавьте ингредиенты и их граммы — из них считается цена заготовки'
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-neutral-100 px-4 py-3 text-xs text-neutral-400">пока нет</p>
      )}
    </div>
  );
}
