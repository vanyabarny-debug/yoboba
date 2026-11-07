'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  apply_adjust,
  apply_inventory_count,
  apply_receipt,
  apply_remainder_invoice,
  apply_writeoff,
  base_per_unit,
  base_unit,
  base_unit_label,
  day_key,
  default_stock_categories,
  fifo_batches_map,
  format_base_qty,
  format_rub,
  is_remainder_invoice,
  legacy_unit_cost,
  movement_money,
  movements_in_range,
  new_id,
  material_is_free,
  merge_stock_categories,
  needs_stock_count,
  next_finder_color,
  receipt_purchase_qty,
  remove_stock_movement,
  stock_category_for,
  stock_guard_of,
  stock_books_day,
  stock_levels,
  to_grams,
  warehouse_money,
  unit_labels,
  unpriced_batch_qty,
  material_cost,
  bind_spot,
  commit_spot,
  LEGACY_SPOT_ID,
  type finance_state,
  type material,
  type material_unit,
  type receipt_gap,
  type stock_actor,
  type stock_audit_action,
  type stock_audit_entry,
  type stock_category,
  type stock_batch,
  type stock_movement,
} from '@/lib/finance/model';
import InventoryCount from '@/components/admin/finance/inventory-count';
import PrepRecipeCard from '@/components/admin/finance/prep-recipes-section';
import { weigh_kind_of, weigh_unit } from '@/lib/finance/weigh';
import { material_is_prep_dry, normalize_prep_stations } from '@/lib/finance/prep-stations';
import { materials_in_drinks, swap_material_for_prep } from '@/lib/finance/prep-batches';
import {
  Card,
  EmptyState,
  MenuSelect,
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
import { save_label, type section_props } from '@/components/admin/finance/use-finance';
import { useAdminSpot } from '@/components/admin/admin-spot-context';

const movement_labels: Record<stock_movement['type'], string> = {
  in: 'поставка',
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
  receipt: 'поставка',
  delete_movement: 'удаление движения',
  prep: 'варка / заваривание',
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

function days_ago_iso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** offset 0 = текущий месяц, -1 = прошлый */
function month_range(offset: 0 | -1): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end = offset === 0 ? now : new Date(y, m + 1, 0);
  return {
    from: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
    to: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
  };
}

type mv_sort_id = 'date_desc' | 'date_asc' | 'cost_desc' | 'cost_asc';
type stock_sort_id = 'cat' | 'cost_desc' | 'cost_asc' | 'activity_desc' | 'activity_asc';

const MV_SORT_OPTIONS: { id: mv_sort_id; label: string }[] = [
  { id: 'date_desc', label: 'сначала новые' },
  { id: 'date_asc', label: 'сначала старые' },
  { id: 'cost_desc', label: 'дороже' },
  { id: 'cost_asc', label: 'дешевле' },
];

const STOCK_SORT_OPTIONS: { id: stock_sort_id; label: string }[] = [
  { id: 'cat', label: 'по категориям' },
  { id: 'cost_desc', label: 'дороже' },
  { id: 'cost_asc', label: 'дешевле' },
  { id: 'activity_desc', label: 'недавние' },
  { id: 'activity_asc', label: 'давние' },
];

function to_iso(date_str: string) {
  const d = new Date(`${date_str}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** поставка должна лечь после сегодняшней инвентаризации и варки, а не в полдень задним числом */
function receipt_stamp(date_str: string) {
  const today = today_iso();
  if (!date_str || date_str === today) return new Date().toISOString();
  const end = new Date(`${date_str}T23:59:59`);
  return Number.isNaN(end.getTime()) ? new Date().toISOString() : end.toISOString();
}

function cat_of(cats: stock_category[], id: string) {
  return cats.find((c) => c.id === id) ?? cats[0];
}

/** пустое имя и служебный id в названии — это ещё не названная позиция */
function material_label(m: { id: string; name?: string } | undefined | null) {
  if (!m) return '';
  const n = (m.name || '').trim();
  if (!n || n === m.id) return '';
  return n;
}

function cat_index(cats: stock_category[], id?: string) {
  if (!id) return 999;
  const i = cats.findIndex((c) => c.id === id);
  return i < 0 ? 999 : i;
}

function Kpi({
  label,
  value,
  sub,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  bar: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-soft">
      <div className="h-1" style={{ background: bar }} />
      <div className="px-4 py-3.5">
        <p className="text-[12px] font-semibold text-neutral-700">{label}</p>
        <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900 sm:text-2xl">{value}</p>
        {sub ? <p className="mt-1 text-[11px] font-medium tabular-nums text-neutral-500">{sub}</p> : null}
      </div>
    </div>
  );
}

function CategoryFlyout({
  cats,
  value,
  on_change,
  adding,
  new_name,
  on_adding,
  on_new_name,
  on_commit_add,
  on_edit,
}: {
  cats: stock_category[];
  value: string;
  on_change: (id: string) => void;
  adding: boolean;
  new_name: string;
  on_adding: (v: boolean) => void;
  on_new_name: (v: string) => void;
  on_commit_add: () => void;
  on_edit: (id: string, x: number, y: number) => void;
}) {
  const [open, set_open] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = value === 'все' ? null : (cats.find((c) => c.id === value) ?? null);

  useEffect(() => {
    if (!open) return;
    function on_down(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (root.current?.contains(el)) return;
      if (el?.closest('[data-cat-menu]')) return;
      set_open(false);
    }
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') set_open(false);
    }
    document.addEventListener('mousedown', on_down);
    document.addEventListener('keydown', on_key);
    return () => {
      document.removeEventListener('mousedown', on_down);
      document.removeEventListener('keydown', on_key);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={root} data-cat-fly>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => set_open((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-sm text-neutral-800 hover:border-neutral-300"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current?.color ?? '#8E8E93' }} />
        <span className="max-w-[9rem] truncate">{current?.name ?? 'все категории'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={`text-neutral-400 ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-2xl border border-neutral-200/80 bg-white p-1 shadow-soft">
          <button
            type="button"
            onClick={() => {
              on_change('все');
              set_open(false);
            }}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
              value === 'все' ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-neutral-300" />
            все
          </button>
          {cats.map((c) => {
            const active = value === c.id;
            return (
              <div key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    on_change(c.id);
                    set_open(false);
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                    active ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:bg-neutral-50'
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="truncate">{c.name}</span>
                </button>
                <button
                  type="button"
                  data-cat-menu
                  aria-label={`править «${c.name}»`}
                  onClick={(e) => {
                    e.stopPropagation();
                    on_edit(c.id, e.clientX, e.clientY);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
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
              </div>
            );
          })}
          {adding ? (
            <input
              autoFocus
              value={new_name}
              onChange={(e) => on_new_name(e.target.value)}
              onBlur={on_commit_add}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  on_commit_add();
                }
                if (e.key === 'Escape') {
                  on_adding(false);
                  on_new_name('');
                }
              }}
              placeholder="название"
              className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-accent/50"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                on_adding(true);
                on_new_name('');
              }}
              className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-50"
            >
              + категория
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CategoryChips({
  cats,
  value,
  on_change,
  adding,
  new_name,
  on_adding,
  on_new_name,
  on_commit_add,
  on_edit,
}: {
  cats: stock_category[];
  value: string;
  on_change: (id: string) => void;
  adding: boolean;
  new_name: string;
  on_adding: (v: boolean) => void;
  on_new_name: (v: string) => void;
  on_commit_add: () => void;
  on_edit: (id: string, x: number, y: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => on_change('все')}
        className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
          value === 'все' ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
        }`}
      >
        все
      </button>
      {cats.map((c) => {
        const active = value === c.id;
        return (
          <span key={c.id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => on_change(c.id)}
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
                on_edit(c.id, e.clientX, e.clientY);
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
      {adding ? (
        <input
          autoFocus
          value={new_name}
          onChange={(e) => on_new_name(e.target.value)}
          onBlur={on_commit_add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              on_commit_add();
            }
            if (e.key === 'Escape') {
              on_adding(false);
              on_new_name('');
            }
          }}
          placeholder="название"
          className="h-[34px] w-36 shrink-0 rounded-full border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-accent/50"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            on_adding(true);
            on_new_name('');
          }}
          className="shrink-0 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-400"
        >
          + категория
        </button>
      )}
    </div>
  );
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

function lot_caption(note?: string) {
  if (!note) return '';
  const n = note.trim();
  if (/^(миграция|служебный|сверка|факт|срез|старт)/i.test(n)) return '';
  return n.length > 42 ? `${n.slice(0, 42)}…` : n;
}

/** оставшиеся поставки одного ингредиента: количество общее, рубли у каждой свои */
function LotLines({ material, lots }: { material: material; lots: stock_batch[] }) {
  return (
    <ul className="mt-1.5 space-y-0.5 pl-1">
      {lots.map((b, i) => {
        const when = b.date
          ? new Date(b.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
          : '';
        const caption = lot_caption(b.note);
        return (
          <li key={b.movementId || `${b.date}-${i}`} className="flex items-baseline justify-between gap-3 text-[11px] text-neutral-400">
            <span className="min-w-0 truncate">
              {i === 0 ? 'сначала спишется' : 'потом'}
              {when ? ` · ${when}` : ''}
              {caption ? ` · ${caption}` : ''}
            </span>
            <span className="shrink-0 tabular-nums">
              {format_base_qty(material, b.qty)} ·{' '}
              {b.unpriced || b.unit_cost <= 1e-9 ? (
                <span className="text-amber-600">нет суммы</span>
              ) : (
                format_rub(b.qty * b.unit_cost)
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function price_per_pack(unit_cost: number, unit: material_unit) {
  const per = unit_cost * base_per_unit(unit);
  if (!(per > 0)) return '';
  return `${format_rub(per, per < 10 ? 2 : 0)}/${unit_labels[unit]}`;
}

type remainder_draft = {
  packs: number | null;
  packSize: number | null;
  packUnit: material_unit;
  packPrice: number | null;
  packs_edited: boolean;
  price_edited: boolean;
};

function pack_base_qty(packSize: number, packUnit: material_unit, stored: material_unit) {
  const purchase = receipt_purchase_qty(1, packSize, packUnit, stored);
  if (!(purchase > 0)) return 0;
  return purchase * base_per_unit(stored);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function RemainderInvoiceModal({
  rows,
  on_close,
  on_submit,
}: {
  rows: {
    material: material;
    unpriced: number;
    priced: number;
    hint: string;
    old_unit: number;
    color: string;
  }[];
  on_close: () => void;
  on_submit: (lines: { materialId: string; total: number; cover: number; pack: string }[]) => void;
}) {
  const [drafts, set_drafts] = useState<Record<string, remainder_draft>>(() => {
    const next: Record<string, remainder_draft> = {};
    for (const row of rows) {
      const one = pack_base_qty(1, row.material.unit, row.material.unit);
      next[row.material.id] = {
        packs: one > 0 ? round3(row.unpriced / one) : null,
        packSize: 1,
        packUnit: row.material.unit,
        packPrice: row.old_unit > 0 && one > 0 ? rub2(row.old_unit * one) : null,
        packs_edited: false,
        price_edited: false,
      };
    }
    return next;
  });
  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') on_close();
    };
    window.addEventListener('keydown', on_key);
    return () => window.removeEventListener('keydown', on_key);
  }, [on_close]);
  function patch(id: string, next: (row: remainder_draft) => remainder_draft) {
    set_drafts((prev) => ({ ...prev, [id]: next(prev[id]) }));
  }
  const ready_lines = rows.flatMap((row) => {
    const d = drafts[row.material.id];
    if (!d || d.packs == null || d.packSize == null || d.packPrice == null) return [];
    if (!(d.packs > 0) || !(d.packSize > 0) || !(d.packPrice > 0)) return [];
    const purchase = receipt_purchase_qty(d.packs, d.packSize, d.packUnit, row.material.unit);
    if (!(purchase > 0)) return [];
    return [
      {
        materialId: row.material.id,
        total: rub2(d.packs * d.packPrice),
        cover: purchase * base_per_unit(row.material.unit),
        pack: `${format_qty_short(d.packs)} уп. × ${format_qty_short(d.packSize)} ${unit_labels[d.packUnit]}`,
      },
    ];
  });
  return createPortal(
    <div
      className="fixed inset-0 z-[86] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8"
      onMouseDown={on_close}
    >
      <div
        className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-soft"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading-soft text-lg text-neutral-900">поставки на остаток</h2>
            <p className="mt-1 text-xs text-neutral-500">
              как в поставке: сколько упаковок и почём одна. сумма посчитается сама, граммы на складе не прибавятся.
            </p>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100" onClick={on_close}>
            закрыть
          </button>
        </div>
        <ul className="mt-4 max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto pr-1">
          {rows.map((row) => {
            const d = drafts[row.material.id];
            const purchase =
              d && d.packs && d.packSize
                ? receipt_purchase_qty(d.packs, d.packSize, d.packUnit, row.material.unit)
                : 0;
            const mismatch = Boolean(d && d.packs && d.packSize && purchase <= 0);
            const entered = purchase > 0 ? purchase * base_per_unit(row.material.unit) : 0;
            const sum = d && d.packs && d.packPrice ? rub2(d.packs * d.packPrice) : 0;
            return (
              <li key={row.material.id} className="rounded-2xl border border-neutral-200 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
                    <span className="truncate text-sm text-neutral-900">
                      {material_label(row.material) || 'без названия'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-800">
                    {format_base_qty(row.material, row.unpriced)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">{row.hint}</p>
                {row.priced > 0.5 ? (
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    уже лежит поставка на {format_base_qty(row.material, row.priced)}
                  </p>
                ) : null}
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-neutral-500">
                    упаковок
                    <NumInput
                      value={d?.packs}
                      min={0}
                      className={`${field_class} mt-1 text-right`}
                      on_change={(packs) =>
                        patch(row.material.id, (prev) => ({ ...prev, packs: packs > 0 ? packs : null, packs_edited: true }))
                      }
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    {d?.packUnit === 'pcs' ? 'в упаковке' : 'вес 1 упаковки'}
                    <span className="mt-1 flex min-w-0 flex-wrap gap-1">
                      <NumInput
                        value={d?.packSize}
                        min={0}
                        className={`${field_class} min-w-0 flex-1 text-right`}
                        on_change={(packSize) =>
                          patch(row.material.id, (prev) => {
                            const size = packSize > 0 ? packSize : null;
                            const one =
                              size != null ? pack_base_qty(size, prev.packUnit, row.material.unit) : 0;
                            return {
                              ...prev,
                              packSize: size,
                              packs:
                                !prev.packs_edited && one > 0 ? round3(row.unpriced / one) : prev.packs,
                              packPrice:
                                !prev.price_edited && row.old_unit > 0 && one > 0
                                  ? rub2(row.old_unit * one)
                                  : prev.packPrice,
                            };
                          })
                        }
                      />
                      <span className="flex shrink-0 rounded-2xl border border-neutral-200 bg-white p-0.5">
                        {PACK_UNITS.map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() =>
                              patch(row.material.id, (prev) => {
                                const size = prev.packSize ?? 1;
                                const one = pack_base_qty(size, u, row.material.unit);
                                return {
                                  ...prev,
                                  packUnit: u,
                                  packs:
                                    !prev.packs_edited && one > 0 ? round3(row.unpriced / one) : prev.packs,
                                  packPrice:
                                    !prev.price_edited && row.old_unit > 0 && one > 0
                                      ? rub2(row.old_unit * one)
                                      : prev.packPrice,
                                };
                              })
                            }
                            className={`rounded-xl px-2 py-1.5 text-xs ${
                              d?.packUnit === u ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-50'
                            }`}
                          >
                            {unit_labels[u]}
                          </button>
                        ))}
                      </span>
                    </span>
                  </label>
                  <label className="text-xs text-neutral-500">
                    цена упаковки, ₽
                    <NumInput
                      value={d?.packPrice}
                      min={0}
                      className={`${field_class} mt-1 text-right`}
                      on_change={(packPrice) =>
                        patch(row.material.id, (prev) => ({
                          ...prev,
                          packPrice: packPrice > 0 ? packPrice : null,
                          price_edited: true,
                        }))
                      }
                    />
                  </label>
                </div>
                {mismatch ? (
                  <p className="mt-2 text-[11px] text-red-500">
                    {base_unit(row.material.unit) === 'pcs'
                      ? 'этот продукт считается штуками'
                      : 'для веса укажите г, кг, мл или л — не штуки'}
                  </p>
                ) : sum > 0 && entered > 0 ? (
                  <p className="mt-2 text-[11px] text-neutral-500">
                    сумма <span className="font-medium text-neutral-900">{format_rub(sum)}</span>
                    {' · '}
                    {entered + 0.5 < row.unpriced
                      ? `закроет ${format_base_qty(row.material, entered)} из ${format_base_qty(row.material, row.unpriced)}`
                      : `это ${format_base_qty(row.material, Math.min(entered, row.unpriced))}`}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className={btn_accent}
            disabled={ready_lines.length === 0}
            onClick={() => {
              if (!ready_lines.length) return;
              on_submit(ready_lines);
            }}
          >
            оприходовать
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function InventorySection({ state: full, set_state: set_full, save_status = 'idle' }: section_props) {
  const admin = useAdminSpot();
  const spot_id = admin.spot_id || admin.spot_options[0]?.id || LEGACY_SPOT_ID;
  const spot_label = admin.spot_options.find((s) => s.id === spot_id)?.label || 'эта точка';
  const state = useMemo(() => bind_spot(full, spot_id), [full, spot_id]);
  const set_state = useCallback(
    (fn: (prev: finance_state) => finance_state) => {
      set_full((prev) => commit_spot(prev, spot_id, fn(bind_spot(prev, spot_id))));
    },
    [set_full, spot_id]
  );
  const today = today_iso();
  const [from, set_from] = useState(month_start_iso());
  const [to, set_to] = useState(today);
  const [mv_category, set_mv_category] = useState('все');
  const [stock_category, set_stock_category] = useState('все');
  const [mv_query, set_mv_query] = useState('');
  const [stock_query, set_stock_query] = useState('');
  const [receipt_open, set_receipt_open] = useState(false);
  const [invoice_open, set_invoice_open] = useState(false);
  const [receipt_for, set_receipt_for] = useState<string | null>(null);
  const [writeoff_open, set_writeoff_open] = useState(false);
  const [count_open, set_count_open] = useState(false);
  const [history_open, set_history_open] = useState(false);
  const [journal_more, set_journal_more] = useState(false);
  const [expanded_orders, set_expanded_orders] = useState<Set<string>>(() => new Set());
  const [writeoff_for, set_writeoff_for] = useState<string | null>(null);
  const [adjust_for, set_adjust_for] = useState<string | null>(null);
  const [cat_menu, set_cat_menu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, set_renaming] = useState(false);
  const [rename_draft, set_rename_draft] = useState('');
  const [adding_cat_for, set_adding_cat_for] = useState<'mv' | 'stock' | null>(null);
  const [new_cat_name, set_new_cat_name] = useState('');
  const [cat_pick, set_cat_pick] = useState<{ x: number; y: number; materialId: string | 'new' } | null>(null);
  const focus_mat = useRef<string | null>(null);
  const [open_prep, set_open_prep] = useState<string | null>(null);
  const [dates_open, set_dates_open] = useState(false);
  const [mv_sort, set_mv_sort] = useState<mv_sort_id>('date_desc');
  const [stock_sort, set_stock_sort] = useState<stock_sort_id>('cat');

  const restored_defaults = useRef(false);
  const must_count = needs_stock_count(state);

  const [was_must_count, set_was_must_count] = useState(false);
  if (must_count !== was_must_count) {
    set_was_must_count(must_count);
    if (must_count) set_count_open(true);
  }

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

  const cats = state.stockCategories?.length ? state.stockCategories : [];
  const stock = useMemo(() => stock_levels(state, range_to), [state, range_to]);
  const lots_by_id = useMemo(() => fifo_batches_map(state, range_to), [state, range_to]);
  const prep_stations = useMemo(() => normalize_prep_stations(state.prepStations), [state.prepStations]);
  const drink_use = useMemo(() => materials_in_drinks(state), [state]);
  const swap_options = useCallback(
    (recipe_id: string, own: string[]) => {
      const rows = state.materials
        .filter((m) => m.id !== recipe_id && !m.id.startsWith('batch_') && (drink_use.get(m.id) ?? 0) > 0)
        .map((m) => ({ id: m.id, name: m.name, drinks: drink_use.get(m.id) ?? 0 }));
      // сырьё из состава заготовки — первым: обычно его и надо заменить
      return rows.sort(
        (a, b) => Number(own.includes(b.id)) - Number(own.includes(a.id)) || a.name.localeCompare(b.name, 'ru')
      );
    },
    [state.materials, drink_use]
  );
  const dry_debts = useMemo(
    () => stock.filter((s) => s.qty < -0.5 && material_is_prep_dry(s.material, prep_stations)),
    [stock, prep_stations]
  );
  const cooked_debts = useMemo(
    () =>
      stock.filter(
        (s) => s.qty < -0.5 && prep_stations.some((station) => station.cookedMaterialId === s.material.id)
      ),
    [stock, prep_stations]
  );
  const need_invoice = useMemo(() => {
    return stock
      .filter((s) => !material_is_free(s.material) && s.qty > 0.5)
      .map((s) => {
        const lots = lots_by_id.get(s.material.id) ?? [];
        const unpriced = unpriced_batch_qty(lots);
        if (!(unpriced > 0.5)) return null;
        const priced = lots.reduce(
          (sum, b) => sum + (b.qty > 0.5 && !b.unpriced && b.unit_cost > 1e-9 ? b.qty : 0),
          0
        );
        const old = legacy_unit_cost(state, s.material.id, range_to);
        const per = price_per_pack(old.unit, s.material.unit);
        const hint =
          old.source === 'receipt'
            ? `остаток инвентаризации · прошлая поставка ${per}`
            : old.source === 'used'
              ? `остаток инвентаризации · уже списывали по ${per}`
              : old.source === 'card'
                ? `остаток инвентаризации · цена в карточке ${per}`
                : 'остаток инвентаризации · цены ещё не было';
        const tag = cat_of(cats, s.material.category);
        return {
          material: s.material,
          unpriced,
          priced,
          hint,
          old_unit: old.unit,
          color: tag?.color ?? '#8E8E93',
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.unpriced - a.unpriced);
  }, [stock, lots_by_id, state, range_to, cats]);
  function open_receipt(materialId?: string) {
    if (must_count) return;
    set_writeoff_open(false);
    set_receipt_for(materialId || null);
    set_receipt_open(true);
  }
  function open_writeoff() {
    if (must_count) return;
    set_receipt_open(false);
    set_receipt_for(null);
    set_writeoff_open(true);
  }
  const period_mv = useMemo(() => movements_in_range(state, range_from, range_to), [state, range_from, range_to]);
  const stock_value = stock.reduce((s, r) => s + r.value, 0);
  const money = useMemo(() => warehouse_money(state, range_to), [state, range_to]);
  const books_day = stock_books_day(state) || '2024-01-01';
  const [earned_revenue, set_earned_revenue] = useState<number | null>(null);

  const earned_key = `${books_day}|${range_to}`;
  const [earned_for, set_earned_for] = useState(earned_key);
  if (earned_for !== earned_key) {
    set_earned_for(earned_key);
    set_earned_revenue(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/finance/sales?from=${books_day}&to=${range_to}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { revenue?: number; error?: string }) => {
        if (cancelled || body.error) return;
        set_earned_revenue(Number(body.revenue) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range_to, books_day]);

  useEffect(() => {
    if (!writeoff_open) return;
    document.getElementById('writeoff-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [writeoff_open]);

  const earned = earned_revenue == null ? null : earned_revenue - money.realized;
  const writeoff_mvs = period_mv.filter(
    (m) => m.type === 'writeoff' && (!state.stockBooksFrom || m.date > state.stockBooksFrom)
  );
  const writeoffs_count = writeoff_mvs.length;
  const writeoffs_sum = writeoff_mvs.reduce((s, m) => {
    const mat = state.materials.find((x) => x.id === m.materialId);
    return s + movement_money(mat, m);
  }, 0);

  const journal_rows = useMemo(() => build_journal_rows(period_mv, state.materials), [period_mv, state.materials]);

  const mat_by_id = useMemo(() => new Map(state.materials.map((m) => [m.id, m])), [state.materials]);

  const last_activity = useMemo(() => {
    const map = new Map<string, string>();
    for (const mv of state.stockMovements) {
      if (day_key(mv.date) > range_to) continue;
      const prev = map.get(mv.materialId);
      if (!prev || mv.date > prev) map.set(mv.materialId, mv.date);
    }
    return map;
  }, [state.stockMovements, range_to]);

  const this_month = month_range(0);
  const last_month = month_range(-1);
  const period_preset =
    range_from === today && range_to === today
      ? 'today'
      : range_from === days_ago_iso(6) && range_to === today
        ? 'week'
        : range_from === this_month.from && range_to === this_month.to
          ? 'this_month'
          : range_from === last_month.from && range_to === last_month.to
            ? 'last_month'
            : 'custom';
  const period_options = [
    { id: 'today', label: 'сегодня', apply: () => { set_from(today); set_to(today); } },
    { id: 'week', label: '7 дней', apply: () => { set_from(days_ago_iso(6)); set_to(today); } },
    { id: 'this_month', label: 'этот месяц', apply: () => { set_from(this_month.from); set_to(this_month.to); } },
    { id: 'last_month', label: 'прошлый месяц', apply: () => { set_from(last_month.from); set_to(last_month.to); } },
  ] as const;
  const period_label =
    period_options.find((p) => p.id === period_preset)?.label ??
    (range_from === range_to
      ? range_from
      : `${range_from.slice(8)}.${range_from.slice(5, 7)} — ${range_to.slice(8)}.${range_to.slice(5, 7)}`);

  const analytics = useMemo(() => {
      const low = stock
        .filter((s) => !material_is_free(s.material) && (s.low || s.qty < 0))
        .sort((a, b) => a.qty - b.qty)
        .slice(0, 8);
    const spent_by = new Map<string, number>();
    const bought_by = new Map<string, number>();
    const cat_spent = new Map<string, number>();
    for (const mv of period_mv) {
      const mat = mat_by_id.get(mv.materialId);
      if (!mat || material_is_free(mat)) continue;
      const rub = movement_money(mat, mv);
      const note = (mv.note || '').trim();
      const is_prep = /^(варка|заваривание)\b/i.test(note);
      const is_book = /^миграция:/i.test(note) || /^служебный:/i.test(note) || /^сверка:/i.test(note);
      if (mv.type === 'in') {
        // варка/заваривание — не закупка, а перекладка сухого → готового
        if (is_prep || is_book) continue;
        bought_by.set(mv.materialId, (bought_by.get(mv.materialId) ?? 0) + rub);
      } else if (mv.type === 'sale' || mv.type === 'staff' || mv.type === 'writeoff') {
        spent_by.set(mv.materialId, (spent_by.get(mv.materialId) ?? 0) + rub);
        const cat = mat.category || 'mixes';
        cat_spent.set(cat, (cat_spent.get(cat) ?? 0) + rub);
      }
    }
    const rank = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, rub]) => ({
          id,
          name: mat_by_id.get(id)?.name || id,
          rub,
          cat: cat_of(cats, mat_by_id.get(id)?.category || ''),
        }));
    const by_cat = [...cat_spent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, rub]) => ({ id, name: cat_of(cats, id)?.name || id, color: cat_of(cats, id)?.color || '#8E8E93', rub }));
    const cat_total = by_cat.reduce((s, r) => s + r.rub, 0) || 1;
    return {
      low,
      top_spent: rank(spent_by),
      top_bought: rank(bought_by),
      by_cat,
      cat_total,
      orders: journal_rows.filter((r) => r.kind === 'order').length,
      receipts: period_mv.filter((m) => {
        if (m.type !== 'in') return false;
        const note = (m.note || '').trim();
        return !/^(варка|заваривание)\b/i.test(note) && !/^миграция:/i.test(note) && !/^служебный:/i.test(note) && !/^сверка:/i.test(note);
      }).length,
    };
  }, [stock, period_mv, mat_by_id, cats, journal_rows]);

  const filtered_journal = useMemo(() => {
    const sort_lines = (lines: stock_movement[]) =>
      [...lines].sort((a, b) => {
        const ma = mat_by_id.get(a.materialId);
        const mb = mat_by_id.get(b.materialId);
        const ca = cat_index(cats, ma?.category);
        const cb = cat_index(cats, mb?.category);
        if (ca !== cb) return ca - cb;
        return (ma?.name || '').localeCompare(mb?.name || '', 'ru');
      });

    const row_cost = (row: journal_row) => {
      if (row.kind === 'order') return row.total;
      return movement_money(mat_by_id.get(row.mv.materialId), row.mv);
    };

    const q = mv_query.trim().toLowerCase();
    const match_q = (materialId: string, orderId?: string, note?: string) => {
      if (!q) return true;
      const mat = mat_by_id.get(materialId);
      if (mat?.name.toLowerCase().includes(q)) return true;
      if (materialId.toLowerCase().includes(q)) return true;
      if (orderId?.toLowerCase().includes(q)) return true;
      if (note?.toLowerCase().includes(q)) return true;
      return false;
    };

    return journal_rows
      .map((row) => {
        if (row.kind === 'single') {
          if (mv_category !== 'все') {
            const mat = mat_by_id.get(row.mv.materialId);
            if (mat?.category !== mv_category) return null;
          }
          if (!match_q(row.mv.materialId, undefined, row.mv.note)) return null;
          return row;
        }
        let lines =
          mv_category === 'все'
            ? sort_lines(row.lines)
            : sort_lines(row.lines.filter((l) => mat_by_id.get(l.materialId)?.category === mv_category));
        if (q) {
          const order_hit = row.orderId.toLowerCase().includes(q);
          if (!order_hit) {
            lines = lines.filter((l) => match_q(l.materialId, row.orderId, l.note));
          }
        }
        if (!lines.length) return null;
        const total = lines.reduce((s, mv) => s + movement_money(mat_by_id.get(mv.materialId), mv), 0);
        return { ...row, lines, total };
      })
      .filter((r): r is journal_row => r != null)
      .sort((a, b) => {
        if (mv_sort === 'date_asc') return a.date.localeCompare(b.date) || row_cost(a) - row_cost(b);
        if (mv_sort === 'date_desc') return b.date.localeCompare(a.date) || row_cost(b) - row_cost(a);
        if (mv_sort === 'cost_asc') return row_cost(a) - row_cost(b) || b.date.localeCompare(a.date);
        if (mv_sort === 'cost_desc') return row_cost(b) - row_cost(a) || b.date.localeCompare(a.date);
        return b.date.localeCompare(a.date);
      });
  }, [journal_rows, mv_category, mv_sort, mv_query, cats, mat_by_id]);

  function toggle_order(orderId: string) {
    set_expanded_orders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  const visible = useMemo(() => {
    return stock
      .filter((s) => {
        if (stock_category !== 'все' && s.material.category !== stock_category) return false;
        if (stock_query && !s.material.name.toLowerCase().includes(stock_query.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (stock_sort === 'cost_asc') return a.value - b.value || a.material.name.localeCompare(b.material.name, 'ru');
        if (stock_sort === 'cost_desc') return b.value - a.value || a.material.name.localeCompare(b.material.name, 'ru');
        if (stock_sort === 'activity_desc' || stock_sort === 'activity_asc') {
          const ta = last_activity.get(a.material.id) || '';
          const tb = last_activity.get(b.material.id) || '';
          if (ta !== tb) {
            if (!ta) return 1;
            if (!tb) return -1;
            return stock_sort === 'activity_desc' ? tb.localeCompare(ta) : ta.localeCompare(tb);
          }
          return a.material.name.localeCompare(b.material.name, 'ru');
        }
        const ca = cat_index(cats, a.material.category);
        const cb = cat_index(cats, b.material.category);
        if (ca !== cb) return ca - cb;
        return a.material.name.localeCompare(b.material.name, 'ru');
      });
  }, [stock, stock_category, stock_query, stock_sort, cats, last_activity]);

  const ingredient_rows = useMemo(() => {
    const show = stock_category === 'все' || stock_category === 'prep';
    const q = stock_query.trim().toLowerCase();
    const preps = show
      ? (state.prepRecipes ?? []).filter((recipe) => !q || recipe.name.toLowerCase().includes(q))
      : [];
    const mats = visible.map((stock_row) => ({ kind: 'mat' as const, stock: stock_row }));
    const prep_nodes = preps.map((recipe) => ({ kind: 'prep' as const, recipe }));
    if (stock_sort !== 'cat') return [...mats, ...prep_nodes];
    const slot = cat_index(cats, 'prep');
    const before = mats.filter((row) => cat_index(cats, row.stock.material.category) <= slot);
    const after = mats.filter((row) => cat_index(cats, row.stock.material.category) > slot);
    return [...before, ...prep_nodes, ...after];
  }, [visible, state.prepRecipes, stock_category, stock_query, stock_sort, cats]);

  useEffect(() => {
    if (!focus_mat.current) return;
    const el = document.querySelector(`[data-mat-name="${focus_mat.current}"]`) as HTMLInputElement | null;
    el?.focus();
    focus_mat.current = null;
  });

  function update_material(id: string, patch: Partial<material>) {
    set_state((prev) => ({ ...prev, materials: prev.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }

  function add_material(cat_id: string) {
    const id = new_id('mat');
    set_state((prev) => ({
      ...prev,
      materials: [...prev.materials, { id, name: '', category: cat_id, unit: 'kg', costPerUnit: 0 }],
    }));
    if (stock_category !== 'все' && stock_category !== cat_id) set_stock_category(cat_id);
    focus_mat.current = id;
    set_cat_pick(null);
  }

  function remove_prep(id: string) {
    if (!window.confirm('убрать заготовку из рецептов?')) return;
    set_state((prev) => ({
      ...prev,
      prepRecipes: (prev.prepRecipes ?? []).filter((recipe) => recipe.id !== id),
      techCards: prev.techCards.map((card) => ({
        ...card,
        steps: card.steps?.filter((step) => step.materialId !== id),
        sizes: Object.fromEntries(
          Object.entries(card.sizes).map(([key, size]) => {
            if (size.ingredients[id] == null) return [key, size];
            const ingredients = { ...size.ingredients };
            delete ingredients[id];
            return [key, { ...size, ingredients }];
          })
        ),
      })),
    }));
  }

  function add_prep() {
    const id = new_id('batch');
    set_state((prev) => ({
      ...prev,
      prepRecipes: [...(prev.prepRecipes ?? []), { id, name: '', yieldG: 0, ingredients: {} }],
    }));
    set_stock_category('prep');
    set_open_prep(id);
    set_cat_pick(null);
  }

  function pick_category(cat_id: string) {
    if (!cat_pick) return;
    if (cat_pick.materialId === 'new') {
      if (cat_id === 'prep') add_prep();
      else add_material(cat_id);
      return;
    }
    update_material(cat_pick.materialId, { category: cat_id });
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
      removedMaterialIds: [...new Set([...(prev.removedMaterialIds ?? []), id])],
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
    const target = adding_cat_for;
    if (!name) {
      set_adding_cat_for(null);
      set_new_cat_name('');
      return;
    }
    const id = new_id('scat');
    const color = next_finder_color(cats.map((c) => c.color));
    set_state((prev) => ({
      ...prev,
      stockCategories: [...prev.stockCategories, { id, name, color }],
    }));
    if (target === 'mv') set_mv_category(id);
    else set_stock_category(id);
    set_adding_cat_for(null);
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
    const fallback = cats.find((c) => c.id !== id)?.id ?? 'mixes';
    set_state((prev) => ({
      ...prev,
      stockCategories: prev.stockCategories.filter((c) => c.id !== id),
      materials: prev.materials.map((m) => (m.category === id ? { ...m, category: fallback } : m)),
    }));
    if (mv_category === id) set_mv_category('все');
    if (stock_category === id) set_stock_category('все');
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
          rows={stock_levels(state).filter((r) => !material_is_free(r.material))}
          cats={cats}
          required={must_count}
          on_commit={(facts, date, tares) => {
            set_state((prev) => {
              const with_tare = tares?.length
                ? {
                    ...prev,
                    materials: prev.materials.map((m) => {
                      const row = tares.find((t) => t.materialId === m.id);
                      return row && row.tare > 0 ? { ...m, tareWeight: row.tare } : m;
                    }),
                  }
                : prev;
              return apply_inventory_count(with_tare, facts, date, ADMIN_ACTOR);
            });
            set_count_open(false);
          }}
          on_close={() => {
            if (must_count) return;
            set_count_open(false);
          }}
        />
      )}
      {writeoff_open && (
        <div id="writeoff-form">
          <WriteoffForm
            materials={state.materials.filter((m) => !material_is_free(m) && m.name.trim())}
            qty_of={(id) => stock.find((s) => s.material.id === id)?.qty ?? 0}
            on_close={() => set_writeoff_open(false)}
            on_submit={(materialId, qty, note, date) => {
              set_state((prev) => apply_writeoff(prev, materialId, qty, note, to_iso(date), ADMIN_ACTOR));
              set_writeoff_open(false);
            }}
          />
        </div>
      )}
      {receipt_open &&
        createPortal(
        <div
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/30 p-3 sm:items-center sm:p-6"
          onMouseDown={() => {
            set_receipt_open(false);
            set_receipt_for(null);
          }}
        >
        <div
          className="max-h-[min(92vh,44rem)] w-full max-w-3xl overflow-y-auto overscroll-contain"
          onMouseDown={(e) => e.stopPropagation()}
        >
        <ReceiptForm
          key={receipt_for || 'new'}
          initial_material_id={receipt_for}
          materials={state.materials.filter((m) => !material_is_free(m))}
          categories={cats.length ? cats : default_stock_categories}
          on_close={() => {
            set_receipt_open(false);
            set_receipt_for(null);
          }}
          on_submit={(rows) => {
            set_state((prev) =>
              rows.reduce((s, r) => {
                let materialId = r.materialId;
                if (r.create) {
                  materialId = new_id('mat');
                  s = {
                    ...s,
                    materials: [
                      ...s.materials,
                      {
                        id: materialId,
                        name: r.create.name,
                        category: r.create.category,
                        unit: r.create.unit,
                        costPerUnit: 0,
                      },
                    ],
                  };
                }
                if (!materialId) return s;
                return apply_receipt(s, {
                  materialId,
                  quantity: r.quantity,
                  total: r.total,
                  date: r.date,
                  note: r.note,
                  update_price: r.total > 0,
                  actor: ADMIN_ACTOR,
                  pending: r.pending,
                });
              }, prev),
            );
            set_receipt_open(false);
          }}
        />
        </div>
        </div>,
        document.body,
        )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="на складе" value={format_rub(stock_value)} bar="#8B9DC3" />
        <Kpi label="потрачено" value={format_rub(money.spent)} bar="#FF6B6B" />
        <Kpi label="реализовано" value={format_rub(money.realized)} bar="#3B82F6" />
        <Kpi label="заработано" value={earned == null ? '…' : format_rub(earned)} bar="#20181B" />
        <Kpi
          label="списано"
          value={format_rub(writeoffs_sum)}
          sub={writeoffs_count > 0 ? `${writeoffs_count} за период` : undefined}
          bar="#E85D4C"
        />
        <Kpi label="потеряно" value={format_rub(money.lost)} bar="#D97706" />
      </div>
      {state.stockBooksFrom ? (
        <p className="text-xs text-neutral-500">
          учёт с{' '}
          {new Date(state.stockBooksFrom).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            timeZone: 'Europe/Moscow',
          })}
          . остаток задала инвентаризация. напитки до неё в склад не входят, расход ведётся с этого момента.
        </p>
      ) : null}

      {dry_debts.length || cooked_debts.length ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">
            {dry_debts.length ? 'минус по сухому — перекройте поставкой' : 'минус по готовому — его закрывает варка'}
          </p>
          {cooked_debts.length ? (
            <ul className="mt-2 space-y-1">
              {cooked_debts.map((s) => (
                <li key={s.material.id} className="text-sm text-red-800">
                  {s.material.name}{' '}
                  <span className="font-semibold tabular-nums">{format_base_qty(s.material, s.qty)}</span>
                  <span className="text-red-600"> — продали больше, чем сварили</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 space-y-2">
            {dry_debts.map((s) => (
              <li key={s.material.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-red-800">
                  {s.material.name}{' '}
                  <span className="font-semibold tabular-nums">{format_base_qty(s.material, s.qty)}</span>
                </span>
                <button
                  type="button"
                  className={btn_accent}
                  disabled={must_count}
                  onClick={() => open_receipt(s.material.id)}
                >
                  поставка
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {need_invoice.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-amber-800">
              остаток без рублей — внесите поставку
              <span className="ml-2 font-normal text-amber-700">{need_invoice.length}</span>
            </p>
            <button
              type="button"
              className={btn_accent}
              disabled={must_count}
              onClick={() => set_invoice_open(true)}
            >
              внести поставки
            </button>
          </div>
          <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
            {need_invoice.map((row) => (
              <li key={row.material.id} className="flex items-baseline justify-between gap-3 text-sm text-amber-900">
                <span className="min-w-0 truncate">{material_label(row.material) || 'без названия'}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {format_base_qty(row.material, row.unpriced)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {invoice_open && need_invoice.length ? (
        <RemainderInvoiceModal
          rows={need_invoice}
          on_close={() => set_invoice_open(false)}
          on_submit={(lines) => {
            const date = new Date().toISOString();
            set_state((prev) =>
              lines.reduce(
                (s, line) =>
                  apply_remainder_invoice(s, line.materialId, line.total, date, ADMIN_ACTOR, line.cover, line.pack),
                prev
              )
            );
            set_invoice_open(false);
          }}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card title="заканчивается" hint="минус и ниже минимума">
          {analytics.low.length ? (
            <ul className="space-y-2">
              {analytics.low.map((s) => (
                <li key={s.material.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-800">
                    {s.material.name}
                    {s.qty < 0 ? (
                      <span className="ml-1 text-[11px] font-semibold text-red-500">минус</span>
                    ) : null}
                  </span>
                  <span className={`shrink-0 tabular-nums ${s.qty < 0 ? 'font-semibold text-red-600' : 'text-red-500'}`}>
                    {format_base_qty(s.material, s.qty)}
                    {s.material.minStock != null && s.qty >= 0 ? (
                      <span className="ml-1 text-[11px] text-neutral-400">
                        / {format_base_qty(s.material, s.material.minStock)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>всё в норме</EmptyState>
          )}
        </Card>

        <Card title="топ расхода" hint="заказы · персонал · списания">
          {analytics.top_spent.length ? (
            <ul className="space-y-2">
              {analytics.top_spent.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: r.cat?.color ?? '#8E8E93' }}
                    />
                    <span className="truncate text-neutral-800">{r.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-700">{format_rub(r.rub)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>за период пусто</EmptyState>
          )}
        </Card>

        <Card title="топ закупок" hint="поставки на склад">
          {analytics.top_bought.length ? (
            <ul className="space-y-2">
              {analytics.top_bought.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: r.cat?.color ?? '#8E8E93' }}
                    />
                    <span className="truncate text-neutral-800">{r.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-700">{format_rub(r.rub)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>закупок не было</EmptyState>
          )}
        </Card>

        <Card
          title="расход по полкам"
          hint={`${analytics.orders} зак. · ${analytics.receipts} пост.`}
        >
          {analytics.by_cat.length ? (
            <ul className="space-y-2.5">
              {analytics.by_cat.map((r) => (
                <li key={r.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="truncate text-neutral-800">{r.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-neutral-700">{format_rub(r.rub)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, Math.round((r.rub / analytics.cat_total) * 100))}%`,
                        background: r.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>нет расхода</EmptyState>
          )}
        </Card>
      </div>

      {/* ——— движения ——— */}
      <section className="space-y-3">
        <h2 className="font-heading-soft text-lg text-neutral-900">движения</h2>

        <div className="flex flex-wrap items-center gap-2">
          <CategoryFlyout
            cats={cats}
            value={mv_category}
            on_change={set_mv_category}
            adding={adding_cat_for === 'mv'}
            new_name={new_cat_name}
            on_adding={(v) => set_adding_cat_for(v ? 'mv' : null)}
            on_new_name={set_new_cat_name}
            on_commit_add={commit_add_category}
            on_edit={(id, x, y) => {
              set_renaming(false);
              set_cat_menu({ id, x, y });
            }}
          />
          <MenuSelect
            value={mv_sort}
            options={MV_SORT_OPTIONS}
            on_change={(id) => set_mv_sort(id as mv_sort_id)}
            className="w-[10.5rem] shrink-0"
            menu_className="w-[10.5rem]"
          />
          <div className="relative shrink-0" data-dates-pop>
            <button
              type="button"
              aria-expanded={dates_open}
              onClick={() => set_dates_open((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-sm text-neutral-800 hover:border-neutral-300"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="max-w-[9rem] truncate">{period_label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={`text-neutral-400 ${dates_open ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {dates_open && (
              <div className="absolute left-0 top-full z-40 mt-1 w-[16.5rem] rounded-2xl border border-neutral-200/80 bg-white p-1 shadow-soft">
                {period_options.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      p.apply();
                      set_dates_open(false);
                    }}
                    className={`flex w-full rounded-xl px-3 py-2 text-left text-sm ${
                      period_preset === p.id ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:bg-neutral-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <div className="mt-1 grid grid-cols-2 gap-2 border-t border-neutral-100 px-2 py-2">
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
              </div>
            )}
          </div>
          <input
            type="search"
            className="h-9 w-[11.5rem] shrink-0 rounded-pill border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-accent/40"
            placeholder="найти"
            value={mv_query}
            onChange={(e) => set_mv_query(e.target.value)}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" className={btn_secondary} onClick={() => set_count_open(true)}>
              инвентаризация
            </button>
            <button type="button" className={btn_accent} disabled={must_count} onClick={() => open_receipt()}>
              + поставка
            </button>
            <button type="button" className={btn_writeoff} disabled={must_count} onClick={open_writeoff}>
              + списание
            </button>
          </div>
        </div>

        <Card>
          {filtered_journal.length ? (
            <>
            <ul className="divide-y divide-neutral-100">
              {(journal_more ? filtered_journal : filtered_journal.slice(0, 10)).map((row, row_i) => {
                if (row.kind === 'order') {
                  const open = expanded_orders.has(row.orderId);
                  const short = row.orderId.slice(0, 8);
                  const line_names = row.lines.map((l) => {
                    const mat = mat_by_id.get(l.materialId);
                    return {
                      id: l.materialId,
                      name: material_label(mat) || 'без названия',
                      cat: mat?.category || '',
                      qty: l.qty,
                      mat,
                    };
                  });
                  // топпинги/тапиока/джусболы — в превью первыми, иначе их не видно в свёрнутом заказе
                  const preview = [...line_names]
                    .sort((a, b) => {
                      const score = (x: typeof a) =>
                        x.id === 'tapioca' || x.id.startsWith('jb_') ? 0 : x.cat === 'toppings' ? 1 : 2;
                      return score(a) - score(b) || a.name.localeCompare(b.name, 'ru');
                    })
                    .slice(0, 4)
                    .map((x) => (x.mat ? `${x.name} ${format_base_qty(x.mat, x.qty)}` : x.name));
                  const preview_more = line_names.length > 4 ? ` · +${line_names.length - 4}` : '';
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
                          {preview.length ? (
                            <span className="mt-0.5 block truncate text-xs text-neutral-500">
                              {preview.join(' · ')}
                              {preview_more}
                            </span>
                          ) : null}
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
                              {row.lines.map((mv, line_i) => {
                                const mat = mat_by_id.get(mv.materialId);
                                const tag = cat_of(cats, mat?.category || '');
                                return (
                                  <tr key={`${mv.id}-${line_i}`} className="border-t border-neutral-100/80">
                                    <td className="px-3 py-1.5 text-neutral-800">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span
                                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                                          style={{ background: tag?.color ?? '#8E8E93' }}
                                        />
                                        {material_label(mat) || 'без названия'}
                                      </span>
                                    </td>
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
                                  итого
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
                                const full = journal_rows.find(
                                  (r) => r.kind === 'order' && r.orderId === row.orderId
                                );
                                const lines = full && full.kind === 'order' ? full.lines : row.lines;
                                set_state((prev) =>
                                  lines.reduce((s, mv) => remove_stock_movement(s, mv.id, ADMIN_ACTOR), prev)
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
                const mat = mat_by_id.get(mv.materialId);
                const tag = cat_of(cats, mat?.category || '');
                return (
                  <li key={`${mv.id}-${row_i}`} className="flex items-center gap-3 px-1 py-2.5">
                    <span className="w-6 shrink-0" />
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${movement_tone[mv.type]}`}>
                      {movement_labels[mv.type]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: tag?.color ?? '#8E8E93' }}
                        />
                        <span className="text-sm text-neutral-900">{material_label(mat) || 'без названия'}</span>
                      </span>
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
                      {mv.type === 'adjust'
                        ? '= '
                        : is_remainder_invoice(mv.note)
                          ? 'на '
                          : mv.type === 'in'
                            ? '+ '
                            : '− '}
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
            {filtered_journal.length > 10 ? (
              <button
                type="button"
                className="mt-2 w-full rounded-xl py-2 text-sm text-neutral-500 hover:bg-neutral-50"
                onClick={() => set_journal_more((v) => !v)}
              >
                {journal_more ? 'свернуть' : `ещё ${filtered_journal.length - 10}`}
              </button>
            ) : null}
            </>
          ) : (
            <EmptyState>за эти даты движений нет</EmptyState>
          )}
        </Card>
      </section>

      {/* ——— ингредиенты ——— */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading-soft text-lg text-neutral-900">ингредиенты</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              склад точки «{spot_label}». название и тара общие, остаток и рубли поставок — только здесь
            </p>
          </div>
          {save_label(save_status) ? (
            <p className={`shrink-0 text-xs ${save_status === 'error' ? 'text-red-600' : 'text-neutral-400'}`}>
              {save_label(save_status)}
            </p>
          ) : null}
        </div>

        <CategoryChips
          cats={cats}
          value={stock_category}
          on_change={set_stock_category}
          adding={adding_cat_for === 'stock'}
          new_name={new_cat_name}
          on_adding={(v) => set_adding_cat_for(v ? 'stock' : null)}
          on_new_name={set_new_cat_name}
          on_commit_add={commit_add_category}
          on_edit={(id, x, y) => {
            set_renaming(false);
            set_cat_menu({ id, x, y });
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <MenuSelect
            value={stock_sort}
            options={STOCK_SORT_OPTIONS}
            on_change={(id) => set_stock_sort(id as stock_sort_id)}
            className="w-[10.5rem] shrink-0"
            menu_className="w-[10.5rem]"
          />
          <input
            type="search"
            className="h-9 w-[11.5rem] shrink-0 rounded-pill border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-accent/40"
            placeholder="найти"
            value={stock_query}
            onChange={(e) => set_stock_query(e.target.value)}
          />
        </div>

        <ul className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {ingredient_rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-neutral-400">пусто</li>}
          {ingredient_rows.map((row) => {
            if (row.kind === 'prep') {
              const recipe = row.recipe;
              return (
                <li key={recipe.id} className="border-t border-neutral-100 first:border-t-0">
                  <PrepRecipeCard
                    recipe={recipe}
                    materials={state.materials}
                    cost_of={(id, qty) => material_cost(state, id, qty)}
                    tag={cat_of(cats, 'prep')}
                    open={open_prep === recipe.id}
                    on_toggle={() => set_open_prep((cur) => (cur === recipe.id ? null : recipe.id))}
                    on_change={(next) =>
                      set_state((prev) => ({
                        ...prev,
                        prepRecipes: (prev.prepRecipes ?? []).map((item) => (item.id === next.id ? next : item)),
                      }))
                    }
                    on_remove={() => remove_prep(recipe.id)}
                    drinks={drink_use.get(recipe.id) ?? 0}
                    swaps={swap_options(recipe.id, Object.keys(recipe.ingredients))}
                    on_swap={(material_id) =>
                      set_state((prev) => swap_material_for_prep(prev, material_id, recipe.id))
                    }
                  />
                </li>
              );
            }
            const s = row.stock;
            const tag = cat_of(cats, s.material.category);
            const free = material_is_free(s.material);
            const lots = (lots_by_id.get(s.material.id) ?? []).filter((b) => b.qty > 0.5);
            return (
              <li
                key={s.material.id}
                className="border-t border-neutral-100 px-4 py-2.5 first:border-t-0"
              >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
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
                  value={material_label(s.material)}
                  placeholder="название"
                  onChange={(e) => update_material(s.material.id, { name: e.target.value })}
                />
                <span className={`w-24 shrink-0 text-right text-sm tabular-nums ${!free && s.qty < 0 ? 'text-amber-600' : 'text-neutral-800'}`}>
                  {format_base_qty(s.material, s.qty)}
                </span>
                {!free && s.qty < -0.5 && material_is_prep_dry(s.material, prep_stations) ? (
                  <button
                    type="button"
                    disabled={must_count}
                    onClick={() => open_receipt(s.material.id)}
                    className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    поставка
                  </button>
                ) : null}
                {free ? (
                  <span className="w-[7.5rem] shrink-0 text-right text-[11px] text-neutral-400">бесплатно</span>
                ) : null}
                {free || weigh_kind_of(s.material) === 'pcs' ? null : (
                  <label className="flex w-[6.75rem] shrink-0 items-center gap-1" title="вес тары, в которой взвешиваете">
                    <NumInput
                      value={s.material.tareWeight ?? 0}
                      min={0}
                      className={`${cell_input_class} w-[3.75rem]`}
                      on_change={(v) => {
                        const id = s.material.id;
                        set_state((prev) => ({
                          ...prev,
                          materials: prev.materials.map((m) => {
                            if (m.id !== id) return m;
                            const next = { ...m };
                            if (v > 0) next.tareWeight = v;
                            else delete next.tareWeight;
                            return next;
                          }),
                        }));
                      }}
                    />
                    <span className="text-[10px] text-neutral-400">тара {weigh_unit(weigh_kind_of(s.material))}</span>
                  </label>
                )}
                <span
                  className="w-20 shrink-0 text-right text-sm tabular-nums text-neutral-500"
                  title={free ? undefined : 'сумма рублей по поставкам, которые ещё лежат'}
                >
                  {free ? '—' : format_rub(s.value)}
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
                  className="rounded-lg px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  onClick={() => set_adjust_for(s.material.id)}
                >
                  факт
                </button>
                <button type="button" className={btn_ghost_danger} onClick={() => remove_material(s.material.id)}>
                  ×
                </button>
              </div>
                {!free && lots.length > 1 ? <LotLines material={s.material} lots={lots} /> : null}
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

      {/* ——— история ——— */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-heading-soft text-lg text-neutral-900">история</h2>
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

      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          блокировка заказа без сырья
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          касса и приложение не создадут заказ, если не хватает отмеченных позиций
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              checked={stock_guard_of(state).prep}
              onChange={(e) =>
                set_state((prev) => ({
                  ...prev,
                  stockGuard: { ...stock_guard_of(prev), prep: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-neutral-300"
            />
            тапиока и чаи
            <span className="text-xs text-neutral-400">по умолчанию</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              checked={stock_guard_of(state).all}
              onChange={(e) =>
                set_state((prev) => ({
                  ...prev,
                  stockGuard: { ...stock_guard_of(prev), all: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-neutral-300"
            />
            все ингредиенты техкарты
            <span className="text-xs text-neutral-400">молоко, сиропы, стаканы…</span>
          </label>
        </div>
      </div>

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
                  ? stock_category === 'все'
                    ? null
                    : stock_category
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

const btn_writeoff =
  'inline-flex items-center justify-center rounded-pill border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';

const PACK_UNITS: material_unit[] = ['g', 'kg', 'ml', 'L', 'pcs'];

type receipt_row = {
  key: string;
  materialId: string;
  creating: boolean;
  newName: string;
  newCategory: string;
  packs: number;
  packSize: number;
  packUnit: material_unit;
  packPrice: number;
  total: number;
};

type receipt_submit = {
  materialId?: string;
  create?: { name: string; category: string; unit: material_unit };
  quantity: number;
  total: number;
  date: string;
  note?: string;
  /** без суммы или даты — подтвердят в операциях */
  pending?: receipt_gap;
};

function receipt_gap_of(has_sum: boolean, has_date: boolean): receipt_gap | undefined {
  if (has_sum && has_date) return undefined;
  return has_sum ? 'date' : has_date ? 'sum' : 'both';
}

function rub2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function blank_receipt_row(
  materials: material[],
  categories: stock_category[],
  prefer?: string | null
): receipt_row {
  const m = materials.find((item) => item.id === prefer) || materials[0];
  return {
    key: new_id('r'),
    materialId: m?.id ?? '',
    creating: !m,
    newName: '',
    newCategory: categories[0]?.id ?? 'mixes',
    packs: 0,
    packSize: 1,
    packUnit: m?.unit ?? 'g',
    packPrice: 0,
    total: 0,
  };
}

function ProductField({
  materials,
  categories,
  creating,
  materialId,
  newName,
  on_pick,
  on_create,
}: {
  materials: material[];
  categories: stock_category[];
  creating: boolean;
  materialId: string;
  newName: string;
  on_pick: (id: string) => void;
  on_create: () => void;
}) {
  const [open, set_open] = useState(false);
  const [query, set_query] = useState('');
  useEffect(() => {
    if (!open) return;
    function on_key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      set_open(false);
    }
    document.addEventListener('keydown', on_key, true);
    return () => document.removeEventListener('keydown', on_key, true);
  }, [open]);
  const picked = materials.find((m) => m.id === materialId);
  const picked_cat = picked ? cat_of(categories, picked.category) : undefined;
  const q = query.trim().toLowerCase();
  const list = materials
    .filter((m) => {
      const label = (material_label(m) || 'без названия').toLowerCase();
      const cat = (cat_of(categories, m.category)?.name || '').toLowerCase();
      if (!q) return true;
      return label.includes(q) || cat.includes(q);
    })
    .sort((a, b) => {
      const by_cat = cat_index(categories, a.category) - cat_index(categories, b.category);
      if (by_cat) return by_cat;
      return (material_label(a) || 'без названия').localeCompare(material_label(b) || 'без названия', 'ru');
    });
  const title = creating ? newName.trim() || 'новый продукт' : material_label(picked) || 'выберите продукт';
  const dot = creating ? '#8E8E93' : (picked_cat?.color ?? '#8E8E93');

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => set_open((v) => !v)}
        className={`${field_class} mt-1 flex items-center gap-2 text-left`}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
        <span className={`min-w-0 flex-1 truncate ${!creating && !picked ? 'text-neutral-400' : ''}`}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 text-neutral-400 ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="mt-1 rounded-2xl border border-neutral-200/80 bg-white p-1.5 shadow-soft">
          <input
            autoFocus
            value={query}
            onChange={(e) => set_query(e.target.value)}
            placeholder="найти"
            className="mb-1 h-9 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-accent/40"
          />
          <div className="max-h-56 overflow-y-auto">
            {list.map((m) => {
              const cat = cat_of(categories, m.category);
              const active = !creating && m.id === materialId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    on_pick(m.id);
                    set_open(false);
                    set_query('');
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                    active ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:bg-neutral-50'
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat?.color ?? '#8E8E93' }} />
                  <span className="min-w-0 flex-1 truncate">{material_label(m) || 'без названия'}</span>
                  <span className={`shrink-0 text-[11px] ${active ? 'text-white/70' : 'text-neutral-400'}`}>{cat?.name}</span>
                </button>
              );
            })}
            {list.length === 0 ? <p className="px-3 py-2 text-sm text-neutral-400">ничего не нашлось</p> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              on_create();
              set_open(false);
              set_query('');
            }}
            className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-50"
          >
            + новый продукт
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** единица, в которой продукт лежит на складе: новый весовой — всегда граммы */
function stored_unit_of(row: receipt_row, mat: material | undefined): material_unit {
  if (row.creating) return row.packUnit === 'pcs' ? 'pcs' : 'g';
  return mat?.unit ?? 'g';
}

function ReceiptForm({
  materials,
  categories,
  initial_material_id,
  on_close,
  on_submit,
}: {
  materials: material[];
  categories: stock_category[];
  initial_material_id?: string | null;
  on_close: () => void;
  on_submit: (rows: receipt_submit[]) => void;
}) {
  const [date, set_date] = useState(today_iso());
  const [note, set_note] = useState('');
  const [rows, set_rows] = useState<receipt_row[]>(() => [
    blank_receipt_row(materials, categories, initial_material_id),
  ]);

  useEffect(() => {
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') on_close();
    }
    document.addEventListener('keydown', on_key);
    return () => document.removeEventListener('keydown', on_key);
  }, [on_close]);

  function patch(key: string, next: (row: receipt_row) => receipt_row) {
    set_rows((prev) => prev.map((r) => (r.key === key ? next(r) : r)));
  }

  function line_of(row: receipt_row) {
    const mat = materials.find((m) => m.id === row.materialId);
    const stored = stored_unit_of(row, mat);
    const grams_each = to_grams(row.packSize, row.packUnit);
    const grams = grams_each == null ? 0 : grams_each * row.packs;
    const pieces = row.packUnit === 'pcs' ? row.packs * row.packSize : 0;
    const purchase = receipt_purchase_qty(row.packs, row.packSize, row.packUnit, stored);
    const mismatch = row.packs > 0 && row.packSize > 0 && purchase <= 0;
    const per_gram = grams > 0 && row.total > 0 ? row.total / grams : 0;
    const per_piece = pieces > 0 && row.total > 0 ? row.total / pieces : 0;
    const per_stored = purchase > 0 && row.total > 0 ? row.total / purchase : 0;
    const named = row.creating ? row.newName.trim() : Boolean(row.materialId);
    const ready = Boolean(named) && row.packs > 0 && row.packSize > 0 && purchase > 0;
    return { mat, stored, grams, pieces, purchase, mismatch, per_gram, per_piece, per_stored, ready };
  }

  const ready_rows = rows.filter((r) => line_of(r).ready);
  const blocked = rows.some((r) => {
    const line = line_of(r);
    const touched = r.creating ? Boolean(r.newName.trim()) || r.packs > 0 || r.total > 0 : r.packs > 0 || r.total > 0;
    return touched && !line.ready;
  });
  const hold_reason = (() => {
    if (ready_rows.length > 0 && !blocked) return '';
    const row = rows.find((r) => !line_of(r).ready) ?? rows[0];
    if (!row) return '';
    const line = line_of(row);
    if (line.mismatch) return '';
    if (row.creating && !row.newName.trim()) return 'напишите название';
    if (!(row.packs > 0)) return 'укажите число упаковок';
    if (!(row.packSize > 0)) return 'укажите вес одной упаковки';
    return '';
  })();
  const total_sum = ready_rows.reduce((s, r) => s + (r.total || 0), 0);
  const waits = ready_rows.length > 0 && (!date || ready_rows.some((r) => !(r.total > 0)));

  return (
    <Card
      title="поставка"
      hint="выберите ингредиент и сумму этой накладной. тот же продукт не дублируется: граммы сложатся, эти рубли останутся у партии"
      className="border-accent/30 ring-1 ring-accent/20"
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-neutral-500">
          дата
          <input type="date" max={today_iso()} className={`${field_class} mt-1`} value={date} onChange={(e) => set_date(e.target.value)} />
          {!date ? <span className="mt-1 block text-[11px] text-amber-700">без даты — подтвердят в операциях</span> : null}
        </label>
        <label className="text-xs text-neutral-500 sm:col-span-2">
          поставщик / комментарий
          <input className={`${field_class} mt-1`} value={note} placeholder="например, метро, накладная №12" onChange={(e) => set_note(e.target.value)} />
        </label>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const line = line_of(r);
          const dup =
            r.creating &&
            r.newName.trim() &&
            materials.some((m) => m.name.trim().toLowerCase() === r.newName.trim().toLowerCase());
          return (
            <div key={r.key} className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 text-xs text-neutral-500">
                  продукт
                  <ProductField
                    materials={materials}
                    categories={categories}
                    creating={r.creating}
                    materialId={r.materialId}
                    newName={r.newName}
                    on_create={() => {
                      patch(r.key, (row) => ({ ...row, creating: true, materialId: '' }));
                      requestAnimationFrame(() => {
                        document.querySelector<HTMLInputElement>(`[data-new-name="${r.key}"]`)?.focus();
                      });
                    }}
                    on_pick={(id) => {
                      const mat = materials.find((m) => m.id === id);
                      patch(r.key, (row) => ({
                        ...row,
                        creating: false,
                        materialId: id,
                        packUnit: mat?.unit ?? row.packUnit,
                        packPrice: 0,
                        total: 0,
                      }));
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={`${btn_ghost_danger} mt-5`}
                  onClick={() => set_rows((prev) => prev.filter((x) => x.key !== r.key))}
                  disabled={rows.length === 1}
                >
                  ×
                </button>
              </div>
              {r.creating ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-neutral-500">
                    название
                    <input
                      data-new-name={r.key}
                      className={`${field_class} mt-1`}
                      value={r.newName}
                      placeholder="например, сироп манго"
                      onChange={(e) => patch(r.key, (row) => ({ ...row, newName: e.target.value }))}
                    />
                  </label>
                  <div className="text-xs text-neutral-500 sm:col-span-2">
                    категория
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {categories.map((c) => {
                        const active = r.newCategory === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => patch(r.key, (row) => ({ ...row, newCategory: c.id }))}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                              active ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {dup ? (
                    <p className="text-[11px] text-amber-600 sm:col-span-2">такое название уже есть — можно выбрать его сверху</p>
                  ) : (
                    <p className="text-[11px] text-neutral-400 sm:col-span-2">
                      {r.packUnit === 'pcs' ? 'новый продукт считается штуками' : 'новый продукт считается в граммах'}
                    </p>
                  )}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-neutral-500">
                  упаковок
                  <NumInput value={r.packs} min={0} className={`${field_class} mt-1 text-right`} on_change={(packs) => patch(r.key, (row) => {
                    if (row.packPrice > 0) return { ...row, packs, total: rub2(packs * row.packPrice) };
                    const packPrice = packs > 0 ? rub2(row.total / packs) : row.packPrice;
                    return { ...row, packs, packPrice };
                  })} />
                </label>
                <label className="text-xs text-neutral-500">
                  {r.packUnit === 'pcs' ? 'в упаковке' : 'вес 1 упаковки'}
                  <span className="mt-1 flex min-w-0 flex-wrap gap-1">
                    <NumInput
                      value={r.packSize}
                      min={0}
                      className={`${field_class} min-w-0 flex-1 text-right`}
                      on_change={(packSize) => patch(r.key, (row) => ({ ...row, packSize }))}
                    />
                    <span className="flex shrink-0 rounded-2xl border border-neutral-200 bg-white p-0.5">
                      {PACK_UNITS.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => patch(r.key, (row) => ({ ...row, packUnit: u }))}
                          className={`rounded-xl px-2 py-1.5 text-xs ${
                            r.packUnit === u ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-50'
                          }`}
                        >
                          {unit_labels[u]}
                        </button>
                      ))}
                    </span>
                  </span>
                </label>
                <label className="text-xs text-neutral-500">
                  цена упаковки, ₽
                  <NumInput
                    value={r.packPrice}
                    min={0}
                    className={`${field_class} mt-1 text-right`}
                    on_change={(packPrice) => patch(r.key, (row) => ({ ...row, packPrice, total: rub2(row.packs * packPrice) }))}
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  сумма, ₽
                  <NumInput
                    value={r.total}
                    min={0}
                    className={`${field_class} mt-1 text-right`}
                    on_change={(total) =>
                      patch(r.key, (row) => ({
                        ...row,
                        total,
                        packPrice: row.packs > 0 ? rub2(total / row.packs) : row.packPrice,
                      }))
                    }
                  />
                </label>
              </div>
              {line.mismatch ? (
                <p className="mt-2 text-[11px] text-red-500">
                  {base_unit(line.stored) === 'pcs' ? 'этот продукт считается штуками' : 'для веса укажите г, кг, мл или л — не штуки'}
                </p>
              ) : line.grams > 0 ? (
                <p className="mt-2 text-[11px] text-neutral-500">
                  на склад <span className="font-medium text-neutral-900">{format_grams(line.grams)}</span>
                  {line.per_gram > 0 ? (
                    <>
                      {' · '}
                      <span className="font-medium text-neutral-900">{format_rub(line.per_gram, 4)}/г</span>
                    </>
                  ) : null}
                  {line.stored !== 'g' && line.per_stored > 0 ? (
                    <span className="text-neutral-400">
                      {' '}
                      · партия {format_rub(line.per_stored, 2)}/{unit_labels[line.stored]}
                    </span>
                  ) : null}
                </p>
              ) : line.pieces > 0 ? (
                <p className="mt-2 text-[11px] text-neutral-500">
                  на склад{' '}
                  <span className="font-medium text-neutral-900">
                    {line.pieces.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} шт
                  </span>
                  {line.per_piece > 0 ? (
                    <>
                      {' · '}
                      <span className="font-medium text-neutral-900">{format_rub(line.per_piece, 2)}/шт</span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className={btn_secondary}
          onClick={() => set_rows((prev) => [...prev, blank_receipt_row(materials, categories)])}
        >
          + строка
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            итого <span className="font-semibold text-neutral-900">{format_rub(total_sum)}</span>
            {hold_reason ? <span className="mt-0.5 block text-right text-[11px] text-amber-700">{hold_reason}</span> : null}
            {!hold_reason && waits ? (
              <span className="mt-0.5 block text-right text-[11px] text-amber-700">
                без суммы или даты — поставка будет ждать подтверждения в операциях
              </span>
            ) : null}
          </span>
          <button type="button" className={btn_secondary} onClick={on_close}>
            отмена
          </button>
          <button
            type="button"
            className={btn_accent}
            disabled={ready_rows.length === 0 || blocked}
            onClick={() =>
              on_submit(
                ready_rows.map((r) => {
                  const line = line_of(r);
                  const pack = `${format_qty_short(r.packs)} уп. × ${format_qty_short(r.packSize)} ${unit_labels[r.packUnit]}`;
                  return {
                    materialId: r.creating ? undefined : r.materialId,
                    create: r.creating
                      ? { name: r.newName.trim(), category: r.newCategory, unit: line.stored }
                      : undefined,
                    quantity: line.purchase,
                    total: r.total,
                    date: receipt_stamp(date),
                    note: [note.trim(), pack].filter(Boolean).join(' · ') || undefined,
                    pending: receipt_gap_of(r.total > 0, Boolean(date)),
                  };
                }),
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

function format_grams(n: number) {
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} г`;
}

function format_qty_short(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

function WriteoffForm({
  materials,
  qty_of,
  on_close,
  on_submit,
}: {
  materials: material[];
  qty_of: (id: string) => number;
  on_close: () => void;
  on_submit: (materialId: string, qty: number, note: string, date: string) => void;
}) {
  const list = useMemo(
    () => [...materials].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [materials]
  );
  const [material_id, set_material_id] = useState(list[0]?.id ?? '');
  const [qty, set_qty] = useState(0);
  const [note, set_note] = useState('');
  const [date, set_date] = useState(today_iso());
  const mat = list.find((m) => m.id === material_id) ?? null;
  const on_hand = mat ? qty_of(mat.id) : 0;
  const too_much = mat != null && qty > on_hand + 0.001;
  const ready = Boolean(mat) && qty > 0 && on_hand > 0 && !too_much;

  return (
    <Card
      title="списание"
      hint="пыль, порча, брак. количество уйдёт со склада и попадёт в списано"
      className="border-red-200 ring-1 ring-red-100"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-neutral-500 sm:col-span-2">
          продукт
          <select
            className={`${field_class} mt-1`}
            value={material_id}
            onChange={(e) => {
              set_material_id(e.target.value);
              set_qty(0);
            }}
          >
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {format_base_qty(m, qty_of(m.id))}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          сколько списать{mat ? `, ${base_unit_label(mat.unit)}` : ''}
          <NumInput value={qty} min={0} className={`${field_class} mt-1 text-right`} on_change={set_qty} />
        </label>
        <label className="text-xs text-neutral-500">
          дата
          <input
            type="date"
            max={today_iso()}
            className={`${field_class} mt-1`}
            value={date}
            onChange={(e) => set_date(e.target.value)}
          />
        </label>
        <label className="text-xs text-neutral-500 sm:col-span-2">
          комментарий
          <input
            className={`${field_class} mt-1`}
            value={note}
            placeholder="крахмальная пыль, порча, брак"
            onChange={(e) => set_note(e.target.value)}
          />
        </label>
      </div>
      {mat ? (
        <p className={`mt-3 text-xs ${too_much ? 'text-red-600' : 'text-neutral-500'}`}>
          {too_much
            ? `на складе ${format_base_qty(mat, on_hand)}, больше списать нельзя`
            : qty > 0
              ? `спишется ${format_base_qty(mat, qty)} · останется ${format_base_qty(mat, Math.max(0, on_hand - qty))}`
              : `сейчас на складе ${format_base_qty(mat, on_hand)}`}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {mat && on_hand > 0 ? (
          <button type="button" className={btn_secondary} onClick={() => set_qty(on_hand)}>
            весь остаток
          </button>
        ) : null}
        <button type="button" className={btn_secondary} onClick={on_close}>
          отмена
        </button>
        <button
          type="button"
          className={btn_writeoff}
          disabled={!ready}
          onClick={() => mat && on_submit(mat.id, qty, note.trim(), date)}
        >
          списать
        </button>
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
