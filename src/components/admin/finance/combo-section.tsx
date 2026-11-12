'use client';

import { useMemo, useState } from 'react';
import type { menu_combo, menu_item } from '@/lib/types';
import {
  combo_composition_text,
  default_combo,
  normalize_combo,
} from '@/lib/combo';
import { item_categories, item_in_category } from '@/lib/menu-item-categories';
import { format_rub } from '@/lib/finance/model';
import type { combo_cost } from '@/lib/finance/combo-cost';
import { DrinkThumb, NumInput, btn_ghost_danger, btn_secondary, field_class } from '@/components/admin/finance/ui';

const VOLUME_OPTIONS = [500, 650];

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
        {hint ? <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span> : null}
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

function CostBox({ cost, price }: { cost: combo_cost | null; price: number }) {
  if (!cost?.priced) {
    return (
      <p className="rounded-2xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        себестоимость не посчитать: у напитков на выбор нет техкарт с ценами
      </p>
    );
  }
  const margin = price - cost.avg;
  const one = cost.cheapest && cost.priciest && cost.cheapest.name !== cost.priciest.name;
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-medium text-neutral-500">себестоимость набора</p>
        <p className="text-lg font-semibold tabular-nums text-neutral-900">≈ {format_rub(cost.avg)}</p>
      </div>
      <p className="mt-1 text-xs tabular-nums text-neutral-500">
        {one ? `от ${format_rub(cost.min)} до ${format_rub(cost.max)} · ` : ''}
        маржа ≈ {format_rub(margin)}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-neutral-400">
        {cost.drink_count} × {format_rub(cost.avg_drink)} в среднем за напиток
        {cost.includes > 0 ? ` + ${format_rub(cost.includes)} комплект` : ''}
        {one ? ` · дешевле всех ${cost.cheapest!.name}, дороже — ${cost.priciest!.name}` : ''}
        {cost.priced < cost.total ? ` · без техкарты ${cost.total - cost.priced} из ${cost.total}` : ''}
      </p>
      {cost.unpriced.length ? (
        <p className="mt-1.5 text-[11px] leading-snug text-amber-700">
          себестоимость занижена: в {cost.unpriced.length} из {cost.priced} техкарт нет цены поставки —{' '}
          {cost.unpriced_materials.map((m) => `${m.name} (${m.drinks})`).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

export default function ComboSection({
  draft,
  cost,
  items,
  categories,
  on_change,
}: {
  draft: menu_item;
  cost: combo_cost | null;
  items: menu_item[];
  categories: string[];
  on_change: (next: menu_item) => void;
}) {
  const cfg = normalize_combo(draft.combo) ?? default_combo();
  const [adding, set_adding] = useState('');
  const drink_categories = useMemo(
    () =>
      categories.filter(
        (c) => c !== 'комбо' && c !== 'закуски' && c !== 'добавки' && c !== 'все'
      ),
    [categories]
  );
  const include_options = useMemo(
    () =>
      items.filter(
        (m) =>
          m.id !== draft.id &&
          m.archived !== true &&
          !item_in_category(m, 'комбо') &&
          !(cfg.includes ?? []).some((row) => row.menu_id === m.id)
      ),
    [items, draft.id, cfg.includes]
  );

  function patch(next: Partial<menu_combo>) {
    const combo = normalize_combo({ ...cfg, ...next }) ?? default_combo();
    on_change({
      ...draft,
      combo,
      composition: combo_composition_text(combo, items),
      has_toppings: false,
      volumes: [],
    });
  }

  const selected_cats = new Set(cfg.from_categories ?? []);

  return (
    <div className="rounded-3xl border border-neutral-200/80 bg-white p-4 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-wide text-neutral-900">комбо</p>
        {VOLUME_OPTIONS.length ? (
          <div
            className="inline-flex max-w-full flex-wrap rounded-full border border-black/[0.08] bg-white p-0.5"
            role="group"
            aria-label="объём напитков"
          >
            {VOLUME_OPTIONS.map((ml) => {
              const active = cfg.volume_ml === ml;
              return (
                <button
                  key={ml}
                  type="button"
                  onClick={() => patch({ volume_ml: ml })}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${
                    active
                      ? 'bg-accent text-accent-foreground font-semibold shadow-[0_2px_8px_rgba(255,107,107,0.28)]'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {ml} мл
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <CostBox cost={cost} price={draft.price} />

        <div className="rounded-2xl border border-neutral-200 px-4 py-3">
          <p className="text-xs font-medium text-neutral-500">сколько напитков выбирает гость</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className={btn_secondary}
              onClick={() => patch({ drink_count: Math.max(1, cfg.drink_count - 1) })}
            >
              −
            </button>
            <NumInput
              value={cfg.drink_count}
              min={1}
              on_change={(v) => patch({ drink_count: Math.max(1, Math.round(v) || 1) })}
            />
            <button
              type="button"
              className={btn_secondary}
              onClick={() => patch({ drink_count: cfg.drink_count + 1 })}
            >
              +
            </button>
            <span className="text-sm text-neutral-500">
              × {cfg.volume_ml} мл
            </span>
          </div>
        </div>

        {toggle_row({
          label: 'можно одинаковые',
          hint: 'гость может взять один напиток несколько раз',
          on: cfg.allow_duplicates !== false,
          on_change: (on) => patch({ allow_duplicates: on }),
        })}

        <div>
          <p className="text-xs font-medium text-neutral-500">из каких разделов</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            пусто — все напитки, кроме закусок и добавок
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {drink_categories.map((name) => {
              const on = selected_cats.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    const next = new Set(selected_cats);
                    if (on) next.delete(name);
                    else next.add(name);
                    patch({ from_categories: [...next] });
                  }}
                  className={`rounded-full px-3 py-1.5 text-sm capitalize ${
                    on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500">ещё в комплекте</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            фиксированные позиции — гость их не выбирает
          </p>
          <div className="mt-2 space-y-1.5">
            {(cfg.includes ?? []).map((row) => {
              const item = items.find((m) => m.id === row.menu_id);
              return (
                <div
                  key={row.menu_id}
                  className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-2 py-2"
                >
                  {item ? <DrinkThumb item={item} /> : <span className="h-12 w-12 rounded-2xl bg-neutral-100" />}
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
                    {item?.name ?? row.menu_id}
                  </span>
                  <div className="flex w-24 items-center gap-1">
                    <NumInput
                      value={row.qty}
                      min={1}
                      on_change={(v) =>
                        patch({
                          includes: (cfg.includes ?? []).map((r) =>
                            r.menu_id === row.menu_id
                              ? { ...r, qty: Math.max(1, Math.round(v) || 1) }
                              : r
                          ),
                        })
                      }
                    />
                    <span className="text-xs text-neutral-400">шт</span>
                  </div>
                  <button
                    type="button"
                    className={btn_ghost_danger}
                    onClick={() =>
                      patch({
                        includes: (cfg.includes ?? []).filter((r) => r.menu_id !== row.menu_id),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          {include_options.length ? (
            <select
              className={`${field_class} mt-2 text-xs`}
              value={adding}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                patch({
                  includes: [...(cfg.includes ?? []), { menu_id: id, qty: 1 }],
                });
                set_adding('');
              }}
            >
              <option value="">+ позиция в комплект…</option>
              {include_options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {item_categories(o).length ? ` · ${item_categories(o).join(', ')}` : ''}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <p className="rounded-2xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          на сайте: {combo_composition_text(cfg, items)}
        </p>
      </div>
    </div>
  );
}
