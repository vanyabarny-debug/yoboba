'use client';

import { createElement, useMemo, useState } from 'react';
import type { menu_item } from '@/lib/types';
import {
  base_unit_label,
  format_rub,
  material_cost,
  material_is_infinite,
  menu_price_for_size,
  size_label,
  sync_tech_cards_with_menu,
  tech_card_cost,
  tech_card_removed_keys,
  type tech_card,
  type tech_card_size,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import PrepStepsEditor from '@/components/admin/finance/prep-steps-editor';
import { menu_temp_switches } from '@/components/menu-temp-marks';
import { scale_steps } from '@/lib/finance/prep-steps';
import {
  Card,
  DrinkThumb,
  EmptyState,
  NumInput,
  btn_ghost_danger,
  btn_secondary,
  cell_input_class,
  field_class,
} from '@/components/admin/finance/ui';

const skip_categories = new Set(['комбо', 'закуски', 'добавки']);

export default function TechcardsSection({ state, set_state, menu, set_menu, month }: section_props) {
  const drinks = useMemo(
    () =>
      menu
        .filter((m) => !skip_categories.has(m.category))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [menu]
  );
  const active = useMemo(() => drinks.filter((item) => item.is_available !== false), [drinks]);
  const archived = useMemo(() => drinks.filter((item) => item.is_available === false), [drinks]);
  const [selected_id, set_selected_id] = useState<string | null>(null);
  const [query, set_query] = useState('');
  const [folder, set_folder] = useState<'cards' | 'archive'>('cards');
  const [purge_error, set_purge_error] = useState('');

  const menu_by_id = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const md = state.monthsData.find((m) => m.month === month);
  const card_by_menu = useMemo(() => {
    const map = new Map<string, tech_card>();
    for (const c of state.techCards) {
      if (c.menu_item_id) map.set(c.menu_item_id, c);
    }
    return map;
  }, [state.techCards]);

  const pool = folder === 'archive' ? archived : active;
  const visible = pool.filter((d) => !query || d.name.toLowerCase().includes(query.toLowerCase()));
  const selected_drink = selected_id ? menu_by_id.get(selected_id) ?? drinks.find((d) => d.id === selected_id) : null;
  const card = selected_id ? card_by_menu.get(selected_id) ?? null : null;

  function pick(item: menu_item) {
    set_selected_id(item.id);
  }

  function ensure_card(item: menu_item) {
    set_state((prev) => {
      const drop = new Set([item.id, `tc_${item.id}`, `name:${item.name.trim().toLowerCase()}`]);
      const removedTechCardIds = (prev.removedTechCardIds ?? []).filter((id) => !drop.has(id));
      return sync_tech_cards_with_menu({ ...prev, removedTechCardIds }, [item]);
    });
  }

  function remove_card(card: tech_card) {
    if (!window.confirm(`убрать техкарту «${card.name}»? из базы она тоже пропадёт`)) return;
    set_state((prev) => ({
      ...prev,
      techCards: prev.techCards.filter((row) => row.id !== card.id),
      removedTechCardIds: [...new Set([...(prev.removedTechCardIds ?? []), ...tech_card_removed_keys(card)])],
    }));
    set_selected_id(null);
  }

  async function purge_archived(item: menu_item) {
    if (!window.confirm(`удалить «${item.name}» из архива навсегда? напиток и рецепт пропадут из базы`)) return;
    set_purge_error('');
    const loaded = await fetch('/api/admin/menu', { credentials: 'same-origin' });
    const body = (await loaded.json()) as { store?: { items?: menu_item[]; removed_item_ids?: string[]; categories?: string[] } };
    const store = body.store;
    if (!loaded.ok || !store?.items?.length || !store.categories) {
      set_purge_error('не удалось открыть меню');
      return;
    }
    const removed_item_ids = [...new Set([...(store.removed_item_ids ?? []), item.id])];
    const saved = await fetch('/api/admin/menu', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...store,
        items: store.items.filter((row) => row.id !== item.id),
        removed_item_ids,
      }),
    });
    if (!saved.ok) {
      set_purge_error('не удалось удалить из базы');
      return;
    }
    const existing = card_by_menu.get(item.id);
    const tombstone = existing ?? { id: `tc_${item.id}`, name: item.name, menu_item_id: item.id, sizes: {} };
    set_state((prev) => ({
      ...prev,
      techCards: prev.techCards.filter((row) => row.id !== tombstone.id && row.menu_item_id !== item.id),
      removedTechCardIds: [...new Set([...(prev.removedTechCardIds ?? []), ...tech_card_removed_keys(tombstone)])],
    }));
    set_menu?.((prev) => prev.filter((row) => row.id !== item.id));
    set_selected_id(null);
  }

  function set_card_temp(card: tech_card, drink: menu_item, patch: { cold?: boolean; hot?: boolean }) {
    const cold = patch.cold ?? card.cold ?? Boolean(drink.cold);
    const hot = patch.hot ?? card.hot ?? Boolean(drink.hot);
    update_card(card.id, (row) => ({ ...row, cold, hot }));
  }

  function update_card(id: string, fn: (c: tech_card) => tech_card) {
    set_state((prev) => ({ ...prev, techCards: prev.techCards.map((c) => (c.id === id ? fn(c) : c)) }));
  }

  function update_size(id: string, key: string, fn: (s: tech_card_size) => tech_card_size) {
    update_card(id, (c) => ({ ...c, sizes: { ...c.sizes, [key]: fn(c.sizes[key] ?? { volume: 0, ingredients: {}, packaging: {} }) } }));
  }

  function copy_size(id: string, from: string, to: string) {
    update_card(id, (c) => {
      const src = c.sizes[from];
      if (!src) return c;
      const vol_from = src.volume || Number(from) || 1;
      const vol_to = Number(to) || vol_from;
      const k = vol_to / vol_from;
      const scale = (rec: Record<string, number>) =>
        Object.fromEntries(Object.entries(rec).map(([mid, q]) => [mid, Math.round(q * k * 10) / 10]));
      const scaled = scale_steps(src.steps, k);
      return {
        ...c,
        sizes: {
          ...c.sizes,
          [to]: {
            volume: vol_to,
            ingredients: scale(src.ingredients),
            packaging: { ...src.packaging },
            ...(scaled?.length ? { steps: scaled } : {}),
          },
        },
      };
    });
  }

  const raw_materials = state.materials.filter((m) => m.category !== 'packaging' && !material_is_infinite(m));
  const pack_materials = state.materials.filter((m) => m.category === 'packaging' && !material_is_infinite(m));
  const show_editor = Boolean(selected_id && card);

  return (
    <div className="relative lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-4">
      <div className={show_editor ? 'hidden lg:block' : ''}>
        {folder === 'archive' ? (
          <button
            type="button"
            className="mb-3 text-sm text-accent"
            onClick={() => {
              set_folder('cards');
              set_selected_id(null);
              set_query('');
            }}
          >
            ← к техкартам
          </button>
        ) : null}
        <input
          className={`${field_class} mb-3`}
          placeholder={folder === 'archive' ? 'найти в архиве…' : 'найти напиток…'}
          value={query}
          onChange={(e) => set_query(e.target.value)}
        />
        {folder === 'archive' ? (
          <p className="mb-2 text-[11px] font-normal text-neutral-400">архив хранится в базе, пока напиток не удалить навсегда</p>
        ) : null}
        {purge_error ? <p className="mb-2 text-sm text-red-500">{purge_error}</p> : null}
        {visible.length ? (
          <ul className="space-y-1">
            {visible.map((item) => {
              const tc = card_by_menu.get(item.id);
              const empty =
                !tc ||
                !Object.values(tc.sizes).some((s) => Object.keys(s.ingredients).length > 0);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    className={`flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left shadow-soft ring-1 transition-colors ${
                      selected_id === item.id ? 'ring-accent/50 bg-accent/5' : 'ring-neutral-200/80 hover:ring-accent/30'
                    }`}
                  >
                    <DrinkThumb item={item} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-900">{item.name}</span>
                      <span className="text-[11px] font-normal text-neutral-400">
                        {empty ? 'рецепт не заполнен' : 'техкарта'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>{folder === 'archive' ? 'в архиве пусто' : 'напитков нет'}</EmptyState>
        )}
        {folder === 'cards' ? (
          <button
            type="button"
            onClick={() => {
              set_folder('archive');
              set_selected_id(null);
              set_query('');
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-neutral-100 px-3 py-2.5 text-left ring-1 ring-neutral-200/80 transition-colors hover:bg-neutral-200/60"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-sm font-medium text-neutral-500 ring-1 ring-black/5">
              {archived.length}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-neutral-900">архив</span>
              <span className="text-[11px] font-normal text-neutral-400">скрытые напитки и их рецепты</span>
            </span>
          </button>
        ) : null}
      </div>

      {selected_drink && !card ? (
        <Card title={selected_drink.name}>
          <p className="text-sm text-neutral-500">
            {selected_drink.is_available === false
              ? 'рецепта нет — напиток лежит в архиве'
              : 'техкарты нет — в меню напиток остаётся'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btn_secondary} onClick={() => ensure_card(selected_drink)}>
              создать техкарту
            </button>
            {selected_drink.is_available === false ? (
              <button type="button" className={btn_ghost_danger} onClick={() => void purge_archived(selected_drink)}>
                удалить навсегда
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {show_editor && card && selected_drink ? (
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <button
            type="button"
            className="text-sm text-accent lg:hidden"
            onClick={() => set_selected_id(null)}
          >
            ← к напиткам
          </button>
          <Card
            title={
              <div className="flex items-center gap-3">
                <DrinkThumb item={selected_drink} size="md" />
                <div>
                  <p className="font-heading-soft text-base text-neutral-900">{selected_drink.name}</p>
                  <p className="text-[11px] font-normal text-neutral-400">{selected_drink.category}</p>
                </div>
              </div>
            }
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {createElement(menu_temp_switches, {
                cold: card.cold ?? Boolean(selected_drink.cold),
                hot: card.hot ?? Boolean(selected_drink.hot),
                on_cold: (on: boolean) => set_card_temp(card, selected_drink, { cold: on }),
                on_hot: (on: boolean) => set_card_temp(card, selected_drink, { hot: on }),
              })}
              {selected_drink.is_available === false ? (
                <button type="button" className={btn_ghost_danger} onClick={() => void purge_archived(selected_drink)}>
                  удалить навсегда
                </button>
              ) : (
                <button type="button" className={btn_ghost_danger} onClick={() => remove_card(card)}>
                  удалить техкарту
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(card.sizes)
                .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
                .map((key) => {
                  const cost = tech_card_cost(state, card, key);
                  const planned = md?.sales[card.id]?.[key]?.price;
                  const price = planned && planned > 0 ? planned : menu_price_for_size(selected_drink, key);
                  return (
                    <div key={key} className="rounded-2xl bg-accent/5 px-3 py-2 text-xs">
                      <span className="font-medium text-neutral-800">{size_label(key)}</span>
                      <span className="ml-2 text-neutral-500">себест. {format_rub(cost, 1)}</span>
                      {price > 0 && (
                        <span className={`ml-2 font-medium ${(price - cost) / price < 0.6 ? 'text-red-500' : 'text-emerald-600'}`}>
                          маржа {(((price - cost) / price) * 100).toFixed(0)}% · {format_rub(price)}
                        </span>
                      )}
                    </div>
                  );
                })}
              <AddSize
                existing={Object.keys(card.sizes)}
                on_add={(k) => update_size(card.id, k, (s) => ({ ...s, volume: Number(k) || s.volume }))}
              />
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {Object.keys(card.sizes)
              .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
              .map((key) => {
                const size = card.sizes[key];
                const others = Object.keys(card.sizes).filter((k) => k !== key);
                return (
                  <Card
                    key={key}
                    title={`${size_label(key)} · ${format_rub(tech_card_cost(state, card, key), 1)}`}
                    actions={
                      <>
                        {others.length > 0 && (
                          <select
                            className={`${field_class} w-auto text-xs`}
                            value=""
                            onChange={(e) => {
                              if (e.target.value) copy_size(card.id, e.target.value, key);
                            }}
                          >
                            <option value="">скопировать из…</option>
                            {others.map((k) => (
                              <option key={k} value={k}>
                                {size_label(k)}
                              </option>
                            ))}
                          </select>
                        )}
                        {Object.keys(card.sizes).length > 1 && (
                          <button
                            type="button"
                            className={btn_ghost_danger}
                            onClick={() =>
                              update_card(card.id, (c) => {
                                const sizes = { ...c.sizes };
                                delete sizes[key];
                                return { ...c, sizes };
                              })
                            }
                          >
                            убрать размер
                          </button>
                        )}
                      </>
                    }
                  >
                    <IngredientList
                      title="ингредиенты"
                      rows={size.ingredients}
                      options={raw_materials}
                      state_materials={state.materials}
                      cost_of={(mid, q) => material_cost(state, mid, q)}
                      on_change={(rows) => update_size(card.id, key, (s) => ({ ...s, ingredients: rows }))}
                    />
                    <div className="my-3 border-t border-dashed border-neutral-200" />
                    <IngredientList
                      title="упаковка"
                      rows={size.packaging}
                      options={pack_materials}
                      state_materials={state.materials}
                      cost_of={(mid, q) => material_cost(state, mid, q)}
                      on_change={(rows) => update_size(card.id, key, (s) => ({ ...s, packaging: rows }))}
                    />
                    <div className="my-3 border-t border-dashed border-neutral-200" />
                    <PrepStepsEditor
                      size={size}
                      materials={state.materials}
                      on_change={(next) => update_size(card.id, key, () => next)}
                    />
                  </Card>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="hidden lg:block">
          <EmptyState>выберите напиток слева — рецепт откроется здесь</EmptyState>
        </div>
      )}
    </div>
  );
}

function AddSize({ existing, on_add }: { existing: string[]; on_add: (key: string) => void }) {
  const [val, set_val] = useState('');
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const k = val.trim();
        if (!k || existing.includes(k)) return;
        on_add(k);
        set_val('');
      }}
    >
      <input className={`${cell_input_class} w-24 text-left`} placeholder="объём, мл" value={val} onChange={(e) => set_val(e.target.value)} />
      <button type="submit" className={btn_secondary}>
        + размер
      </button>
    </form>
  );
}

function IngredientList({
  title,
  rows,
  options,
  state_materials,
  cost_of,
  on_change,
}: {
  title: string;
  rows: Record<string, number>;
  options: { id: string; name: string; unit: import('@/lib/finance/model').material_unit }[];
  state_materials: import('@/lib/finance/model').material[];
  cost_of: (material_id: string, qty: number) => number;
  on_change: (rows: Record<string, number>) => void;
}) {
  const [adding, set_adding] = useState('');
  const entries = Object.entries(rows);
  const used = new Set(entries.map(([id]) => id));
  const available = options.filter((o) => !used.has(o.id));
  const total = entries.reduce((s, [id, q]) => s + cost_of(id, q), 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</p>
        <p className="text-xs text-neutral-500">{format_rub(total, 1)}</p>
      </div>
      {entries.length ? (
        <div className="space-y-1.5">
          {entries.map(([id, q]) => {
            const mat = state_materials.find((m) => m.id === id);
            return (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-neutral-800">{mat?.name ?? <span className="text-neutral-400">удалённый материал</span>}</span>
                <div className="flex w-28 items-center gap-1">
                  <NumInput value={q} min={0} on_change={(v) => on_change({ ...rows, [id]: v })} />
                  <span className="w-6 text-xs text-neutral-400">{mat ? base_unit_label(mat.unit) : ''}</span>
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-neutral-500">{format_rub(cost_of(id, q), 1)}</span>
                <button
                  type="button"
                  className={btn_ghost_danger}
                  onClick={() => {
                    const next = { ...rows };
                    delete next[id];
                    on_change(next);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-neutral-400">пусто</p>
      )}
      {available.length > 0 && (
        <select
          className={`${field_class} mt-2 text-xs`}
          value={adding}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            on_change({ ...rows, [id]: 0 });
            set_adding('');
          }}
        >
          <option value="">+ добавить…</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
