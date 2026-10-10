'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  apply_adjust,
  apply_inventory_count,
  apply_receipt,
  apply_writeoff,
  base_unit_label,
  format_base_qty,
  format_rub,
  movement_money,
  movements_in_range,
  new_id,
  merge_stock_categories,
  needs_stock_count,
  next_finder_color,
  remove_stock_movement,
  stock_category_for,
  stock_levels,
  warehouse_money,
  unit_labels,
  type material,
  type stock_actor,
  type stock_audit_action,
  type stock_audit_entry,
  type stock_category,
  type stock_movement,
} from '@/lib/finance/model';
import InventoryCount from '@/components/admin/finance/inventory-count';
import {
  Card,
  EmptyState,
  NumInput,
  TableWrap,
  btn_accent,
  btn_ghost_danger,
  btn_primary,
  btn_secondary,
  cell_input_class,
  field_class,
  td_class,
  td_num_class,
  th_class,
  th_num_class,
} from '@/components/admin/finance/ui';
import type { section_props } from '@/components/admin/finance/use-finance';

const movement_labels: Record<stock_movement['type'], string> = {
  in: 'поступление',
  out: 'расход',
  writeoff: 'списание',
  adjust: 'инвентаризация',
  sale: 'заказ',
  staff: 'персонал',
};

const movement_tone: Record<stock_movement['type'], string> = {
  in: 'bg-emerald-50 text-emerald-700',
  out: 'bg-neutral-100 text-neutral-600',
  writeoff: 'bg-red-50 text-red-600',
  adjust: 'bg-amber-50 text-amber-700',
  sale: 'bg-sky-50 text-sky-700',
  staff: 'bg-violet-50 text-violet-700',
};

const ADMIN_ACTOR: stock_actor = { id: 'admin', name: 'админ', role: 'admin' };

const audit_labels: Record<stock_audit_action, string> = {
  adjust: 'правка остатка',
  inventory: 'инвентаризация',
  writeoff: 'списание',
  receipt: 'поступление',
  delete_movement: 'удаление движения',
};

function actor_label(name?: string, role?: string) {
  if (!name) return '—';
  if (role === 'seller') return `${name} · касса`;
  if (role === 'admin') return `${name} · админ`;
  return name;
}

type journal_order_row = {
  kind: 'order';
  orderId: string;
  type: 'sale' | 'staff';
  date: string;
  lines: stock_movement[];
  total: number;
};

type journal_single_row = {
  kind: 'single';
  mv: stock_movement;
  date: string;
};

type journal_row = journal_order_row | journal_single_row;

function build_journal_rows(period_mv: stock_movement[], materials: material[]): journal_row[] {
  const by_order = new Map<string, stock_movement[]>();
  const singles: stock_movement[] = [];
  for (const mv of period_mv) {
    if ((mv.type === 'sale' || mv.type === 'staff') && mv.orderId) {
      const list = by_order.get(mv.orderId) ?? [];
      list.push(mv);
      by_order.set(mv.orderId, list);
    } else {
      singles.push(mv);
    }
  }
  const rows: journal_row[] = [];
  for (const [orderId, lines] of by_order) {
    const date = lines.reduce((best, cur) => (cur.date > best ? cur.date : best), lines[0].date);
    const type = lines.some((l) => l.type === 'staff') ? 'staff' : 'sale';
    const total = lines.reduce((s, mv) => {
      const mat = materials.find((m) => m.id === mv.materialId);
      return s + movement_money(mat, mv);
    }, 0);
    rows.push({ kind: 'order', orderId, type, date, lines, total });
  }
  for (const mv of singles) {
    rows.push({ kind: 'single', mv, date: mv.date });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

function today_iso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function month_start_iso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function to_iso(date_str: string) {
  const d = new Date(`${date_str}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function cat_of(cats: stock_category[], id: string) {
  return cats.find((c) => c.id === id) ?? cats[0];
}

function CursorMenu({
  x,
  y,
  marker,
  children,
}: {
  x: number;
  y: number;
  marker: 'cat-menu' | 'cat-pick';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, set_pos] = useState({ top: y + 8, left: x + 8, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = y + 8;
    const above = y - height - 8;
    const fits_below = below + height <= vh - pad;
    const fits_above = above >= pad;
    let top = fits_below ? below : fits_above ? above : Math.max(pad, vh - height - pad);
    let left = x + 8;
    if (left + width > vw - pad) left = vw - width - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    set_pos({ top, left, ready: true });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      {...(marker === 'cat-menu' ? { 'data-cat-menu': '' } : { 'data-cat-pick': '' })}
      className="fixed z-[80] max-h-[min(70vh,22rem)] min-w-[12rem] overflow-y-auto rounded-2xl border border-neutral-200/80 bg-white p-1 shadow-soft"
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body
  );
}

export default function InventorySection({ state, set_state }: section_props) {
  const today = today_iso();
  const [from, set_from] = useState(month_start_iso());
  const [to, set_to] = useState(today);
  const [category, set_category] = useState('все');
  const [query, set_query] = useState('');
  const [receipt_open, set_receipt_open] = useState(false);
  const [count_open, set_count_open] = useState(false);
  const [history_open, set_history_open] = useState(false);
  const [expanded_orders, set_expanded_orders] = useState<Set<string>>(() => new Set());
  const [writeoff_for, set_writeoff_for] = useState<string | null>(null);
  const [adjust_for, set_adjust_for] = useState<string | null>(null);
  const [cat_menu, set_cat_menu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, set_renaming] = useState(false);
  const [rename_draft, set_rename_draft] = useState('');
  const [adding_cat, set_adding_cat] = useState(false);
  const [new_cat_name, set_new_cat_name] = useState('');
  const [cat_pick, set_cat_pick] = useState<{ x: number; y: number; materialId: string | 'new' } | null>(null);
  const [focus_mat, set_focus_mat] = useState<string | null>(null);
  const [dates_open, set_dates_open] = useState(false);

  const restored_defaults = useRef(false);
  const must_count = needs_stock_count(state);

  useEffect(() => {
    if (must_count) set_count_open(true);
  }, [must_count]);

  useEffect(() => {
    if (!cat_menu && !cat_pick && !dates_open) return;
    const close = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('[data-cat-menu],[data-cat-pick],[data-dates-pop]')) return;
      set_cat_menu(null);
      set_renaming(false);
      set_cat_pick(null);
      set_dates_open(false);
    };
    const t = window.setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', close, true);
    };
  }, [cat_menu, cat_pick, dates_open]);

  useEffect(() => {
    if (restored_defaults.current) return;
    restored_defaults.current = true;
    set_state((prev) => {
      const cats = merge_stock_categories(prev.stockCategories ?? []);
      const materials = prev.materials.map((m) => {
        const cat = stock_category_for(m);
        return cat === m.category ? m : { ...m, category: cat };
      });
      const cats_same =
        cats.length === (prev.stockCategories?.length ?? 0) &&
        cats.every((c, i) => c.id === prev.stockCategories[i]?.id && c.name === prev.stockCategories[i]?.name);
      const mats_same = materials.every((m, i) => m.category === prev.materials[i]?.category);
      if (cats_same && mats_same) return prev;
      return { ...prev, stockCategories: cats, materials };
    });
  }, [set_state]);

  const range_from = from <= to ? from : to;
  const range_to = from <= to ? to : from;
  const dates_custom = range_from !== month_start_iso() || range_to !== today;

  const cats = state.stockCategories?.length ? state.stockCategories : [];
  const stock = useMemo(() => stock_levels(state, range_to), [state, range_to]);
  const period_mv = useMemo(() => movements_in_range(state, range_from, range_to), [state, range_from, range_to]);
  const stock_value = stock.reduce((s, r) => s + r.value, 0);
  const money = useMemo(() => warehouse_money(state, range_to), [state, range_to]);
  const [earned_revenue, set_earned_revenue] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    set_earned_revenue(null);
    fetch(`/api/admin/finance/sales?from=2024-01-01&to=${range_to}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { revenue?: number; error?: string }) => {
        if (cancelled || body.error) return;
        set_earned_revenue(Number(body.revenue) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range_to]);

  const earned = earned_revenue == null ? null : earned_revenue - money.realized;
  const writeoffs_sum = period_mv
    .filter((m) => m.type === 'writeoff')
    .reduce((s, m) => {
      const mat = state.materials.find((x) => x.id === m.materialId);
      return s + movement_money(mat, m);
    }, 0);

  const journal_rows = useMemo(() => build_journal_rows(period_mv, state.materials), [period_mv, state.materials]);

  function toggle_order(orderId: string) {
    set_expanded_orders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  const visible = stock
    .filter((s) => {
      if (category !== 'все' && s.material.category !== category) return false;
      if (query && !s.material.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const ia = cats.findIndex((c) => c.id === a.material.category);
      const ib = cats.findIndex((c) => c.id === b.material.category);
      const ca = ia < 0 ? 999 : ia;
      const cb = ib < 0 ? 999 : ib;
      if (ca !== cb) return ca - cb;
      return a.material.name.localeCompare(b.material.name, 'ru');
    });

  useEffect(() => {
    if (!focus_mat) return;
    const el = document.querySelector(`[data-mat-name="${focus_mat}"]`) as HTMLInputElement | null;
    el?.focus();
    set_focus_mat(null);
  }, [focus_mat]);

  function update_material(id: string, patch: Partial<material>) {
    set_state((prev) => ({ ...prev, materials: prev.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }

  function add_material(cat_id: string) {
    const id = new_id('mat');
    set_state((prev) => ({
      ...prev,
      materials: [...prev.materials, { id, name: '', category: cat_id, unit: 'kg', costPerUnit: 0 }],
    }));
    if (category !== 'все' && category !== cat_id) set_category(cat_id);
    set_focus_mat(id);
    set_cat_pick(null);
  }

  function pick_category(cat_id: string) {
    if (!cat_pick) return;
    if (cat_pick.materialId === 'new') add_material(cat_id);
    else update_material(cat_pick.materialId, { category: cat_id });
    set_cat_pick(null);
  }

  function remove_material(id: string) {
    const used = state.techCards.some((c) =>
      Object.values(c.sizes).some((s) => s.ingredients[id] != null || s.packaging[id] != null)
    );
    if (used && !window.confirm('материал используется в техкартах. удалить всё равно?')) return;
    if (!used && !window.confirm('удалить позицию и её историю?')) return;
    set_state((prev) => ({
      ...prev,
      materials: prev.materials.filter((m) => m.id !== id),
      stockMovements: prev.stockMovements.filter((m) => m.materialId !== id),
      techCards: prev.techCards.map((c) => ({
        ...c,
        sizes: Object.fromEntries(
          Object.entries(c.sizes).map(([k, s]) => {
            const ing = { ...s.ingredients };
            const pk = { ...s.packaging };
            delete ing[id];
            delete pk[id];
            return [k, { ...s, ingredients: ing, packaging: pk }];
          })
        ),
      })),
    }));
  }

  function commit_add_category() {
    const name = new_cat_name.trim();
    if (!name) {
      set_adding_cat(false);
      set_new_cat_name('');
      return;
    }
    const id = new_id('scat');
    const color = next_finder_color(cats.map((c) => c.color));
    set_state((prev) => ({
      ...prev,
      stockCategories: [...prev.stockCategories, { id, name, color }],
    }));
    set_category(id);
    set_adding_cat(false);
    set_new_cat_name('');
  }

  function rename_category(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    set_state((prev) => ({
      ...prev,
      stockCategories: prev.stockCategories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    }));
    hide_cat_menu();
  }

  function delete_category(id: string) {
    const cur = cats.find((c) => c.id === id);
    if (!cur) return;
    const fallback = cats.find((c) => c.id !== id)?.id ?? 'raw';
    set_state((prev) => ({
      ...prev,
      stockCategories: prev.stockCategories.filter((c) => c.id !== id),
      materials: prev.materials.map((m) => (m.category === id ? { ...m, category: fallback } : m)),
    }));
    if (category === id) set_category('все');
    hide_cat_menu();
  }

  function hide_cat_menu() {
    set_cat_menu(null);
    set_renaming(false);
  }

  return (
    <div className="space-y-8">
      {(count_open || must_count) && (
        <InventoryCount
          rows={stock_levels(state)}
          cats={cats}
          required={must_count}
          on_commit={(facts, date) => {
            set_state((prev) => apply_inventory_count(prev, facts, date, ADMIN_ACTOR));
            set_count_open(false);
          }}
          on_close={() => {
            if (must_count) return;
            set_count_open(false);
          }}
        />
      )}
      {receipt_open && (
        <ReceiptForm
          materials={state.materials}
          on_close={() => set_receipt_open(false)}
          on_submit={(rows) => {
            set_state((prev) => rows.reduce((s, r) => apply_receipt(s, { ...r, actor: ADMIN_ACTOR }), prev));
            set_receipt_open(false);
          }}
        />
      )}

      {/* ——— 1. склад ——— */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">раздел 1</p>
            <h2 className="font-heading-soft text-lg text-neutral-900">склад — что лежит</h2>
            <p className="mt-0.5 text-sm text-neutral-500">остатки сырья, цена закупки и сумма на полке</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn_secondary} onClick={() => set_count_open(true)}>
              инвентаризация
            </button>
            <button
              type="button"
              className={btn_accent}
              disabled={must_count}
              onClick={() => {
                if (must_count) return;
                set_receipt_open(true);
              }}
            >
              + поступление
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <p className="text-neutral-500" title="сколько ещё лежит, по цене закупки">
            на складе{' '}
            <span className="font-heading-soft text-lg tabular-nums text-neutral-900">{format_rub(stock_value)}</span>
          </p>
          <p className="text-neutral-500" title="граммы и поступления, пересчитанные в рубли закупки">
            потрачено{' '}
            <span className="font-heading-soft text-lg tabular-nums text-neutral-900">{format_rub(money.spent)}</span>
          </p>
          <p className="text-neutral-500" title="себестоимость сырья, которое уже ушло в напитки">
            реализовано{' '}
            <span className="font-heading-soft text-lg tabular-nums text-neutral-900">{format_rub(money.realized)}</span>
          </p>
          <p className="text-neutral-500" title="выручка напитков минус себестоимость сырья">
            заработано{' '}
            <span className="font-heading-soft text-lg tabular-nums text-neutral-900">
              {earned == null ? '…' : format_rub(earned)}
            </span>
          </p>
          {writeoffs_sum > 0 ? (
            <p className="text-neutral-500">
              списания{' '}
              <span className="font-heading-soft text-lg tabular-nums text-neutral-900">{format_rub(writeoffs_sum)}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => set_category('все')}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                category === 'все' ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              все
            </button>
            {cats.map((c) => {
              const active = category === c.id;
              return (
                <span key={c.id} className="group relative shrink-0">
                  <button
                    type="button"
                    onClick={() => set_category(c.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-8 text-sm ${
                      active ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.name}
                  </button>
                  <button
                    type="button"
                    data-cat-menu
                    aria-label={`править «${c.name}»`}
                    onClick={(e) => {
                      e.stopPropagation();
                      set_renaming(false);
                      set_cat_menu({ id: c.id, x: e.clientX, y: e.clientY });
                    }}
                    className="absolute right-1 top-1/2 z-[1] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-700 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-opacity hover:text-accent group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </span>
              );
            })}
            {adding_cat ? (
              <input
                autoFocus
                value={new_cat_name}
                onChange={(e) => set_new_cat_name(e.target.value)}
                onBlur={commit_add_category}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit_add_category();
                  }
                  if (e.key === 'Escape') {
                    set_adding_cat(false);
                    set_new_cat_name('');
                  }
                }}
                placeholder="название"
                className="h-[34px] w-36 shrink-0 rounded-full border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-accent/50"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  set_adding_cat(true);
                  set_new_cat_name('');
                }}
                className="shrink-0 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-400"
              >
                + категория
              </button>
            )}
          </div>
          <input
            type="search"
            className="h-[34px] w-[11.5rem] shrink-0 rounded-pill border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-accent/40"
            placeholder="найти позицию"
            value={query}
            onChange={(e) => set_query(e.target.value)}
          />
        </div>

        <ul className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {visible.length === 0 && <li className="px-4 py-10 text-center text-sm text-neutral-400">пусто</li>}
          {visible.map((s) => {
            const tag = cat_of(cats, s.material.category);
            return (
              <li key={s.material.id} className="flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5 first:border-t-0">
                <button
                  type="button"
                  data-cat-pick
                  className="inline-flex max-w-[9.5rem] shrink-0 items-center gap-1.5 rounded-full px-1 py-0.5 text-left hover:bg-neutral-50"
                  title="сменить категорию"
                  onClick={(e) => {
                    e.stopPropagation();
                    set_cat_pick({ x: e.clientX, y: e.clientY, materialId: s.material.id });
                  }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tag?.color ?? '#8E8E93' }} />
                  <span className="truncate text-xs text-neutral-500">{tag?.name ?? 'категория'}</span>
                </button>
                <input
                  data-mat-name={s.material.id}
                  className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none"
                  value={s.material.name}
                  placeholder="название"
                  onChange={(e) => update_material(s.material.id, { name: e.target.value })}
                />
                <span className={`w-24 shrink-0 text-right text-sm tabular-nums ${s.qty < 0 ? 'text-amber-600' : 'text-neutral-800'}`}>
                  {format_base_qty(s.material, s.qty)}
                </span>
                <span
                  className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-neutral-400 sm:block"
                  title="средняя цена закупки за единицу"
                >
                  {format_rub(s.material.costPerUnit, 2)}/{unit_labels[s.material.unit]}
                </span>
                <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-neutral-500 md:block">
                  {format_rub(s.value)}
                </span>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  onClick={() => set_writeoff_for(s.material.id)}
                >
                  списать
                </button>
                <button
                  type="button"
                  className="hidden rounded-lg px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 sm:inline"
                  onClick={() => set_adjust_for(s.material.id)}
                >
                  факт
                </button>
                <button type="button" className={btn_ghost_danger} onClick={() => remove_material(s.material.id)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-center">
          <button
            type="button"
            data-cat-pick
            onClick={(e) => {
              set_cat_pick({ x: e.clientX, y: e.clientY, materialId: 'new' });
            }}
            aria-label="добавить позицию"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-lg leading-none text-neutral-400 shadow-soft transition-colors hover:border-accent/40 hover:text-accent"
          >
            +
          </button>
        </div>
      </section>

      {/* ——— 2. движения ——— */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">раздел 2</p>
            <h2 className="font-heading-soft text-lg text-neutral-900">движения — заказы и накладные</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              заказ одной строкой · нажми — увидишь полный расход сырья
            </p>
          </div>
          <div className="relative shrink-0" data-dates-pop>
            <button
              type="button"
              aria-label="период движений"
              aria-expanded={dates_open}
              onClick={() => set_dates_open((v) => !v)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm transition-colors ${
                dates_open || dates_custom
                  ? 'bg-accent/10 text-accent'
                  : 'border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {range_from === range_to
                ? range_from
                : `${range_from.slice(8)}.${range_from.slice(5, 7)} — ${range_to.slice(8)}.${range_to.slice(5, 7)}`}
            </button>
            {dates_open && (
              <div className="absolute right-0 top-full z-40 mt-1 w-[16.5rem] rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-soft">
                <p className="text-[11px] leading-snug text-neutral-400">заказы и поступления за эти дни</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-neutral-400">
                    с
                    <input
                      type="date"
                      max={today}
                      className={`${field_class} mt-1 rounded-xl px-2 py-1.5`}
                      value={range_from}
                      onChange={(e) => set_from(e.target.value || range_from)}
                    />
                  </label>
                  <label className="text-[11px] text-neutral-400">
                    по
                    <input
                      type="date"
                      max={today}
                      className={`${field_class} mt-1 rounded-xl px-2 py-1.5`}
                      value={range_to}
                      onChange={(e) => set_to(e.target.value || range_to)}
                    />
                  </label>
                </div>
                {dates_custom ? (
                  <button
                    type="button"
                    className="mt-2 text-[11px] text-neutral-400 hover:text-neutral-700"
                    onClick={() => {
                      set_from(month_start_iso());
                      set_to(today);
                    }}
                  >
                    этот месяц
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <Card>
          {journal_rows.length ? (
            <ul className="divide-y divide-neutral-100">
              {journal_rows.slice(0, 120).map((row) => {
                if (row.kind === 'order') {
                  const open = expanded_orders.has(row.orderId);
                  const short = row.orderId.slice(0, 8);
                  return (
                    <li key={`ord-${row.orderId}`}>
                      <button
                        type="button"
                        onClick={() => toggle_order(row.orderId)}
                        className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-neutral-50/80"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-transform ${
                            open ? 'rotate-90' : ''
                          }`}
                        >
                          ▸
                        </span>
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${movement_tone[row.type]}`}>
                          {row.type === 'staff' ? 'персонал' : 'заказ'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-sm text-neutral-900">{short}</span>
                          <span className="ml-2 text-xs text-neutral-400">
                            {new Date(row.date).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {' · '}
                            {row.lines.length} поз.
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-900">
                          −{format_rub(row.total)}
                        </span>
                      </button>
                      {open ? (
                        <div className="mb-2 ml-9 mr-1 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50/60">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[11px] text-neutral-400">
                                <th className="px-3 py-1.5 text-left font-normal">сырьё</th>
                                <th className="px-3 py-1.5 text-right font-normal">кол-во</th>
                                <th className="px-3 py-1.5 text-right font-normal">₽</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...row.lines]
                                .sort((a, b) => {
                                  const na = state.materials.find((m) => m.id === a.materialId)?.name || '';
                                  const nb = state.materials.find((m) => m.id === b.materialId)?.name || '';
                                  return na.localeCompare(nb, 'ru');
                                })
                                .map((mv) => {
                                  const mat = state.materials.find((m) => m.id === mv.materialId);
                                  return (
                                    <tr key={mv.id} className="border-t border-neutral-100/80">
                                      <td className="px-3 py-1.5 text-neutral-800">{mat?.name || mv.materialId}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-600">
                                        {mat ? format_base_qty(mat, mv.qty) : mv.qty}
                                      </td>
                                      <td className="px-3 py-1.5 text-right tabular-nums text-neutral-800">
                                        {format_rub(movement_money(mat, mv))}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-neutral-200">
                                <td className="px-3 py-1.5 text-xs text-neutral-400" colSpan={2}>
                                  итого себестоимость
                                </td>
                                <td className="px-3 py-1.5 text-right text-sm font-semibold tabular-nums">
                                  {format_rub(row.total)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                          <div className="flex justify-end border-t border-neutral-100 px-3 py-1.5">
                            <button
                              type="button"
                              className={btn_ghost_danger}
                              onClick={() => {
                                if (!window.confirm(`удалить все списания заказа ${short}?`)) return;
                                set_state((prev) =>
                                  row.lines.reduce((s, mv) => remove_stock_movement(s, mv.id, ADMIN_ACTOR), prev)
                                );
                              }}
                            >
                              удалить заказ со склада
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                }

                const mv = row.mv;
                const mat = state.materials.find((m) => m.id === mv.materialId);
                return (
                  <li key={mv.id} className="flex items-center gap-3 px-1 py-2.5">
                    <span className="w-6 shrink-0" />
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${movement_tone[mv.type]}`}>
                      {movement_labels[mv.type]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm text-neutral-900">{mat?.name || '—'}</span>
                      <span className="ml-2 text-xs text-neutral-400">
                        {new Date(mv.date).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {mv.note ? ` · ${mv.note}` : ''}
                        {mv.actorName ? ` · ${actor_label(mv.actorName, mv.actorRole)}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-neutral-700">
                      {mv.type === 'adjust' ? '= ' : mv.type === 'in' ? '+ ' : '− '}
                      {mat ? format_base_qty(mat, mv.qty) : mv.qty}
                    </span>
                    <span className="w-20 shrink-0 text-right text-sm tabular-nums text-neutral-900">
                      {mv.type === 'adjust' ? '—' : format_rub(movement_money(mat, mv))}
                    </span>
                    <button
                      type="button"
                      className={btn_ghost_danger}
                      onClick={() => {
                        if (!window.confirm('удалить движение?')) return;
                        set_state((prev) => remove_stock_movement(prev, mv.id, ADMIN_ACTOR));
                      }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState>за эти даты движений нет</EmptyState>
          )}
        </Card>
      </section>

      {/* ——— 3. история ——— */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">раздел 3</p>
            <h2 className="font-heading-soft text-lg text-neutral-900">история правок</h2>
            <p className="mt-0.5 text-sm text-neutral-500">кто вручную менял остатки — отдельно от склада и заказов</p>
          </div>
          <button
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs ${
              history_open ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
            }`}
            onClick={() => set_history_open((v) => !v)}
          >
            {history_open ? 'свернуть' : 'открыть'}
          </button>
        </div>
        {history_open ? <AuditHistory entries={state.stockAudit ?? []} materials={state.materials} /> : null}
      </section>

      {writeoff_for && (
        <QtyDialog
          title="списание"
          material={state.materials.find((m) => m.id === writeoff_for)!}
          current={stock.find((s) => s.material.id === writeoff_for)?.qty ?? 0}
          submit_label="списать"
          default_note="порча / брак"
          on_close={() => set_writeoff_for(null)}
          on_submit={(qty, note, date) => {
            set_state((prev) => apply_writeoff(prev, writeoff_for, qty, note, to_iso(date), ADMIN_ACTOR));
            set_writeoff_for(null);
          }}
        />
      )}
      {adjust_for && (
        <QtyDialog
          title="инвентаризация — фактический остаток"
          material={state.materials.find((m) => m.id === adjust_for)!}
          current={stock.find((s) => s.material.id === adjust_for)?.qty ?? 0}
          submit_label="выставить остаток"
          default_note="инвентаризация"
          initial_qty={Math.max(0, stock.find((s) => s.material.id === adjust_for)?.qty ?? 0)}
          on_close={() => set_adjust_for(null)}
          on_submit={(qty, note, date) => {
            set_state((prev) => apply_adjust(prev, adjust_for, qty, note, to_iso(date), ADMIN_ACTOR));
            set_adjust_for(null);
          }}
        />
      )}
      {cat_menu && (
        <CursorMenu key={renaming ? 'rename' : 'actions'} x={cat_menu.x} y={cat_menu.y} marker="cat-menu">
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  rename_category(cat_menu.id, rename_draft);
                }}
                className="p-1"
              >
                <input
                  autoFocus
                  value={rename_draft}
                  onChange={(e) => set_rename_draft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') set_renaming(false);
                  }}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-accent/50"
                />
                <button type="submit" className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-800 hover:bg-accent/10">
                  сохранить
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-800 hover:bg-accent/10"
                  onClick={() => {
                    const cur = cats.find((c) => c.id === cat_menu.id);
                    set_rename_draft(cur?.name ?? '');
                    set_renaming(true);
                  }}
                >
                  переименовать
                </button>
                <button
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50"
                  onClick={() => delete_category(cat_menu.id)}
                >
                  удалить
                </button>
              </>
            )}
        </CursorMenu>
      )}
      {cat_pick && (
        <CursorMenu x={cat_pick.x} y={cat_pick.y} marker="cat-pick">
            <p className="px-3 py-1.5 text-[11px] text-neutral-400">
              {cat_pick.materialId === 'new' ? 'в какую категорию' : 'категория'}
            </p>
            {cats.map((c) => {
              const current =
                cat_pick.materialId === 'new'
                  ? category === 'все'
                    ? null
                    : category
                  : state.materials.find((m) => m.id === cat_pick.materialId)?.category;
              return (
              <button
                key={c.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-neutral-800 hover:bg-accent/10 ${
                  current === c.id ? 'bg-accent/10' : ''
                }`}
                onClick={() => pick_category(c.id)}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
              );
            })}
        </CursorMenu>
      )}
    </div>
  );
}

function AuditHistory({
  entries,
  materials,
}: {
  entries: stock_audit_entry[];
  materials: material[];
}) {
  const rows = [...entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
  return (
    <Card hint="храним 3 месяца в supabase">
      {rows.length ? (
        <TableWrap>
          <thead>
            <tr>
              <th className={th_class}>когда</th>
              <th className={th_class}>кто</th>
              <th className={th_class}>действие</th>
              <th className={th_class}>позиция</th>
              <th className={th_num_class}>было</th>
              <th className={th_num_class}>стало</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const mat = materials.find((m) => m.id === e.materialId);
              return (
                <tr key={e.id} className="border-t border-neutral-100">
                  <td className={`${td_class} whitespace-nowrap text-neutral-500`}>
                    {new Date(e.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className={td_class}>
                    <span className="text-neutral-800">{e.actorName}</span>
                    <span className="ml-1 text-[11px] text-neutral-400">{e.actorRole === 'seller' ? 'касса' : 'админ'}</span>
                  </td>
                  <td className={td_class}>
                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                      {audit_labels[e.action]}
                    </span>
                  </td>
                  <td className={td_class}>{e.materialName || mat?.name || '—'}</td>
                  <td className={td_num_class}>
                    {e.qtyBefore == null ? (
                      <span className="text-neutral-300">—</span>
                    ) : mat ? (
                      format_base_qty(mat, e.qtyBefore)
                    ) : (
                      e.qtyBefore
                    )}
                  </td>
                  <td className={td_num_class}>
                    {e.qtyAfter == null ? (
                      <span className="text-neutral-300">—</span>
                    ) : mat ? (
                      format_base_qty(mat, e.qtyAfter)
                    ) : (
                      e.qtyAfter
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      ) : (
        <EmptyState>пока никто ничего не менял</EmptyState>
      )}
    </Card>
  );
}

type receipt_row = { key: string; materialId: string; quantity: number; total: number };

function ReceiptForm({
  materials,
  on_close,
  on_submit,
}: {
  materials: material[];
  on_close: () => void;
  on_submit: (rows: { materialId: string; quantity: number; total: number; date: string; note?: string; update_price: boolean }[]) => void;
}) {
  const [date, set_date] = useState(today_iso());
  const [note, set_note] = useState('');
  const [update_price, set_update_price] = useState(true);
  const [rows, set_rows] = useState<receipt_row[]>([{ key: new_id('r'), materialId: materials[0]?.id ?? '', quantity: 0, total: 0 }]);

  const total_sum = rows.reduce((s, r) => s + (r.total || 0), 0);
  const valid = rows.some((r) => r.materialId && r.quantity > 0);

  function patch(key: string, p: Partial<receipt_row>) {
    set_rows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  return (
    <Card
      title="новое поступление"
      hint="накладная: несколько позиций одной датой"
      className="border-accent/30 ring-1 ring-accent/20"
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-neutral-500">
          дата
          <input type="date" max={today_iso()} className={`${field_class} mt-1`} value={date} onChange={(e) => set_date(e.target.value)} />
        </label>
        <label className="text-xs text-neutral-500 sm:col-span-2">
          поставщик / комментарий
          <input className={`${field_class} mt-1`} value={note} placeholder="например, метро, накладная №12" onChange={(e) => set_note(e.target.value)} />
        </label>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th className={th_class}>материал</th>
            <th className={th_num_class}>кол-во</th>
            <th className={th_num_class}>сумма, ₽</th>
            <th className={th_num_class}>цена за ед.</th>
            <th className={th_class}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mat = materials.find((m) => m.id === r.materialId);
            return (
              <tr key={r.key} className="border-t border-neutral-100">
                <td className={`${td_class} min-w-[220px]`}>
                  <select className={`${cell_input_class} text-left`} value={r.materialId} onChange={(e) => patch(r.key, { materialId: e.target.value })}>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || 'без названия'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`${td_num_class} w-36`}>
                  <div className="flex items-center gap-1">
                    <NumInput value={r.quantity} min={0} on_change={(v) => patch(r.key, { quantity: v })} />
                    <span className="w-8 text-left text-xs text-neutral-400">{mat ? unit_labels[mat.unit] : ''}</span>
                  </div>
                </td>
                <td className={`${td_num_class} w-32`}>
                  <NumInput value={r.total} min={0} on_change={(v) => patch(r.key, { total: v })} />
                </td>
                <td className={`${td_num_class} text-neutral-500`}>
                  {r.quantity > 0 && r.total > 0 ? format_rub(r.total / r.quantity, 2) : mat ? <span className="text-neutral-300">сейчас {format_rub(mat.costPerUnit, 2)}</span> : '—'}
                </td>
                <td className={`${td_class} text-right`}>
                  <button type="button" className={btn_ghost_danger} onClick={() => set_rows((prev) => prev.filter((x) => x.key !== r.key))} disabled={rows.length === 1}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btn_secondary}
            onClick={() => set_rows((prev) => [...prev, { key: new_id('r'), materialId: materials[0]?.id ?? '', quantity: 0, total: 0 }])}
          >
            + строка
          </button>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={update_price} onChange={(e) => set_update_price(e.target.checked)} />
            обновить среднюю цену закупки
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            итого <span className="font-semibold text-neutral-900">{format_rub(total_sum)}</span>
          </span>
          <button type="button" className={btn_secondary} onClick={on_close}>
            отмена
          </button>
          <button
            type="button"
            className={btn_accent}
            disabled={!valid}
            onClick={() =>
              on_submit(
                rows
                  .filter((r) => r.materialId && r.quantity > 0)
                  .map((r) => ({ materialId: r.materialId, quantity: r.quantity, total: r.total, date: to_iso(date), note: note || undefined, update_price }))
              )
            }
          >
            оприходовать
          </button>
        </div>
      </div>
    </Card>
  );
}

function QtyDialog({
  title,
  material,
  current,
  submit_label,
  default_note,
  initial_qty = 0,
  on_close,
  on_submit,
}: {
  title: string;
  material: material;
  current: number;
  submit_label: string;
  default_note: string;
  initial_qty?: number;
  on_close: () => void;
  on_submit: (qty_base: number, note: string, date: string) => void;
}) {
  const [qty, set_qty] = useState(initial_qty);
  const [note, set_note] = useState(default_note);
  const [date, set_date] = useState(today_iso());
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={on_close}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          {material.name} · сейчас {format_base_qty(material, current)}
        </p>
        <div className="mt-4 grid gap-3">
          <label className="text-xs text-neutral-500">
            количество, {base_unit_label(material.unit)}
            <NumInput value={qty} min={0} className={`${field_class} mt-1 text-right`} on_change={set_qty} />
          </label>
          <label className="text-xs text-neutral-500">
            дата
            <input type="date" max={today_iso()} className={`${field_class} mt-1`} value={date} onChange={(e) => set_date(e.target.value)} />
          </label>
          <label className="text-xs text-neutral-500">
            комментарий
            <input className={`${field_class} mt-1`} value={note} onChange={(e) => set_note(e.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btn_secondary} onClick={on_close}>
            отмена
          </button>
          <button type="button" className={btn_primary} onClick={() => on_submit(qty, note, date)}>
            {submit_label}
          </button>
        </div>
      </div>
    </div>
  );
}
