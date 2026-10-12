/**
 * Варка тапиоки / заваривание чая:
 * сухой склад → готовая порция (то, что в техкартах).
 * Коэффициенты и цены заполняет кассир/админ вручную.
 */

import {
  actor_on_movement,
  base_unit_label,
  cost_per_base_unit,
  fifo_consume_cost,
  material_is_infinite,
  new_id,
  push_stock_audit,
  stock_qty_map,
  type finance_state,
  type material,
  type stock_actor,
  type stock_movement,
} from '@/lib/finance/model';

export type prep_station_kind = 'pot' | 'teapot';

/** ингредиент обработки: qty в базовых единицах (г / мл / шт) */
export type prep_input = { materialId: string; qty: number };

/** заливка после варки (маринад в тапиоку) — на одну кастрюлю */
export type prep_marinade = {
  enabled: boolean;
  label: string;
  inputs: prep_input[];
  /** вода, мл — со склада не списывается */
  waterMl: number;
  /** на сколько г прибавится вес готового в кастрюле */
  addG: number;
};

export type prep_station = {
  id: string;
  label: string;
  kind: prep_station_kind;
  /** закупка / сухой остаток */
  dryMaterialId: string;
  /** то, что списывается по техкарте */
  cookedMaterialId: string;
  /** последние/дефолтные значения формы «сварить» — г */
  defaultDryG: number;
  defaultCookedG: number;
  /** г на стакан для оценки «хватит на N» — правит сам */
  portionG: number;
  /** другое сырьё на defaultDryG основного — списывается пропорционально */
  extraInputs: prep_input[];
  /** вода на defaultDryG основного, мл — справочно, со склада не списывается */
  waterMl: number;
  marinade: prep_marinade | null;
  /** сколько сварили за последний раз (г) — это и есть 100% шкалы */
  batchFullG: number;
  /** сварили, маринад ещё не залили */
  marinadePending: boolean;
  enabled: boolean;
};

export type prep_station_view = prep_station & {
  dryName: string;
  cookedName: string;
  dryQty: number;
  cookedQty: number;
  cupsLeft: number;
  dryCostPerKg: number;
  cookedCostPerKg: number;
  /** имена и единицы всех позиций станции (основное, доп., маринад) */
  names: Record<string, { name: string; unit: string }>;
};

/** сухие позиции для закупки; готовые — уже в техкартах */
export const PREP_DRY_MATERIALS: material[] = [
  {
    id: 'tapioca_dry',
    name: 'тапиока сухая',
    category: 'toppings',
    unit: 'kg',
    costPerUnit: 400,
    minStock: 2000,
  },
  {
    id: 'tea_black_dry',
    name: 'чай чёрный (сухой лист)',
    category: 'dry',
    unit: 'kg',
    costPerUnit: 1500,
    minStock: 400,
  },
  {
    id: 'tea_jasmine_dry',
    name: 'чай жасмин (сухой лист)',
    category: 'dry',
    unit: 'kg',
    costPerUnit: 1600,
    minStock: 400,
  },
];

/** прочее сырьё для обработки (маринад) */
export const PREP_EXTRA_MATERIALS: material[] = [
  {
    id: 'cane_sugar_cube',
    name: 'сахар тростниковый (кубики)',
    category: 'dry',
    unit: 'pcs',
    costPerUnit: 2,
  },
];

export const DEFAULT_TAPIOCA_MARINADE: prep_marinade = {
  enabled: true,
  label: 'маринад',
  inputs: [
    { materialId: 'cane_sugar_cube', qty: 5 },
    { materialId: 'syrup_brown_sugar', qty: 40 },
  ],
  waterMl: 500,
  addG: 0,
};

/** чай: 25 г сухого на 1 л воды, после процеживания чуть меньше литра */
const TEA_NORM = { defaultDryG: 25, waterMl: 1000, defaultCookedG: 950 };

export const DEFAULT_PREP_STATIONS: prep_station[] = [
  {
    id: 'tapioca',
    label: 'тапиока',
    kind: 'pot',
    dryMaterialId: 'tapioca_dry',
    cookedMaterialId: 'tapioca',
    defaultDryG: 200,
    defaultCookedG: 600,
    portionG: 50,
    batchFullG: 0,
    marinadePending: false,
    enabled: true,
    extraInputs: [],
    waterMl: 0,
    marinade: DEFAULT_TAPIOCA_MARINADE,
  },
  {
    id: 'tea_black',
    label: 'чай чёрный',
    kind: 'teapot',
    dryMaterialId: 'tea_black_dry',
    cookedMaterialId: 'tea_black',
    defaultDryG: TEA_NORM.defaultDryG,
    defaultCookedG: TEA_NORM.defaultCookedG,
    portionG: 150,
    batchFullG: 0,
    marinadePending: false,
    enabled: true,
    extraInputs: [],
    waterMl: TEA_NORM.waterMl,
    marinade: null,
  },
  {
    id: 'tea_jasmine',
    label: 'чай жасмин',
    kind: 'teapot',
    dryMaterialId: 'tea_jasmine_dry',
    cookedMaterialId: 'tea_jasmine',
    defaultDryG: TEA_NORM.defaultDryG,
    defaultCookedG: TEA_NORM.defaultCookedG,
    portionG: 150,
    batchFullG: 0,
    marinadePending: false,
    enabled: true,
    extraInputs: [],
    waterMl: TEA_NORM.waterMl,
    marinade: null,
  },
];

const COOKED_NAME_FIX: Record<string, string> = {
  tapioca: 'тапиока сваренная',
  tea_black: 'чай чёрный (заваренный)',
  tea_jasmine: 'чай зелёный жасмин (заваренный)',
};

function audit_actor(actor?: stock_actor | null) {
  return {
    actorId: actor?.id || 'unknown',
    actorName: actor?.name || 'неизвестно',
    actorRole: (actor?.role === 'seller' ? 'seller' : 'admin') as 'admin' | 'seller',
  };
}

function normalize_inputs(raw: unknown, fallback: prep_input[]): prep_input[] {
  if (!Array.isArray(raw)) return fallback.map((i) => ({ ...i }));
  const out: prep_input[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Partial<prep_input>;
    const materialId = String(r.materialId || '').trim();
    const qty = Math.max(0, Math.round((Number(r.qty) || 0) * 100) / 100);
    if (materialId) out.push({ materialId, qty });
  }
  return out;
}

function normalize_marinade(raw: unknown, fallback: prep_marinade | null): prep_marinade | null {
  if (raw === undefined) return fallback ? { ...fallback, inputs: fallback.inputs.map((i) => ({ ...i })) } : null;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<prep_marinade>;
  return {
    enabled: r.enabled !== false,
    label: String(r.label || '').trim() || 'маринад',
    inputs: normalize_inputs(r.inputs, []),
    waterMl: Math.max(0, Math.round(Number(r.waterMl) || 0)),
    addG: Math.max(0, Math.round(Number(r.addG) || 0)),
  };
}

export function normalize_prep_stations(raw: unknown): prep_station[] {
  const by_id = new Map<string, prep_station>();
  for (const d of DEFAULT_PREP_STATIONS) by_id.set(d.id, { ...d });

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Partial<prep_station>;
      const id = String(r.id || '').trim();
      if (!id) continue;
      const base = by_id.get(id) ?? {
        id,
        label: id,
        kind: (r.kind === 'teapot' ? 'teapot' : 'pot') as prep_station_kind,
        dryMaterialId: '',
        cookedMaterialId: '',
        defaultDryG: 0,
        defaultCookedG: 0,
        portionG: 50,
        batchFullG: 0,
        marinadePending: false,
        enabled: true,
        extraInputs: [],
        waterMl: 0,
        marinade: null,
      };
      const marinade = normalize_marinade(
        'marinade' in r ? (r as { marinade?: unknown }).marinade : undefined,
        base.marinade
      );
      by_id.set(id, {
        ...base,
        label: String(r.label || base.label).trim() || base.label,
        kind: r.kind === 'teapot' || r.kind === 'pot' ? r.kind : base.kind,
        dryMaterialId: String(r.dryMaterialId || base.dryMaterialId).trim(),
        cookedMaterialId: String(r.cookedMaterialId || base.cookedMaterialId).trim(),
        defaultDryG: Math.max(0, Math.round(Number(r.defaultDryG) || base.defaultDryG)),
        defaultCookedG: Math.max(0, Math.round(Number(r.defaultCookedG) || base.defaultCookedG)),
        portionG: Math.max(1, Math.round(Number(r.portionG) || base.portionG)),
        batchFullG: Math.max(0, Math.round(Number(r.batchFullG) || base.batchFullG || 0)),
        enabled: r.enabled === false ? false : true,
        extraInputs: normalize_inputs(r.extraInputs, base.extraInputs),
        waterMl:
          r.waterMl != null ? Math.max(0, Math.round(Number(r.waterMl) || 0)) : base.waterMl,
        marinade,
        marinadePending: Boolean(r.marinadePending) && Boolean(marinade?.enabled),
      });
    }
  }

  return [...by_id.values()];
}

/** добавить сухие SKU, переименовать готовые, один раз перенести старый остаток на сухой */
export function ensure_prep_materials(state: finance_state): finance_state {
  let materials = [...state.materials];
  const have = new Set(materials.map((m) => m.id));
  let changed = false;

  for (const dry of [...PREP_DRY_MATERIALS, ...PREP_EXTRA_MATERIALS]) {
    if (have.has(dry.id)) continue;
    materials.push({ ...dry });
    have.add(dry.id);
    changed = true;
  }

  materials = materials.map((m) => {
    const next_name = COOKED_NAME_FIX[m.id];
    if (!next_name || m.name === next_name) return m;
    const legacy =
      m.name === 'тапиока' ||
      m.name === 'чай чёрный (сухой)' ||
      m.name === 'чай зелёный жасмин (сухой)' ||
      (/сухой/.test(m.name) && (m.id === 'tea_black' || m.id === 'tea_jasmine'));
    if (!legacy) return m;
    changed = true;
    return { ...m, name: next_name };
  });

  let stockMovements = state.stockMovements;
  const migrated = Boolean(
    (state as finance_state & { prepStockMigrated?: boolean }).prepStockMigrated
  );
  let prepStockMigrated = migrated;

  if (!migrated) {
    const qty = stock_qty_map({ ...state, materials });
    const date = new Date().toISOString();
    const added: stock_movement[] = [];

    const transfers: { cooked: string; dry: string }[] = [
      { cooked: 'tapioca', dry: 'tapioca_dry' },
      { cooked: 'tea_black', dry: 'tea_black_dry' },
      { cooked: 'tea_jasmine', dry: 'tea_jasmine_dry' },
    ];

    for (const t of transfers) {
      const cooked_on_hand = Math.max(0, qty.get(t.cooked) ?? 0);
      const dry_on_hand = Math.max(0, qty.get(t.dry) ?? 0);
      // если сухой уже крутили — миграцию для пары пропускаем
      if (dry_on_hand > 0) continue;
      if (cooked_on_hand <= 0) continue;
      // старый остаток считаем сухим закупленным, готовое обнуляем
      added.push({
        id: new_id('mv'),
        date,
        type: 'adjust',
        materialId: t.cooked,
        qty: 0,
        note: 'миграция: остаток → сухой склад (варка)',
      });
      added.push({
        id: new_id('mv'),
        date,
        type: 'adjust',
        materialId: t.dry,
        qty: cooked_on_hand,
        note: 'миграция: бывший остаток как сухой',
      });
    }

    if (added.length) {
      stockMovements = [...stockMovements, ...added];
      changed = true;
    }
    prepStockMigrated = true;
    changed = true;
  }

  let prepStations = normalize_prep_stations(
    (state as finance_state & { prepStations?: unknown }).prepStations
  );

  // один раз: норма чая 25 г на 1 л воды → ~950 г готового
  const prepRecipeV2 = true;
  if (!state.prepRecipeV2) {
    prepStations = prepStations.map((s) =>
      s.id === 'tea_black' || s.id === 'tea_jasmine' ? { ...s, ...TEA_NORM } : s
    );
    changed = true;
  }

  if (!changed && state.prepStations && state.prepStations.length === prepStations.length) {
    return state;
  }

  return {
    ...state,
    materials,
    stockMovements,
    prepStations,
    prepStockMigrated,
    prepRecipeV2,
  };
}

export function prep_station_views(state: finance_state): prep_station_view[] {
  const healed = heal_prep_batch_scales(state);
  const qty = stock_qty_map(healed);
  const mats = new Map(healed.materials.map((m) => [m.id, m]));
  const stations = normalize_prep_stations(healed.prepStations);

  return stations
    .filter((s) => s.enabled && s.dryMaterialId && s.cookedMaterialId)
    .map((s) => {
      const dry = mats.get(s.dryMaterialId);
      const cooked = mats.get(s.cookedMaterialId);
      const dryQty = qty.get(s.dryMaterialId) ?? 0;
      const cookedQty = Math.max(0, qty.get(s.cookedMaterialId) ?? 0);
      const portion = Math.max(1, s.portionG);
      const names: prep_station_view['names'] = {};
      for (const id of station_material_ids(s)) {
        const m = mats.get(id);
        names[id] = { name: m?.name || id, unit: m ? base_unit_label(m.unit) : 'г' };
      }
      return {
        ...s,
        dryName: dry?.name || s.dryMaterialId,
        cookedName: cooked?.name || s.cookedMaterialId,
        dryQty,
        cookedQty,
        cupsLeft: Math.floor(cookedQty / portion),
        dryCostPerKg: dry
          ? Math.round((dry.unit === 'g' ? dry.costPerUnit * 1000 : dry.costPerUnit) * 100) / 100
          : 0,
        cookedCostPerKg: cooked
          ? Math.round((cooked.unit === 'g' ? cooked.costPerUnit * 1000 : cooked.costPerUnit) * 100) / 100
          : 0,
        names,
      };
    });
}

function station_material_ids(s: prep_station): string[] {
  const ids = [s.dryMaterialId, s.cookedMaterialId, ...s.extraInputs.map((i) => i.materialId)];
  if (s.marinade) ids.push(...s.marinade.inputs.map((i) => i.materialId));
  return [...new Set(ids.filter(Boolean))];
}

export type prep_plan_line = { materialId: string; qty: number; part: 'main' | 'extra' | 'marinade' };

export type prep_plan = {
  cookedG: number;
  lines: prep_plan_line[];
  waterMl: number;
};

/** что спишется и сколько получится: основное → пропорционально доп. сырьё и вода, маринад — на кастрюлю */
export function prep_plan_for(station: prep_station, dryG: number, marinadeCount = 0): prep_plan {
  const dry = Math.max(0, Math.round(Number(dryG) || 0));
  const scale = station.defaultDryG > 0 ? dry / station.defaultDryG : 0;
  const lines: prep_plan_line[] = [];
  if (dry > 0) lines.push({ materialId: station.dryMaterialId, qty: dry, part: 'main' });
  for (const i of station.extraInputs) {
    const qty = Math.round(i.qty * scale * 100) / 100;
    if (qty > 0) lines.push({ materialId: i.materialId, qty, part: 'extra' });
  }
  let waterMl = Math.round(station.waterMl * scale);
  let cookedG = cooked_from_dry(station, dry);
  const m = station.marinade;
  const times = m && m.enabled ? Math.max(0, Math.round(Number(marinadeCount) || 0)) : 0;
  if (m && times > 0 && cookedG > 0) {
    for (const i of m.inputs) {
      const qty = Math.round(i.qty * times * 100) / 100;
      if (qty > 0) lines.push({ materialId: i.materialId, qty, part: 'marinade' });
    }
    waterMl += m.waterMl * times;
    cookedG += m.addG * times;
  }
  return { cookedG, lines, waterMl };
}

export function cups_text(cups: number): string {
  const n = Math.max(0, Math.floor(cups));
  const d = n % 10;
  const h = n % 100;
  const word = d === 1 && h !== 11 ? 'стакан' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'стакана' : 'стаканов';
  return `~${n} ${word}`;
}

/** маринад на ml мл воды: раскладка задана на marinade.waterMl (например 500 мл) */
export function prep_marinade_plan(station: prep_station, ml: number): prep_plan {
  const m = station.marinade;
  const water = Math.max(0, Math.round(Number(ml) || 0));
  if (!m || !m.enabled || water <= 0) return { cookedG: 0, lines: [], waterMl: 0 };
  const scale = m.waterMl > 0 ? water / m.waterMl : 1;
  const lines: prep_plan_line[] = [];
  for (const i of m.inputs) {
    const qty = Math.round(i.qty * scale * 100) / 100;
    if (qty > 0) lines.push({ materialId: i.materialId, qty, part: 'marinade' });
  }
  return { cookedG: Math.round(m.addG * scale), lines, waterMl: water };
}

/** себестоимость по текущим ценам склада: ₽ за партию и ₽ за кг/л готового */
export function prep_plan_cost(plan: prep_plan, materials: material[]) {
  const mats = new Map(materials.map((m) => [m.id, m]));
  let total = 0;
  for (const l of plan.lines) {
    const m = mats.get(l.materialId);
    if (!m || material_is_infinite(m)) continue;
    total += l.qty * cost_per_base_unit(m);
  }
  return {
    total: Math.round(total * 100) / 100,
    perKg: plan.cookedG > 0 ? Math.round((total / plan.cookedG) * 1000 * 100) / 100 : 0,
  };
}

/** галочка «обработка» на позиции склада: позиция получается из другого сырья */
export function material_processing(state: finance_state, materialId: string): prep_station | null {
  return (
    normalize_prep_stations(state.prepStations).find(
      (s) => s.cookedMaterialId === materialId && s.enabled
    ) ?? null
  );
}

export function set_material_processing(
  state: finance_state,
  materialId: string,
  on: boolean
): finance_state {
  const stations = normalize_prep_stations(state.prepStations);
  const found = stations.find((s) => s.cookedMaterialId === materialId);
  if (found) {
    return {
      ...state,
      prepStations: stations.map((s) => (s === found ? { ...s, enabled: on } : s)),
    };
  }
  if (!on) return state;
  const mat = state.materials.find((m) => m.id === materialId);
  const fresh: prep_station = {
    id: materialId,
    label: mat?.name || materialId,
    kind: 'pot',
    dryMaterialId: '',
    cookedMaterialId: materialId,
    defaultDryG: 0,
    defaultCookedG: 0,
    portionG: 50,
    batchFullG: 0,
    marinadePending: false,
    enabled: true,
    extraInputs: [],
    waterMl: 0,
    marinade: null,
  };
  return { ...state, prepStations: [...stations, fresh] };
}

export function save_prep_station(state: finance_state, station: prep_station): finance_state {
  const stations = normalize_prep_stations(state.prepStations);
  const next = normalize_prep_stations([station]).find((s) => s.id === station.id)!;
  const keep = stations.find((s) => s.id === station.id);
  const merged = {
    ...next,
    batchFullG: keep?.batchFullG ?? next.batchFullG,
    marinadePending: Boolean(keep?.marinadePending && next.marinade?.enabled),
  };
  return {
    ...state,
    prepStations: keep
      ? stations.map((s) => (s.id === station.id ? merged : s))
      : [...stations, merged],
  };
}

/** выход готового из сухого по норме станции (г → г) */
export function cooked_from_dry(station: prep_station, dryG: number): number {
  const dry = Math.max(0, Math.round(Number(dryG) || 0));
  const base_dry = Math.max(0, station.defaultDryG);
  const base_cooked = Math.max(0, station.defaultCookedG);
  if (dry <= 0 || base_dry <= 0 || base_cooked <= 0) return 0;
  return Math.max(1, Math.round((dry * base_cooked) / base_dry));
}

/** мало / пусто — пора варить снова (только если уже была партия) */
export type prep_alert_level = 'ok' | 'low' | 'empty';

export function prep_station_alert(
  station: Pick<prep_station, 'batchFullG'> & { cookedQty: number }
): prep_alert_level {
  if (station.batchFullG <= 0 && station.cookedQty <= 0) return 'ok';
  if (station.cookedQty <= 0) return 'empty';
  const fill = pot_fill_ratio(station, station.cookedQty);
  if (fill <= 0.25) return 'low';
  return 'ok';
}

/**
 * уровень кастрюли 0–1.
 * 100% = сколько сварили за последний раз (batchFullG).
 * пусто = 0; есть остаток, но партии ещё нет в записи — считаем полной кастрюлей.
 */
export function pot_fill_ratio(station: Pick<prep_station, 'batchFullG'>, cookedQty: number): number {
  const qty = Math.max(0, cookedQty);
  if (qty <= 0) return 0;
  const full = Math.max(0, Math.round(station.batchFullG || 0));
  if (full > 0) return Math.min(1, qty / full);
  return 1;
}

/** если остаток есть, а партия не записана — зафиксировать текущий остаток как 100% */
export function heal_prep_batch_scales(state: finance_state): finance_state {
  const qty = stock_qty_map(state);
  let changed = false;
  const stations = normalize_prep_stations(state.prepStations).map((s) => {
    const cooked = Math.max(0, Math.round(qty.get(s.cookedMaterialId) ?? 0));
    if (s.batchFullG <= 0 && cooked > 0) {
      changed = true;
      return { ...s, batchFullG: cooked };
    }
    return s;
  });
  if (!changed) return state;
  return { ...state, prepStations: stations };
}

/** сварить / заварить: кассир вводит только сухой расход; выход и себестоимость — из норм склада */
export function apply_prep_cook(
  state: finance_state,
  input: {
    stationId: string;
    dryG: number;
    note?: string;
    actor?: stock_actor | null;
    date?: string;
  }
): { ok: true; state: finance_state } | { ok: false; error: string } {
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station || !station.enabled) {
    return { ok: false, error: 'станция не найдена' };
  }

  const dryG = Math.round(Number(input.dryG));
  if (!Number.isFinite(dryG) || dryG <= 0) {
    return { ok: false, error: 'укажите сколько сухого положили (г)' };
  }
  if (station.defaultDryG <= 0 || station.defaultCookedG <= 0) {
    return {
      ok: false,
      error: 'на складе не задана норма выхода — заполните «сухой → готовый» во вкладке склад',
    };
  }

  const plan = prep_plan_for(station, dryG, 0);
  const cookedG = plan.cookedG;
  if (cookedG <= 0) {
    return { ok: false, error: 'не удалось посчитать выход — проверьте норму на складе' };
  }

  const mats = new Map(state.materials.map((m) => [m.id, m]));
  const dry = mats.get(station.dryMaterialId);
  const cooked = mats.get(station.cookedMaterialId);
  if (!dry || !cooked) {
    return { ok: false, error: 'нет позиций склада для этой станции' };
  }
  const missing = plan.lines.find((l) => !mats.has(l.materialId));
  if (missing) {
    return { ok: false, error: `на складе нет позиции «${missing.materialId}» из нормы — поправьте норму` };
  }

  const cooked_before = stock_qty_map(state).get(cooked.id) ?? 0;
  if (cooked_before > 0) {
    return {
      ok: false,
      error: `в ${station.kind === 'pot' ? 'кастрюле' : 'термобочке'} ещё есть остаток — сначала спишите его`,
    };
  }

  const date = input.date || new Date().toISOString();
  const note = input.note?.trim() || `${station.kind === 'pot' ? 'варка' : 'заваривание'}: ${station.label}`;

  const consume = new Map<string, number>();
  for (const l of plan.lines) {
    const m = mats.get(l.materialId)!;
    if (material_is_infinite(m) || m.id === cooked.id) continue;
    consume.set(m.id, (consume.get(m.id) ?? 0) + l.qty);
  }

  const out_mvs: stock_movement[] = [];
  // продажи при пустой кастрюле увели готовое в минус — новая партия начинается с нуля
  if (cooked_before < 0) {
    out_mvs.push({
      id: new_id('mv'),
      date,
      type: 'adjust',
      materialId: cooked.id,
      qty: 0,
      note: `служебный: минус готового обнулён перед новой партией (${station.label})`,
      ...actor_on_movement(input.actor),
    });
  }
  let cost_total = 0;
  for (const [materialId, qty] of consume) {
    const cost = fifo_consume_cost(state, materialId, qty);
    cost_total += cost;
    out_mvs.push({
      id: new_id('mv'),
      date,
      type: 'out',
      materialId,
      qty,
      total: cost,
      note,
      ...actor_on_movement(input.actor),
    });
  }
  cost_total = Math.round(cost_total * 100) / 100;

  const cooked_cost_per_base = cookedG > 0 ? cost_total / cookedG : 0;
  const cooked_unit_price =
    cooked.unit === 'kg' || cooked.unit === 'L' ? cooked_cost_per_base * 1000 : cooked_cost_per_base;

  const next_materials = state.materials.map((m) =>
    m.id === cooked.id ? { ...m, costPerUnit: Math.round(cooked_unit_price * 100) / 100 } : m
  );

  const in_mv: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'in',
    materialId: cooked.id,
    qty: cookedG,
    total: cost_total,
    note,
    ...actor_on_movement(input.actor),
  };

  const next_stations = stations.map((s) =>
    s.id === station.id
      ? { ...s, batchFullG: cookedG, marinadePending: Boolean(s.marinade?.enabled) }
      : s
  );

  let next: finance_state = {
    ...state,
    materials: next_materials,
    prepStations: next_stations,
    stockMovements: [...state.stockMovements, ...out_mvs, in_mv],
  };

  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'prep',
      materialId: cooked.id,
      materialName: cooked.name,
      qtyBefore: cooked_before,
      qtyAfter: cookedG,
      note: `${note} · −${dryG} г сухого → ${cookedG} г (=100%)`,
      movementId: in_mv.id,
    },
  ]);

  return { ok: true, state: next };
}

/** залить маринад в сваренную партию: сырьё списывается пропорционально мл */
export function apply_prep_marinade(
  state: finance_state,
  input: { stationId: string; ml: number; actor?: stock_actor | null; date?: string }
): { ok: true; state: finance_state } | { ok: false; error: string } {
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station || !station.marinade?.enabled) return { ok: false, error: 'у станции нет маринада' };
  const ml = Math.round(Number(input.ml));
  if (!Number.isFinite(ml) || ml <= 0) return { ok: false, error: 'укажите сколько мл маринада залили' };
  const cooked_qty = stock_qty_map(state).get(station.cookedMaterialId) ?? 0;
  if (cooked_qty <= 0) return { ok: false, error: 'кастрюля пустая — сначала сварите' };

  const plan = prep_marinade_plan(station, ml);
  const mats = new Map(state.materials.map((m) => [m.id, m]));
  const missing = plan.lines.find((l) => !mats.has(l.materialId));
  if (missing) {
    return { ok: false, error: `на складе нет позиции «${missing.materialId}» из маринада — поправьте норму` };
  }
  const date = input.date || new Date().toISOString();
  // если маринад прибавляет вес — это переработка в готовое, иначе обычный расход
  const adds = plan.cookedG > 0;
  const label = station.marinade.label;
  const note = adds ? `маринад: ${station.label}` : `${label} (${ml} мл): ${station.label}`;

  const mvs: stock_movement[] = [];
  let cost_total = 0;
  for (const l of plan.lines) {
    const m = mats.get(l.materialId)!;
    if (material_is_infinite(m)) continue;
    const cost = fifo_consume_cost(state, m.id, l.qty);
    cost_total += cost;
    mvs.push({
      id: new_id('mv'),
      date,
      type: 'out',
      materialId: m.id,
      qty: l.qty,
      total: cost,
      note,
      ...actor_on_movement(input.actor),
    });
  }
  if (adds) {
    mvs.push({
      id: new_id('mv'),
      date,
      type: 'in',
      materialId: station.cookedMaterialId,
      qty: plan.cookedG,
      total: Math.round(cost_total * 100) / 100,
      note,
      ...actor_on_movement(input.actor),
    });
  }
  const next_stations = stations.map((s) =>
    s.id === station.id
      ? { ...s, marinadePending: false, batchFullG: adds ? Math.round(cooked_qty + plan.cookedG) : s.batchFullG }
      : s
  );
  return {
    ok: true,
    state: { ...state, prepStations: next_stations, stockMovements: [...state.stockMovements, ...mvs] },
  };
}

/** списать весь готовый остаток станции (конец смены / выбросить) */
export function apply_prep_discard(
  state: finance_state,
  input: {
    stationId: string;
    note?: string;
    actor?: stock_actor | null;
    date?: string;
  }
): { ok: true; state: finance_state } | { ok: false; error: string } {
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station) return { ok: false, error: 'станция не найдена' };

  const cooked = state.materials.find((m) => m.id === station.cookedMaterialId);
  if (!cooked) return { ok: false, error: 'нет готовой позиции' };

  const qty = Math.max(0, stock_qty_map(state).get(cooked.id) ?? 0);
  if (qty <= 0) return { ok: false, error: 'нечего списывать — кастрюля пустая' };

  const date = input.date || new Date().toISOString();
  const note = input.note?.trim() || `списание остатка: ${station.label}`;
  const before = qty;
  const movement: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'writeoff',
    materialId: cooked.id,
    qty,
    total: fifo_consume_cost(state, cooked.id, qty),
    note,
    ...actor_on_movement(input.actor),
  };

  const next_stations = stations.map((s) =>
    s.id === station.id ? { ...s, batchFullG: 0, marinadePending: false } : s
  );

  let next: finance_state = {
    ...state,
    prepStations: next_stations,
    stockMovements: [...state.stockMovements, movement],
  };
  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'writeoff',
      materialId: cooked.id,
      materialName: cooked.name,
      qtyBefore: before,
      qtyAfter: 0,
      note,
      movementId: movement.id,
    },
  ]);
  return { ok: true, state: next };
}

export function update_prep_station(
  state: finance_state,
  stationId: string,
  patch: Partial<Pick<prep_station, 'label' | 'defaultDryG' | 'defaultCookedG' | 'portionG' | 'enabled' | 'dryMaterialId' | 'cookedMaterialId'>>
): finance_state {
  const stations = normalize_prep_stations(state.prepStations).map((s) => {
    if (s.id !== stationId) return s;
    return {
      ...s,
      ...(patch.label != null ? { label: String(patch.label).trim() || s.label } : {}),
      ...(patch.defaultDryG != null ? { defaultDryG: Math.max(0, Math.round(Number(patch.defaultDryG) || 0)) } : {}),
      ...(patch.defaultCookedG != null
        ? { defaultCookedG: Math.max(0, Math.round(Number(patch.defaultCookedG) || 0)) }
        : {}),
      ...(patch.portionG != null ? { portionG: Math.max(1, Math.round(Number(patch.portionG) || 1)) } : {}),
      ...(patch.enabled != null ? { enabled: Boolean(patch.enabled) } : {}),
      ...(patch.dryMaterialId ? { dryMaterialId: String(patch.dryMaterialId) } : {}),
      ...(patch.cookedMaterialId ? { cookedMaterialId: String(patch.cookedMaterialId) } : {}),
    };
  });
  return { ...state, prepStations: stations };
}
