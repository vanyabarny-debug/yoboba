'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  scale_prep_steps,
  unit_label_for_material,
} from '@/lib/finance/prep-steps';
import { base_unit, new_id, type material, type prep_step } from '@/lib/finance/model';
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

  useEffect(() => {
    if (controlled) return;
    if (!volumes.includes(inner_ml)) set_inner_ml(volumes[0] ?? base_ml);
  }, [volumes, inner_ml, base_ml, controlled]);

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

  const used = new Set(steps.map((s) => s.materialId).filter(Boolean) as string[]);
  const available = materials.filter((m) => m.name.trim() && !used.has(m.id));

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
                    {mat ? <p className="text-[10px] text-neutral-400">склад: {mat.name}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-neutral-400">пока пусто — добавьте шаг из склада или своё действие</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {available.length > 0 ? (
          <select
            className={`${field_class} min-w-[12rem] flex-1 text-xs`}
            value={adding}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
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
            }}
          >
            <option value="">+ из склада…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
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
