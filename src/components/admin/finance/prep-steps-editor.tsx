'use client';

import { useState } from 'react';
import {
  apply_steps_to_size,
  resolved_prep_steps,
  unit_label_for_material,
} from '@/lib/finance/prep-steps';
import { new_id, type material, type prep_step, type tech_card_size } from '@/lib/finance/model';
import { btn_ghost_danger, btn_secondary, cell_input_class, field_class } from '@/components/admin/finance/ui';

export default function PrepStepsEditor({
  size,
  materials,
  on_change,
}: {
  size: tech_card_size;
  materials: material[];
  on_change: (next: tech_card_size) => void;
}) {
  const steps = resolved_prep_steps(size, materials);
  const [adding, set_adding] = useState('');
  const by_id = new Map(materials.map((m) => [m.id, m]));

  function commit(next: prep_step[]) {
    on_change(apply_steps_to_size(size, next, materials));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    commit(next);
  }

  function patch(i: number, part: Partial<prep_step>) {
    commit(steps.map((s, idx) => (idx === i ? { ...s, ...part } : s)));
  }

  const used = new Set(steps.map((s) => s.materialId).filter(Boolean) as string[]);
  const available = materials.filter((m) => m.name.trim() && !used.has(m.id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">этапы готовки</p>
        <p className="text-[11px] text-neutral-400">как видит кассир, по порядку</p>
      </div>
      {steps.length ? (
        <ol className="space-y-2">
          {steps.map((s, i) => {
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
                          onClick={() => commit(steps.filter((_, idx) => idx !== i))}
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
              commit([
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
            commit([
              ...steps,
              { id: new_id('step'), title: '', hint: 'сделать', qty: 0 },
            ])
          }
        >
          + действие
        </button>
      </div>
    </div>
  );
}
