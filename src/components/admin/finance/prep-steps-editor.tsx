'use client';

import { useMemo, useState } from 'react';
import {
  scale_prep_steps,
  unit_label_for_material,
} from '@/lib/finance/prep-steps';
import { cup_fill_summary, edible_grams_from_steps } from '@/lib/finance/cup-fill';
import {
  base_unit,
  format_rub,
  is_prep_recipe_id,
  is_station_prep,
  new_id,
  stock_category_for,
  type material,
  type prep_step,
} from '@/lib/finance/model';
import { btn_ghost_danger, btn_secondary, cell_input_class, field_class } from '@/components/admin/finance/ui';

function qty_stays(mat: material | undefined) {
  return !mat || base_unit(mat.unit) === 'pcs' || mat.category === 'packaging';
}

function to_base_qty(display_qty: number, view_ml: number, base_ml: number, mat: material | undefined) {
  if (!(display_qty > 0) || qty_stays(mat) || !(view_ml > 0) || Math.abs(view_ml - base_ml) < 0.001) {
    return display_qty;
  }
  return Math.round((display_qty * base_ml) / view_ml * 10) / 10;
}

export default function PrepStepsEditor({
  steps,
  materials,
  base_ml = 500,
  size_keys = [],
  view_ml: view_ml_prop,
  on_view_ml,
  show_header = true,
  show_fill_total = false,
  cost_of,
  on_change,
}: {
  steps: prep_step[];
  materials: material[];
  /** объём, в котором хранятся граммовки */
  base_ml?: number;
  /** доступные размеры техкарты — плашка выбора */
  size_keys?: string[];
  /** контролируемый объём просмотра (если снаружи общий селектор) */
  view_ml?: number;
  on_view_ml?: (ml: number) => void;
  show_header?: boolean;
  /** итого г съедобного и сколько до цели 490/637 */
  show_fill_total?: boolean;
  /** рубли строки и из какого сырья они сложились */
  cost_of?: (material_id: string, qty: number) => { total: number; parts: { name: string; cost: number }[] };
  on_change: (next: prep_step[]) => void;
}) {
  const volumes = useMemo(() => {
    const mls = size_keys
      .map((k) => Math.round(Number(k) || 0))
      .filter((ml) => ml > 0)
      .sort((a, b) => a - b);
    return mls.length ? mls : [base_ml];
  }, [size_keys, base_ml]);

  const [inner_ml, set_inner_ml] = useState(view_ml_prop ?? volumes[0] ?? base_ml);
  const [adding, set_adding] = useState('');
  const by_id = new Map(materials.map((m) => [m.id, m]));
  const controlled = typeof view_ml_prop === 'number';
  const view_ml = controlled ? view_ml_prop : inner_ml;

  function set_view_ml(ml: number) {
    if (controlled) on_view_ml?.(ml);
    else set_inner_ml(ml);
  }

  if (!controlled && !volumes.includes(inner_ml)) set_inner_ml(volumes[0] ?? base_ml);

  const shown = useMemo(
    () => scale_prep_steps(steps, base_ml, view_ml, materials),
    [steps, base_ml, view_ml, materials]
  );

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    on_change(next);
  }

  function patch(i: number, part: Partial<prep_step>) {
    on_change(
      steps.map((s, idx) => {
        if (idx !== i) return s;
        if (part.qty === undefined) return { ...s, ...part };
        const mat = s.materialId ? by_id.get(s.materialId) : undefined;
        return { ...s, ...part, qty: to_base_qty(part.qty, view_ml, base_ml, mat) };
      })
    );
  }

  function is_prep(mat: material) {
    return is_prep_recipe_id(mat.id) || is_station_prep(mat) || stock_category_for(mat) === 'prep';
  }

  function add_material(id: string) {
    const mat = by_id.get(id);
    if (!mat) return;
    on_change([
      ...steps,
      {
        id: new_id('step'),
        title: mat.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim(),
        hint: '',
        materialId: mat.id,
        qty: 0,
      },
    ]);
    set_adding('');
  }

  const used = new Set(steps.map((s) => s.materialId).filter(Boolean) as string[]);
  const available = materials
    .filter((m) => m.name.trim() && !used.has(m.id))
    .slice()
    .sort((a, b) => {
      const ap = is_prep_recipe_id(a.id) || is_station_prep(a) || stock_category_for(a) === 'prep' ? 0 : 1;
      const bp = is_prep_recipe_id(b.id) || is_station_prep(b) || stock_category_for(b) === 'prep' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name, 'ru');
    });
  const fill = show_fill_total
    ? cup_fill_summary(edible_grams_from_steps(shown, materials), view_ml)
    : null;

  return (
    <div>
      {show_header ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-neutral-900">рецепт</p>
          {volumes.length > 1 ? (
            <div className="inline-flex max-w-full flex-wrap rounded-full border border-black/[0.08] bg-white p-0.5">
              {volumes.map((ml) => {
                const active = ml === view_ml;
                return (
                  <button
                    key={ml}
                    type="button"
                    onClick={() => set_view_ml(ml)}
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
          ) : volumes[0] ? (
            <span className="text-xs text-neutral-400">{volumes[0]} мл</span>
          ) : null}
        </div>
      ) : null}
      {shown.length ? (
        <ol className="space-y-2">
          {shown.map((s, i) => {
            const mat = s.materialId ? by_id.get(s.materialId) : undefined;
            return (
              <li key={s.id} className="rounded-2xl bg-neutral-50 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-xs tabular-nums text-neutral-400">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      className={`${cell_input_class} w-full text-left`}
                      value={s.title}
                      placeholder="название для кассира"
                      onChange={(e) => patch(i, { title: e.target.value })}
                    />
                    <div className="grid grid-cols-[1fr_5.5rem_auto] gap-1.5">
                      <input
                        className={`${cell_input_class} w-full text-left text-xs`}
                        value={s.hint || ''}
                        placeholder="подсказка: насыпать, налить, взбить…"
                        onChange={(e) => patch(i, { hint: e.target.value })}
                      />
                      <div className="flex items-center gap-1">
                        <input
                          className={`${cell_input_class} w-full`}
                          inputMode="decimal"
                          value={s.qty || ''}
                          placeholder="—"
                          onChange={(e) => {
                            const n = Number(String(e.target.value).replace(',', '.'));
                            patch(i, { qty: Number.isFinite(n) && n > 0 ? n : 0 });
                          }}
                        />
                        <span className="w-6 shrink-0 text-[11px] text-neutral-400">{unit_label_for_material(mat)}</span>
                      </div>
                      <div className="flex gap-0.5">
                        <button type="button" className={btn_secondary} onClick={() => move(i, -1)} disabled={i === 0}>
                          ↑
                        </button>
                        <button type="button" className={btn_secondary} onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                          ↓
                        </button>
                        <button
                          type="button"
                          className={btn_ghost_danger}
                          onClick={() => on_change(steps.filter((_, idx) => idx !== i))}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {s.when ? (
                      <p className="text-[10px] uppercase tracking-[0.12em] text-accent">
                        {s.when === 'cold' ? 'только холодный' : 'только горячий'}
                      </p>
                    ) : null}
                    {s.qty_label && !(s.qty > 0) ? (
                      <p className="text-[10px] text-neutral-400">{s.qty_label}</p>
                    ) : null}
                    {mat && is_prep(mat) ? (
                      <PrepMoney mat={mat} qty={s.qty} cost_of={cost_of} />
                    ) : mat ? (
                      <p className="text-[10px] text-neutral-400">склад: {mat.name}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-neutral-400">пока пусто — добавьте шаг из склада или своё действие</p>
      )}
      {fill ? (
        <p
          className={`mt-2 text-xs tabular-nums ${
            fill.tone === 'ok'
              ? 'text-emerald-600'
              : fill.tone === 'short'
                ? 'text-amber-600'
                : 'text-rose-600'
          }`}
        >
          {fill.label}
        </p>
      ) : null}
      {available.some(is_prep) ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {available.filter(is_prep).map((mat) => (
            <button
              key={mat.id}
              type="button"
              onClick={() => add_material(mat.id)}
              className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-950"
            >
              {mat.name.startsWith('заготовка') ? mat.name : `заготовка · ${mat.name}`}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {available.length > 0 ? (
          <select
            className={`${field_class} min-w-[12rem] flex-1 text-xs`}
            value={adding}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              add_material(id);
            }}
          >
            <option value="">+ из склада…</option>
            {available.map((o) => {
              const prep =
                is_prep_recipe_id(o.id) ||
                is_station_prep(o) ||
                stock_category_for(o) === 'prep';
              const label = prep && !o.name.startsWith('заготовка') ? `заготовка · ${o.name}` : o.name;
              return (
                <option key={o.id} value={o.id}>
                  {label}
                </option>
              );
            })}
          </select>
        ) : null}
        <button
          type="button"
          className={btn_secondary}
          onClick={() =>
            on_change([...steps, { id: new_id('step'), title: '', hint: 'сделать', qty: 0 }])
          }
        >
          + действие
        </button>
      </div>
    </div>
  );
}

function PrepMoney({
  mat,
  qty,
  cost_of,
}: {
  mat: material;
  qty: number;
  cost_of?: (material_id: string, qty: number) => { total: number; parts: { name: string; cost: number }[] };
}) {
  const money = qty > 0 && cost_of ? cost_of(mat.id, qty) : null;
  const parts = money?.parts.filter((part) => part.cost > 0) ?? [];
  return (
    <div className="text-[11px] text-neutral-500">
      <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
        заготовка
      </span>
      {money ? (
        <>
          {format_rub(money.total, 1)}
          {parts.length ? (
            <span className="text-neutral-400">
              {' '}
              · {parts.map((part) => `${part.name} ${format_rub(part.cost, 1)}`).join(' · ')}
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-neutral-400">склад: {mat.name}</span>
      )}
    </div>
  );
}
