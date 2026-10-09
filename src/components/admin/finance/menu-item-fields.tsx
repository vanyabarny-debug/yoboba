'use client';

import { createElement } from 'react';
import type { menu_item, menu_nutrition } from '@/lib/types';
import { item_categories, item_in_category } from '@/lib/menu-item-categories';
import { item_has_toppings, item_has_volumes } from '@/lib/cart-summary';
import { get_item_volumes, get_nutrition } from '@/lib/product-details';
import category_multi_pick from '@/components/admin/category-multi-pick';
import { DrinkThumb, field_class } from '@/components/admin/finance/ui';

function food_level(pct: number) {
  const ideal = 10;
  const floor = 40;
  if (pct <= ideal) return 1;
  return Math.max(0, 1 - (pct - ideal) / (floor - ideal));
}

function food_word(pct: number) {
  if (pct <= 12) return 'идеал';
  if (pct <= 20) return 'нормально';
  if (pct <= 35) return 'так себе';
  return 'плохо';
}

function food_bar(pct: number) {
  const level = food_level(pct);
  const fill = pct <= 20 ? 'bg-emerald-500' : pct <= 35 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="mt-1.5">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px]">
        <span className="font-medium text-neutral-800">{Math.round(pct)}%</span>
        <span className="text-neutral-400">{food_word(pct)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
    </div>
  );
}
function empty_nutrition(): menu_nutrition {
  return { kcal: 0, protein: 0, fat: 0, carb: 0 };
}

function toggle_row({
  label,
  hint,
  on,
  on_change,
}: {
  label: string;
  hint?: string;
  on: boolean;
  on_change: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => on_change(!on)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-neutral-900">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            on ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export default function MenuItemFields({
  draft,
  items,
  categories,
  on_change,
  food_costs = [],
  on_catalog_change,
}: {
  draft: menu_item;
  items: menu_item[];
  categories: string[];
  on_change: (next: menu_item) => void;
  food_costs?: { key: string; label: string; pct: number }[];
  on_catalog_change?: () => void;
}) {
  const others = items.filter((item) => item.id !== draft.id && item_in_category(item, draft.category));
  const volumes = get_item_volumes(draft);
  const nutrition = draft.nutrition ?? empty_nutrition();
  const nutrition_preview = get_nutrition(
    { ...draft, nutrition },
    item_has_volumes(draft) ? (volumes[0]?.ml ?? 100) : 100,
    0
  );

  function toggle_rec(id: string) {
    const next = draft.recommendations.includes(id)
      ? draft.recommendations.filter((x) => x !== id)
      : [...draft.recommendations, id].slice(0, 8);
    on_change({ ...draft, recommendations: next });
  }

  return (
    <div className="space-y-4">
      {food_costs.length > 0 && (
        <div className="rounded-2xl bg-neutral-50 px-3 py-2.5">
          <p className="text-xs font-medium text-neutral-500">фудкост</p>
          <div className={food_costs.length > 1 ? 'mt-2 grid gap-3 sm:grid-cols-2' : 'mt-1'}>
            {food_costs.map((row) => (
              <div key={row.key}>
                {row.label ? <p className="text-[11px] text-neutral-500">{row.label}</p> : null}
                {food_bar(row.pct)}
              </div>
            ))}
          </div>
        </div>
      )}

      {createElement(category_multi_pick, {
        item: draft,
        categories,
        on_change,
        on_catalog_change,
      })}

      <div className="space-y-2">
        {toggle_row({
          label: 'топпинг',
          hint: 'добавки порциями в карточке товара',
          on: item_has_toppings(draft),
          on_change: (on) => on_change({ ...draft, has_toppings: on }),
        })}
      </div>

      <div>
        <p className="text-xs font-medium text-neutral-500">
          {item_has_volumes(draft) ? 'кбжу на 100 мл' : 'кбжу на порцию'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ['kcal', 'ккал', 1],
              ['protein', 'белки, г', 0.1],
              ['fat', 'жиры, г', 0.1],
              ['carb', 'углеводы, г', 0.1],
            ] as const
          ).map(([key, label, step]) => (
            <label key={key} className="block text-xs text-neutral-500">
              {label}
              <input
                type="number"
                min={0}
                step={step}
                value={nutrition[key]}
                onChange={(e) =>
                  on_change({
                    ...draft,
                    nutrition: { ...nutrition, [key]: Number(e.target.value) || 0 },
                  })
                }
                className={field_class}
              />
            </label>
          ))}
        </div>
        {item_has_volumes(draft) && volumes[0] ? (
          <p className="mt-2 text-xs text-neutral-400">
            при {volumes[0].ml} мл: {nutrition_preview.kcal} ккал · б {nutrition_preview.protein} · ж{' '}
            {nutrition_preview.fat} · у {nutrition_preview.carb}
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium text-neutral-500">похожие</p>
        <p className="mt-1 text-xs text-neutral-400">из того же раздела, до 8 позиций</p>
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-neutral-200 p-2">
          {others.length ? (
            others.map((other) => {
              const on = draft.recommendations.includes(other.id);
              return (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => toggle_rec(other.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${
                    on ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <DrinkThumb item={other} />
                  <span className="min-w-0 truncate">{other.name}</span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-3 text-xs text-neutral-400">в этом разделе больше ничего нет</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-neutral-400">
        {item_categories(draft).join(' · ')}
      </p>
    </div>
  );
}
