'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  craft_cup_ml,
  craft_food_cost,
  craft_headspace_ml,
  ingredient_actions,
  menu_price_from_cost,
} from '@/lib/craft-math';

type craft_material = {
  id: string;
  name: string;
  unit_label: string;
  cost_per_base: number;
};

type craft_shelf = {
  id: string;
  name: string;
  materials: craft_material[];
};

type drop = {
  key: string;
  material_id: string;
  qty: string;
  action: string;
  ask: boolean;
  custom: boolean;
};

type board = {
  id: string;
  caption: string;
  drops: drop[];
};

function new_key() {
  return Math.random().toString(36).slice(2, 9);
}

function fresh_board(): board {
  return { id: new_key(), caption: '', drops: [] };
}

export default function drink_craft() {
  const [shelves, set_shelves] = useState<craft_shelf[] | null>(null);
  const [categories, set_categories] = useState<string[]>([]);
  const [error, set_error] = useState('');
  const [name, set_name] = useState('');
  const [category, set_category] = useState('');
  const [cold, set_cold] = useState(true);
  const [hot, set_hot] = useState(true);
  const [boards, set_boards] = useState<board[]>(() => [fresh_board(), fresh_board(), fresh_board()]);
  const [headspace, set_headspace] = useState(String(craft_headspace_ml));
  const [pick_board, set_pick_board] = useState<string | null>(null);
  const [query, set_query] = useState('');
  const [making, set_making] = useState(false);
  const [new_name, set_new_name] = useState('');
  const [new_measure, set_new_measure] = useState<'g' | 'ml' | 'pcs'>('g');
  const [new_cost, set_new_cost] = useState('');
  const [saving, set_saving] = useState(false);
  const [saved, set_saved] = useState<{ price: number; cost: number } | null>(null);

  useEffect(() => {
    let stop = false;
    fetch('/api/seller/craft', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((body: { shelves?: craft_shelf[]; categories?: string[]; error?: string }) => {
        if (stop) return;
        if (!body.shelves) {
          set_error(body.error || 'не удалось открыть крафт');
          set_shelves([]);
          return;
        }
        set_shelves(body.shelves);
        set_categories(body.categories || []);
        set_category((prev) => prev || body.categories?.[0] || '');
      })
      .catch(() => {
        if (!stop) set_error('не удалось открыть крафт');
      });
    return () => {
      stop = true;
    };
  }, []);

  const materials = useMemo(() => {
    const map = new Map<string, craft_material>();
    for (const shelf of shelves || []) {
      for (const mat of shelf.materials) map.set(mat.id, mat);
    }
    return map;
  }, [shelves]);

  const used = new Set(boards.flatMap((board) => board.drops.map((drop) => drop.material_id)));
  const q = query.trim().toLowerCase();
  const visible_shelves = (shelves || [])
    .map((shelf) => ({
      ...shelf,
      materials: shelf.materials.filter(
        (mat) => !used.has(mat.id) && (!q || mat.name.toLowerCase().includes(q))
      ),
    }))
    .filter((shelf) => shelf.materials.length > 0);

  const cost = boards.reduce((sum, board) => {
    for (const drop of board.drops) {
      const mat = materials.get(drop.material_id);
      const qty = Number(drop.qty);
      if (!mat || !Number.isFinite(qty) || qty <= 0) continue;
      sum += mat.cost_per_base * qty;
    }
    return sum;
  }, 0);
  const price = menu_price_from_cost(cost);

  const filled = boards.reduce((sum, board) => {
    for (const drop of board.drops) {
      const mat = materials.get(drop.material_id);
      const qty = Number(drop.qty);
      if (!mat || mat.unit_label === 'шт' || !Number.isFinite(qty) || qty <= 0) continue;
      sum += qty;
    }
    return sum;
  }, 0);
  const skip = Math.min(craft_cup_ml - 1, Math.max(0, Math.round(Number(headspace) || 0)));
  const room = craft_cup_ml - skip;
  const gap = Math.round((room - filled) * 10) / 10;

  function patch_board(id: string, recipe: (board: board) => board) {
    set_boards((prev) => prev.map((board) => (board.id === id ? recipe(board) : board)));
  }

  function add_drop(board_id: string, material_id: string) {
    const mat = materials.get(material_id);
    patch_board(board_id, (board) => ({
      ...board,
      drops: [
        ...board.drops,
        {
          key: new_key(),
          material_id,
          qty: '',
          action: '',
          ask: true,
          custom: false,
        },
      ],
    }));
    set_pick_board(null);
    set_query('');
    if (mat) set_error('');
  }

  function choose_action(board_id: string, key: string, action: string) {
    patch_board(board_id, (board) => ({
      ...board,
      caption: board.caption.trim() ? board.caption : action,
      drops: board.drops.map((drop) =>
        drop.key === key ? { ...drop, action, ask: false, custom: false } : drop
      ),
    }));
  }

  async function create_material(board_id: string) {
    set_saving(true);
    set_error('');
    try {
      const res = await fetch('/api/seller/craft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'material',
          name: new_name.trim(),
          measure: new_measure,
          cost: Number(new_cost),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        existed?: boolean;
        shelf_id?: string;
        material?: craft_material;
      } | null;
      if (!res.ok || !body?.material) {
        set_error(body?.error || 'не удалось добавить позицию');
        return;
      }
      const material = body.material;
      set_shelves((prev) => {
        const next = (prev || []).map((shelf) => ({ ...shelf, materials: [...shelf.materials] }));
        const shelf = next.find((row) => row.id === body.shelf_id) || next[0];
        if (shelf && !shelf.materials.some((row) => row.id === material.id)) {
          shelf.materials.push(material);
          shelf.materials.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        }
        return next;
      });
      set_new_name('');
      set_new_cost('');
      set_making(false);
      if (body.existed) set_error('такая позиция уже была на складе — берём её');
      add_drop(board_id, material.id);
    } catch {
      set_error('не удалось добавить позицию');
    } finally {
      set_saving(false);
    }
  }

  async function save() {
    set_saving(true);
    set_error('');
    try {
      const res = await fetch('/api/seller/craft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          cold,
          hot,
          boards: boards.map((board) => ({
            caption: board.caption,
            drops: board.drops.map((drop) => ({
              material_id: drop.material_id,
              qty: Number(drop.qty),
              action: drop.action,
            })),
          })),
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; price?: number; cost?: number } | null;
      if (!res.ok) {
        set_error(body?.error || 'не удалось поставить в меню');
        return;
      }
      set_saved({ price: body?.price || price, cost: body?.cost || cost });
    } catch {
      set_error('не удалось поставить в меню');
    } finally {
      set_saving(false);
    }
  }

  if (saved) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center">
        <p className="text-sm uppercase tracking-[0.16em] text-accent">крафт</p>
        <h1 className="mt-3 text-3xl font-semibold">{name.trim()}</h1>
        <p className="mt-3 text-neutral-500">в меню за {Math.round(saved.price).toLocaleString('ru-RU')} ₽</p>
        <p className="mt-1 text-sm text-neutral-400">
          себестоимость {Math.round(saved.cost).toLocaleString('ru-RU')} ₽ · фудкост 18%
        </p>
        <button
          type="button"
          onClick={() => {
            set_saved(null);
            set_name('');
            set_cold(true);
            set_hot(true);
            set_boards([fresh_board(), fresh_board(), fresh_board()]);
            set_error('');
          }}
          className="mt-8 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
        >
          ещё напиток
        </button>
      </div>
    );
  }

  const cost_label =
    new_measure === 'pcs' ? 'цена за штуку' : new_measure === 'ml' ? 'цена за литр' : 'цена за кг';

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="sticky top-0 z-10 mb-3 flex items-start justify-between gap-3 bg-white/90 py-1 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">крафт</p>
          <input
            value={name}
            onChange={(e) => set_name(e.target.value)}
            placeholder="название напитка"
            maxLength={40}
            className="mt-1 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-neutral-300"
          />
        </div>
        <div className="shrink-0 rounded-2xl bg-neutral-900 px-3 py-2 text-right text-white">
          <p className="text-[10px] uppercase tracking-wide text-white/50">себестоимость</p>
          <p className="text-lg font-semibold tabular-nums">{Math.round(cost).toLocaleString('ru-RU')} ₽</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-white/50">в меню</p>
          <p className="text-lg font-semibold tabular-nums">{price ? `${price.toLocaleString('ru-RU')} ₽` : '—'}</p>
          <p className="text-[10px] text-white/40">фудкост {Math.round(craft_food_cost * 100)}%</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => set_cold((on) => !on)}
          className={`rounded-full px-2.5 py-1 text-xs ${cold ? 'bg-sky-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}
        >
          холодный
        </button>
        <button
          type="button"
          onClick={() => set_hot((on) => !on)}
          className={`rounded-full px-2.5 py-1 text-xs ${hot ? 'bg-rose-500 text-white' : 'bg-neutral-100 text-neutral-500'}`}
        >
          горячий
        </button>
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => set_category(item)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              category === item ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {boards.map((board, index) => (
          <section key={board.id} className="flex min-h-48 flex-col rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] tabular-nums text-neutral-400">{index + 1}</span>
              <input
                value={board.caption}
                onChange={(e) => patch_board(board.id, (row) => ({ ...row, caption: e.target.value }))}
                placeholder="подпись действия"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-neutral-300"
              />
              {boards.length > 1 ? (
                <button
                  type="button"
                  aria-label="убрать табличку"
                  onClick={() => set_boards((prev) => prev.filter((row) => row.id !== board.id))}
                  className="text-sm text-neutral-400"
                >
                  ×
                </button>
              ) : null}
            </div>
            <ul className="mt-2 space-y-2">
              {board.drops.map((drop) => {
                const mat = materials.get(drop.material_id);
                const offers = ingredient_actions(mat?.name || '', mat?.unit_label || 'г');
                return (
                  <li key={drop.key} className="rounded-xl bg-white px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{mat?.name || 'ингредиент'}</p>
                      <input
                        value={drop.qty}
                        onChange={(e) => {
                          const qty = e.target.value.replace(/[^\d.]/g, '');
                          patch_board(board.id, (row) => ({
                            ...row,
                            drops: row.drops.map((item) => (item.key === drop.key ? { ...item, qty } : item)),
                          }));
                        }}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-14 rounded-lg border border-neutral-200 px-1.5 py-1 text-right text-sm tabular-nums outline-none"
                      />
                      <span className="w-6 text-[11px] text-neutral-400">{mat?.unit_label}</span>
                      <button
                        type="button"
                        aria-label="убрать ингредиент"
                        onClick={() =>
                          patch_board(board.id, (row) => ({
                            ...row,
                            drops: row.drops.filter((item) => item.key !== drop.key),
                          }))
                        }
                        className="text-sm text-neutral-400"
                      >
                        ×
                      </button>
                    </div>
                    {drop.ask ? (
                      <div className="mt-2">
                        <p className="text-[11px] uppercase tracking-wide text-neutral-400">что с ним сделать</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {offers.map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => choose_action(board.id, drop.key, action)}
                              className="rounded-full bg-neutral-900 px-2.5 py-1 text-left text-xs text-white"
                            >
                              {action}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              patch_board(board.id, (row) => ({
                                ...row,
                                drops: row.drops.map((item) =>
                                  item.key === drop.key ? { ...item, custom: true } : item
                                ),
                              }))
                            }
                            className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600"
                          >
                            свой вариант
                          </button>
                        </div>
                        {drop.custom ? (
                          <input
                            autoFocus
                            placeholder="как сделать"
                            className="mt-2 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none"
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              const value = e.currentTarget.value.trim();
                              if (value) choose_action(board.id, drop.key, value);
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value) choose_action(board.id, drop.key, value);
                            }}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          patch_board(board.id, (row) => ({
                            ...row,
                            drops: row.drops.map((item) =>
                              item.key === drop.key ? { ...item, ask: true } : item
                            ),
                          }))
                        }
                        className="mt-1 text-left text-xs text-neutral-500"
                      >
                        {drop.action || 'выбрать действие'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                set_pick_board(board.id);
                set_making(false);
                set_query('');
              }}
              className="mt-auto pt-3 text-left text-sm text-neutral-500"
            >
              + ингредиент
            </button>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => set_boards((prev) => [...prev, fresh_board()])}
        className="mt-2 self-start text-sm text-neutral-500"
      >
        + табличка
      </button>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center">
        <p className="text-sm text-neutral-500">
          стакан {craft_cup_ml} мл, не доливаем{' '}
          <input
            value={headspace}
            onChange={(e) => set_headspace(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="w-12 border-b border-neutral-300 bg-transparent text-center tabular-nums outline-none"
          />{' '}
          мл
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {gap > 0 ? `не хватает ${gap.toLocaleString('ru-RU')} мл` : gap < 0 ? `больше на ${Math.abs(gap).toLocaleString('ru-RU')} мл` : 'объём собран'}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          уже {Math.round(filled).toLocaleString('ru-RU')} мл из {room} · штуки в объём не входят
        </p>
      </div>

      {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}

      <button
        type="button"
        disabled={saving || name.trim().length < 2 || !boards.some((board) => board.drops.some((drop) => Number(drop.qty) > 0))}
        onClick={() => void save()}
        className="mx-auto mt-4 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
      >
        {saving ? 'сохраняю…' : 'поставить в меню'}
      </button>

      </div>
      {pick_board ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/30 p-3 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">со склада</p>
              <button type="button" onClick={() => set_pick_board(null)} className="text-sm text-neutral-400">
                закрыть
              </button>
            </div>
            <input
              value={query}
              onChange={(e) => set_query(e.target.value)}
              placeholder="найти"
              className="mt-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            {visible_shelves.map((shelf) => (
              <div key={shelf.id} className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-neutral-400">{shelf.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {shelf.materials.map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => add_drop(pick_board, mat.id)}
                      className="rounded-full border border-neutral-200 px-2.5 py-1 text-sm"
                    >
                      {mat.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <button type="button" onClick={() => set_making((value) => !value)} className="text-sm text-neutral-600">
                {making ? 'скрыть новую позицию' : '+ новой позиции нет на складе'}
              </button>
              {making ? (
                <div className="mt-2 space-y-2">
                  <input
                    value={new_name}
                    onChange={(e) => set_new_name(e.target.value)}
                    placeholder="название"
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none"
                  />
                  <div className="flex gap-1.5">
                    {(
                      [
                        ['g', 'граммы'],
                        ['ml', 'миллилитры'],
                        ['pcs', 'штуки'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => set_new_measure(id)}
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          new_measure === id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={new_cost}
                    onChange={(e) => set_new_cost(e.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    placeholder={cost_label}
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    disabled={saving || new_name.trim().length < 2 || !(Number(new_cost) > 0)}
                    onClick={() => void create_material(pick_board)}
                    className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                  >
                    на склад и в напиток
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
