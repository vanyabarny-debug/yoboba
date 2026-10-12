'use client';

import { useMemo, useState } from 'react';
import {
  base_unit_label,
  format_rub,
  material_is_infinite,
  type material,
} from '@/lib/finance/model';
import {
  prep_plan_cost,
  prep_plan_for,
  type prep_input,
  type prep_marinade,
  type prep_station,
} from '@/lib/finance/prep-stations';
import { MenuSelect, NumInput, btn_primary, btn_secondary, cell_input_class, field_class } from '@/components/admin/finance/ui';

type props = {
  station: prep_station;
  materials: material[];
  on_close: () => void;
  on_save: (station: prep_station) => void;
};

function unit_of(materials: material[], id: string) {
  const m = materials.find((x) => x.id === id);
  return m ? base_unit_label(m.unit) : 'г';
}

function InputsEditor({
  rows,
  options,
  materials,
  on_change,
}: {
  rows: prep_input[];
  options: { id: string; label: string }[];
  materials: material[];
  on_change: (rows: prep_input[]) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <MenuSelect
            value={r.materialId}
            options={options}
            placeholder="позиция склада"
            on_change={(id) => on_change(rows.map((x, j) => (j === i ? { ...x, materialId: id } : x)))}
            className="min-w-0 flex-1"
            menu_className="w-72"
          />
          <div className="w-20 shrink-0">
            <NumInput
              value={r.qty}
              min={0}
              className={cell_input_class}
              on_change={(v) => on_change(rows.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
            />
          </div>
          <span className="w-6 text-xs text-neutral-500">{unit_of(materials, r.materialId)}</span>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
            onClick={() => on_change(rows.filter((_, j) => j !== i))}
            aria-label="убрать"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs font-medium text-accent hover:underline"
        onClick={() => on_change([...rows, { materialId: '', qty: 0 }])}
      >
        + сырьё
      </button>
    </div>
  );
}

const EMPTY_MARINADE: prep_marinade = { enabled: true, label: 'маринад', inputs: [], waterMl: 0, addG: 0 };

export default function PrepRecipeDialog({ station, materials, on_close, on_save }: props) {
  const [draft, set_draft] = useState<prep_station>(() => ({
    ...station,
    extraInputs: station.extraInputs.map((i) => ({ ...i })),
    marinade: station.marinade ? { ...station.marinade, inputs: station.marinade.inputs.map((i) => ({ ...i })) } : null,
  }));
  const patch = (p: Partial<prep_station>) => set_draft((d) => ({ ...d, ...p }));
  const patch_marinade = (p: Partial<prep_marinade>) =>
    set_draft((d) => ({ ...d, marinade: { ...(d.marinade ?? EMPTY_MARINADE), ...p } }));

  const cooked = materials.find((m) => m.id === draft.cookedMaterialId);
  const cooked_unit = cooked ? base_unit_label(cooked.unit) : 'г';
  const options = useMemo(
    () =>
      materials
        .filter((m) => m.id !== draft.cookedMaterialId && !material_is_infinite(m))
        .map((m) => ({ id: m.id, label: m.name || m.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [materials, draft.cookedMaterialId]
  );

  const clean = (rows: prep_input[]) => rows.filter((r) => r.materialId && r.qty > 0);
  const base_plan = prep_plan_for({ ...draft, marinade: null }, draft.defaultDryG, 0);
  const base_cost = prep_plan_cost(base_plan, materials);
  const marinade_cost = draft.marinade
    ? prep_plan_cost(
        { cookedG: 0, waterMl: 0, lines: draft.marinade.inputs.map((i) => ({ ...i, part: 'marinade' as const })) },
        materials
      ).total
    : 0;

  const can_save = Boolean(draft.dryMaterialId) && draft.defaultDryG > 0 && draft.defaultCookedG > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={on_close}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-neutral-900">обработка · {cooked?.name || draft.label}</h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          из чего и сколько получается. касса списывает сырьё по этой норме, готовое падает в {draft.kind === 'pot' ? 'кастрюлю' : 'термобочку'}.
        </p>

        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-neutral-500">
              название на кассе
              <input className={`${field_class} mt-1`} value={draft.label} onChange={(e) => patch({ label: e.target.value })} />
            </label>
            <div className="text-xs text-neutral-500">
              посуда
              <div className="mt-1 flex gap-1.5">
                {(['pot', 'teapot'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => patch({ kind: k })}
                    className={`flex-1 rounded-2xl border px-2 py-2 text-sm ${
                      draft.kind === k ? 'border-accent bg-accent/10 text-neutral-900' : 'border-neutral-200 text-neutral-600'
                    }`}
                  >
                    {k === 'pot' ? 'кастрюля' : 'термобочка'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">берём</p>
            <div className="mt-2 flex items-center gap-2">
              <MenuSelect
                value={draft.dryMaterialId}
                options={options}
                placeholder="основное сырьё"
                on_change={(id) => patch({ dryMaterialId: id })}
                className="min-w-0 flex-1"
                menu_className="w-72"
              />
              <div className="w-20 shrink-0">
                <NumInput
                  value={draft.defaultDryG}
                  min={0}
                  className={cell_input_class}
                  on_change={(v) => patch({ defaultDryG: v })}
                />
              </div>
              <span className="w-6 text-xs text-neutral-500">{unit_of(materials, draft.dryMaterialId)}</span>
              <span className="w-7" />
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">кассир вводит только это количество — остальное считается пропорционально</p>
            <div className="mt-2">
              <InputsEditor
                rows={draft.extraInputs}
                options={options}
                materials={materials}
                on_change={(rows) => patch({ extraInputs: rows })}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-xs text-neutral-500">
                вода, мл
                <NumInput value={draft.waterMl} min={0} className={`${field_class} mt-1 text-right`} on_change={(v) => patch({ waterMl: v })} />
              </label>
              <label className="text-xs text-neutral-500">
                получается, {cooked_unit}
                <NumInput
                  value={draft.defaultCookedG}
                  min={0}
                  className={`${field_class} mt-1 text-right`}
                  on_change={(v) => patch({ defaultCookedG: v })}
                />
              </label>
              <label className="text-xs text-neutral-500">
                на стакан, {cooked_unit}
                <NumInput value={draft.portionG} min={1} className={`${field_class} mt-1 text-right`} on_change={(v) => patch({ portionG: v })} />
              </label>
            </div>
            <p className="mt-2 text-xs text-neutral-600">
              себестоимость по текущим ценам: {format_rub(base_cost.total, 2)} за партию ·{' '}
              <b>{format_rub(base_cost.perKg, 2)}</b>/{cooked_unit === 'мл' ? 'л' : 'кг'} готового
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={Boolean(draft.marinade?.enabled)}
                onChange={(e) =>
                  e.target.checked ? patch_marinade({ enabled: true }) : patch_marinade({ enabled: false })
                }
              />
              заливка после варки (маринад)
            </label>
            {draft.marinade?.enabled ? (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-neutral-400">раскладка на объём воды ниже; кассир вводит, сколько мл залил — сырьё спишется пропорционально</p>
                <InputsEditor
                  rows={draft.marinade.inputs}
                  options={options}
                  materials={materials}
                  on_change={(rows) => patch_marinade({ inputs: rows })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-neutral-500">
                    вода, мл
                    <NumInput
                      value={draft.marinade.waterMl}
                      min={0}
                      className={`${field_class} mt-1 text-right`}
                      on_change={(v) => patch_marinade({ waterMl: v })}
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    прибавка к весу, {cooked_unit}
                    <NumInput
                      value={draft.marinade.addG}
                      min={0}
                      className={`${field_class} mt-1 text-right`}
                      on_change={(v) => patch_marinade({ addG: v })}
                    />
                  </label>
                </div>
                <p className="text-xs text-neutral-600">маринад: {format_rub(marinade_cost, 2)} за {draft.marinade.waterMl} мл</p>
              </div>
            ) : null}
          </div>
        </div>

        {!can_save ? (
          <p className="mt-3 text-xs text-amber-600">заполни основное сырьё, сколько берём и сколько получается</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={btn_secondary} onClick={on_close}>
            отмена
          </button>
          <button
            type="button"
            className={btn_primary}
            disabled={!can_save}
            onClick={() =>
              on_save({
                ...draft,
                extraInputs: clean(draft.extraInputs),
                marinade: draft.marinade ? { ...draft.marinade, inputs: clean(draft.marinade.inputs) } : null,
              })
            }
          >
            сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
