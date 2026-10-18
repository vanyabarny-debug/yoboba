/**
 * Варка тапиоки / заваривание чая:
 * сухой склад → готовая порция (то, что в техкартах).
 * Коэффициенты и цены заполняет кассир/админ вручную.
 */

import {
  actor_on_movement,
  base_unit_label,
  fifo_consume_cost,
  fifo_values_map,
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

/** сколько реально вышло варёного из сухого — копится сверками с кастрюлей */
export type prep_yield_sample = { dryG: number; cookedG: number };

/** варки после последней сверки: по ним понимаем, совпал ли выход */
export type prep_open_batch = { dryG: number; predictedG: number };

export type prep_input = { materialId: string; qty: number };

/** заливка после варки. вода со склада не списывается */
export type prep_marinade = {
  enabled: boolean;
  label: string;
  inputs: prep_input[];
  waterMl: number;
  /** на сколько г тяжелеет кастрюля. 0 — только вкус и себестоимость */
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
  /** стартовая норма, пока сверок мало — г */
  defaultDryG: number;
  defaultCookedG: number;
  /** запасной «г на стакан», если в рецептах позиции нет */
  portionG: number;
  /** сколько было в кастрюле сразу после последней варки — это 100% шкалы */
  batchFullG: number;
  /** последние сверки «сухое → сколько вышло на самом деле» */
  yieldSamples: prep_yield_sample[];
  openBatch: prep_open_batch | null;
  extraInputs: prep_input[];
  waterMl: number;
  marinade: prep_marinade | null;
  /** сварили, маринад ещё не залили */
  marinadePending: boolean;
  enabled: boolean;
};

export type prep_station_view = prep_station & {
  dryName: string;
  cookedName: string;
  /** может быть минусом — пачка в программе кончилась раньше, чем в жизни */
  dryQty: number;
  cookedQty: number;
  /** по типичному рецепту */
  cupsLeft: number;
  /** меньше всего стаканов, если лить самые «тяжёлые» рецепты */
  cupsMin: number;
  /** больше всего, если лить самые лёгкие */
  cupsMax: number;
  cupsLabel: string;
  portionMinG: number;
  portionMaxG: number;
  portionTypicalG: number;
  /** сколько варёного выходит из 100 г сухого по текущей оценке */
  yieldPer100: number;
  yieldSamplesCount: number;
  yieldFromExperience: boolean;
  marinadeHint: string | null;
  dryCostPerKg: number;
  cookedCostPerKg: number;
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
    { materialId: 'cane_sugar_cube', qty: 4 },
    { materialId: 'syrup_brown_sugar', qty: 40 },
  ],
  waterMl: 500,
  addG: 0,
};

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
    yieldSamples: [],
    openBatch: null,
    extraInputs: [],
    waterMl: 0,
    marinade: DEFAULT_TAPIOCA_MARINADE,
    marinadePending: false,
    enabled: true,
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
    yieldSamples: [],
    openBatch: null,
    extraInputs: [],
    waterMl: TEA_NORM.waterMl,
    marinade: null,
    marinadePending: false,
    enabled: true,
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
    yieldSamples: [],
    openBatch: null,
    extraInputs: [],
    waterMl: TEA_NORM.waterMl,
    marinade: null,
    marinadePending: false,
    enabled: true,
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
    if (materialId && qty > 0) out.push({ materialId, qty });
  }
  return out;
}

function normalize_marinade(raw: unknown, fallback: prep_marinade | null): prep_marinade | null {
  if (raw === undefined) {
    return fallback
      ? { ...fallback, inputs: fallback.inputs.map((i) => ({ ...i })) }
      : null;
  }
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

function normalize_samples(raw: unknown): prep_yield_sample[] {
  if (!Array.isArray(raw)) return [];
  const out: prep_yield_sample[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Partial<prep_yield_sample>;
    const dryG = Math.max(0, Math.round(Number(r.dryG) || 0));
    const cookedG = Math.max(0, Math.round(Number(r.cookedG) || 0));
    if (dryG > 0 && cookedG > 0) out.push({ dryG, cookedG });
  }
  return out.slice(-12);
}

function normalize_open_batch(raw: unknown): prep_open_batch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<prep_open_batch>;
  const dryG = Math.max(0, Math.round(Number(r.dryG) || 0));
  const predictedG = Math.max(0, Math.round(Number(r.predictedG) || 0));
  if (dryG <= 0 || predictedG <= 0) return null;
  return { dryG, predictedG };
}

function blank_station(id: string, kind: prep_station_kind): prep_station {
  return {
    id,
    label: id,
    kind,
    dryMaterialId: '',
    cookedMaterialId: '',
    defaultDryG: 0,
    defaultCookedG: 0,
    portionG: 50,
    batchFullG: 0,
    yieldSamples: [],
    openBatch: null,
    extraInputs: [],
    waterMl: 0,
    marinade: null,
    marinadePending: false,
    enabled: true,
  };
}

export function normalize_prep_stations(raw: unknown): prep_station[] {
  const by_id = new Map<string, prep_station>();
  for (const d of DEFAULT_PREP_STATIONS) {
    by_id.set(d.id, {
      ...d,
      yieldSamples: d.yieldSamples.map((s) => ({ ...s })),
      extraInputs: d.extraInputs.map((i) => ({ ...i })),
      marinade: d.marinade
        ? { ...d.marinade, inputs: d.marinade.inputs.map((i) => ({ ...i })) }
        : null,
      openBatch: d.openBatch ? { ...d.openBatch } : null,
    });
  }

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Partial<prep_station> & { marinade?: unknown };
      const id = String(r.id || '').trim();
      if (!id) continue;
      const base =
        by_id.get(id) ??
        blank_station(id, r.kind === 'teapot' ? 'teapot' : 'pot');
      const marinade = normalize_marinade('marinade' in r ? r.marinade : undefined, base.marinade);
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
        yieldSamples: normalize_samples(r.yieldSamples),
        openBatch: normalize_open_batch(r.openBatch),
        extraInputs: normalize_inputs(r.extraInputs, base.extraInputs),
        waterMl: r.waterMl != null ? Math.max(0, Math.round(Number(r.waterMl) || 0)) : base.waterMl,
        marinade,
        marinadePending: Boolean(r.marinadePending) && Boolean(marinade?.enabled),
        enabled: r.enabled === false ? false : true,
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

  const prepStations = normalize_prep_stations(
    (state as finance_state & { prepStations?: unknown }).prepStations
  );

  if (!changed && state.prepStations && state.prepStations.length === prepStations.length) {
    return state;
  }

  return {
    ...state,
    materials,
    stockMovements,
    prepStations,
    prepStockMigrated,
  };
}

const YIELD_KEEP = 12;

/** стартовая норма + сверки. чем больше сваренного сухого, тем сильнее опыт */
export function yield_ratio(station: Pick<prep_station, 'defaultDryG' | 'defaultCookedG' | 'yieldSamples'>): {
  cookedPerDry: number;
  samples: number;
  fromExperience: boolean;
} {
  const manual =
    station.defaultDryG > 0 && station.defaultCookedG > 0
      ? station.defaultCookedG / station.defaultDryG
      : 0;
  const dry = station.yieldSamples.reduce((sum, sample) => sum + sample.dryG, 0);
  const cooked = station.yieldSamples.reduce((sum, sample) => sum + sample.cookedG, 0);
  if (dry <= 0 || cooked <= 0 || manual <= 0) {
    return { cookedPerDry: manual, samples: station.yieldSamples.length, fromExperience: false };
  }
  const learned = cooked / dry;
  const weight = dry / Math.max(1, station.defaultDryG);
  const blended = (manual + learned * weight) / (1 + weight);
  return {
    cookedPerDry: blended,
    samples: station.yieldSamples.length,
    fromExperience: true,
  };
}

export function cups_label(min: number, max: number): string {
  const lo = Math.max(0, Math.floor(min));
  const hi = Math.max(lo, Math.floor(max));
  if (hi <= 0) return '≈0 ст';
  if (lo === hi) return `≈${lo} ст`;
  return `≈${lo}–${hi} ст`;
}

/** граммы на стакан из техкарт. крошечные хвосты старой нормы (7 г вместо заварки) не тащим */
export function portion_bounds(
  state: finance_state,
  materialId: string,
  fallbackG: number
): { minG: number; maxG: number; typicalG: number } {
  const found: number[] = [];
  for (const card of state.techCards) {
    for (const size of Object.values(card.sizes)) {
      const qty = size?.ingredients?.[materialId];
      if (qty != null && qty > 0) found.push(qty);
    }
  }
  const fallback = Math.max(1, Math.round(fallbackG) || 1);
  if (!found.length) return { minG: fallback, maxG: fallback, typicalG: fallback };
  const sorted = [...found].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const kept = sorted.filter((qty) => qty >= mid * 0.3);
  const use = kept.length ? kept : sorted;
  return {
    minG: use[0],
    maxG: use[use.length - 1],
    typicalG: use[Math.floor(use.length / 2)],
  };
}

export function cups_from_grams(qty: number, bounds: { minG: number; maxG: number; typicalG: number }) {
  const grams = Math.max(0, qty);
  const typical = Math.max(1, bounds.typicalG);
  const heavy = Math.max(typical, bounds.maxG);
  const light = Math.max(1, Math.min(bounds.minG, typical));
  return {
    cupsLeft: Math.floor(grams / typical),
    cupsMin: Math.floor(grams / heavy),
    cupsMax: Math.floor(grams / light),
  };
}

function marinade_hint(station: prep_station, materials: Map<string, material>): string | null {
  const marinade = station.marinade;
  if (!marinade?.enabled) return null;
  const parts = marinade.inputs.map((input) => {
    const mat = materials.get(input.materialId);
    const unit = mat ? base_unit_label(mat.unit) : 'г';
    return `${input.qty} ${unit} ${mat?.name || input.materialId}`;
  });
  if (marinade.waterMl > 0) parts.push(`${marinade.waterMl} мл воды`);
  if (!parts.length) return null;
  return parts.join(' + ');
}

export function prep_station_views(state: finance_state): prep_station_view[] {
  const healed = heal_prep_batch_scales(state);
  const qty = stock_qty_map(healed);
  const mats = new Map(healed.materials.map((m) => [m.id, m]));
  const stations = normalize_prep_stations(healed.prepStations);

  return stations
    .filter((s) => s.enabled)
    .map((s) => {
      const dry = mats.get(s.dryMaterialId);
      const cooked = mats.get(s.cookedMaterialId);
      const dryQty = qty.get(s.dryMaterialId) ?? 0;
      const cookedQty = Math.max(0, qty.get(s.cookedMaterialId) ?? 0);
      const bounds = portion_bounds(healed, s.cookedMaterialId, s.portionG);
      const cups = cups_from_grams(cookedQty, bounds);
      const ratio = yield_ratio(s);
      return {
        ...s,
        dryName: dry?.name || s.dryMaterialId,
        cookedName: cooked?.name || s.cookedMaterialId,
        dryQty,
        cookedQty,
        ...cups,
        cupsLabel: cups_label(cups.cupsMin, cups.cupsMax),
        portionMinG: bounds.minG,
        portionMaxG: bounds.maxG,
        portionTypicalG: bounds.typicalG,
        yieldPer100: Math.round(ratio.cookedPerDry * 100),
        yieldSamplesCount: ratio.samples,
        yieldFromExperience: ratio.fromExperience,
        marinadeHint: marinade_hint(s, mats),
        dryCostPerKg: dry
          ? Math.round((dry.unit === 'g' ? dry.costPerUnit * 1000 : dry.costPerUnit) * 100) / 100
          : 0,
        cookedCostPerKg: cooked
          ? Math.round((cooked.unit === 'g' ? cooked.costPerUnit * 1000 : cooked.costPerUnit) * 100) / 100
          : 0,
      };
    });
}

/** выход готового из сухого: норма, подправленная сверками */
export function cooked_from_dry(station: prep_station, dryG: number): number {
  const dry = Math.max(0, Math.round(Number(dryG) || 0));
  const ratio = yield_ratio(station).cookedPerDry;
  if (dry <= 0 || ratio <= 0) return 0;
  return Math.max(1, Math.round(dry * ratio));
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
    if (cooked > s.batchFullG) {
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
): { ok: true; state: finance_state; message: string } | { ok: false; error: string } {
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

  const cookedG = cooked_from_dry(station, dryG);
  if (cookedG <= 0) {
    return { ok: false, error: 'не удалось посчитать выход — проверьте норму на складе' };
  }

  const dry = state.materials.find((m) => m.id === station.dryMaterialId);
  const cooked = state.materials.find((m) => m.id === station.cookedMaterialId);
  if (!dry || !cooked) {
    return { ok: false, error: 'нет позиций склада для этой станции' };
  }

  const book = stock_qty_map(state);
  const dry_on_hand = book.get(dry.id) ?? 0;
  const cooked_before = Math.max(0, book.get(cooked.id) ?? 0);
  const date = input.date || new Date().toISOString();
  const note = input.note?.trim() || `${station.kind === 'pot' ? 'варка' : 'заваривание'}: ${station.label}`;

  // варить можно всегда: если сухого в программе нет — уйдёт в минус, админ потом внесёт поступление
  const dry_cost_total = fifo_consume_cost(state, dry.id, dryG);
  const cooked_cost_per_base = cookedG > 0 ? dry_cost_total / cookedG : 0;
  const cooked_unit_price =
    cooked.unit === 'kg' || cooked.unit === 'L' ? cooked_cost_per_base * 1000 : cooked_cost_per_base;

  const next_materials = state.materials.map((m) =>
    m.id === cooked.id ? { ...m, costPerUnit: Math.round(cooked_unit_price * 100) / 100 } : m
  );

  const out_mv: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'out',
    materialId: dry.id,
    qty: dryG,
    total: dry_cost_total,
    note,
    ...actor_on_movement(input.actor),
  };
  const in_mv: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'in',
    materialId: cooked.id,
    qty: cookedG,
    total: dry_cost_total,
    note,
    ...actor_on_movement(input.actor),
  };

  const next_stations = stations.map((s) => {
    if (s.id !== station.id) return s;
    const prev = s.openBatch;
    return {
      ...s,
      batchFullG: cooked_before + cookedG,
      marinadePending: Boolean(s.marinade?.enabled),
      openBatch: {
        dryG: (prev?.dryG ?? 0) + dryG,
        predictedG: (prev?.predictedG ?? 0) + cookedG,
      },
    };
  });

  let next: finance_state = {
    ...state,
    materials: next_materials,
    prepStations: next_stations,
    stockMovements: [...state.stockMovements, out_mv, in_mv],
  };

  const dry_after = dry_on_hand - dryG;
  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'prep',
      materialId: cooked.id,
      materialName: cooked.name,
      qtyBefore: cooked_before,
      qtyAfter: cooked_before + cookedG,
      note:
        dry_after < -0.5
          ? `${note} · −${dryG} г сухого → +${cookedG} г · сухой ${Math.round(dry_after)} г`
          : `${note} · −${dryG} г сухого → +${cookedG} г`,
      movementId: in_mv.id,
    },
  ]);

  return { ok: true, state: next, message: '' };
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
    s.id === station.id ? { ...s, marinadePending: false } : s
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

function later_iso(iso: string) {
  const t = Date.parse(iso);
  return new Date((Number.isFinite(t) ? t : Date.now()) + 1).toISOString();
}

/**
 * факт в кастрюле (в т.ч. 0 г — пусто).
 * стаканы на карточке — ориентир; в склад уходит adjust в историю.
 */
export function apply_prep_still_have(
  state: finance_state,
  input: {
    stationId: string;
    cookedG: number;
    actor?: stock_actor | null;
    date?: string;
  }
): { ok: true; state: finance_state; learned: boolean; message: string } | { ok: false; error: string } {
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station) return { ok: false, error: 'станция не найдена' };

  const actual = Math.round(Number(input.cookedG));
  if (!Number.isFinite(actual) || actual < 0 || actual > 8000) {
    return { ok: false, error: 'укажите факт: сколько грамм в кастрюле (можно 0)' };
  }

  const result = apply_prep_reconcile(state, {
    stationId: input.stationId,
    cookedG: actual,
    actor: input.actor,
    date: input.date,
  });
  if (!result.ok) return result;

  if (actual <= 0) {
    return { ...result, message: result.message || 'факт: 0 г — кастрюля пустая' };
  }

  const bounds = portion_bounds(result.state, station.cookedMaterialId, station.portionG);
  const orient = cups_from_grams(actual, bounds);
  const approx = cups_label(orient.cupsMin, orient.cupsMax);
  if (result.learned) {
    return {
      ...result,
      message: `факт ${actual} г (${approx}) · ${result.message}`,
    };
  }
  return {
    ...result,
    message: `факт ${actual} г (${approx})`,
  };
}

/**
 * кассир говорит, сколько реально в кастрюле (и при желании в пачке).
 * разница с программой правит остаток и, если была варка, уточняет выход.
 */
export function apply_prep_reconcile(
  state: finance_state,
  input: {
    stationId: string;
    cookedG: number;
    dryG?: number | null;
    actor?: stock_actor | null;
    date?: string;
  }
): { ok: true; state: finance_state; learned: boolean; message: string } | { ok: false; error: string } {
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station) return { ok: false, error: 'станция не найдена' };

  const actual = Math.round(Number(input.cookedG));
  if (!Number.isFinite(actual) || actual < 0 || actual > 8000) {
    return { ok: false, error: 'укажите, сколько грамм реально в кастрюле' };
  }
  const dry_given = input.dryG == null ? null : Math.round(Number(input.dryG));
  if (dry_given != null && (!Number.isFinite(dry_given) || dry_given < 0 || dry_given > 50000)) {
    return { ok: false, error: 'укажите, сколько сухого реально в пачке' };
  }

  const cooked = state.materials.find((m) => m.id === station.cookedMaterialId);
  const dry = state.materials.find((m) => m.id === station.dryMaterialId);
  if (!cooked || !dry) return { ok: false, error: 'нет позиций склада для этой станции' };

  const book = stock_qty_map(state);
  const book_cooked = book.get(cooked.id) ?? 0;
  const book_dry = book.get(dry.id) ?? 0;
  const date = input.date || new Date().toISOString();
  const movements: stock_movement[] = [];

  if (Math.abs(actual - book_cooked) > 0.5) {
    movements.push({
      id: new_id('mv'),
      date,
      type: 'adjust',
      materialId: cooked.id,
      qty: actual,
      note: `факт: ${station.label} → ${actual} г`,
      ...actor_on_movement(input.actor),
    });
  }
  if (dry_given != null && Math.abs(dry_given - book_dry) > 0.5) {
    movements.push({
      id: new_id('mv'),
      date,
      type: 'adjust',
      materialId: dry.id,
      qty: dry_given,
      note: `факт: ${dry.name} → ${dry_given} г`,
      ...actor_on_movement(input.actor),
    });
  }

  let learned = false;
  let samples = station.yieldSamples;
  let openBatch = station.openBatch;
  let message =
    actual <= 0
      ? 'факт: 0 г — кастрюля пустая'
      : Math.abs(actual - book_cooked) > 0.5
        ? `факт: ${actual} г`
        : 'так и есть, ничего не менял';
  const batch = station.openBatch;
  if (batch && actual > 0) {
    const implied = Math.round(batch.predictedG + (actual - book_cooked));
    const lo = batch.predictedG * 0.25;
    const hi = batch.predictedG * 4;
    if (implied >= lo && implied <= hi && implied > 0) {
      samples = [...samples, { dryG: batch.dryG, cookedG: implied }].slice(-YIELD_KEEP);
      learned = true;
      const per100 = Math.round((implied / batch.dryG) * 100);
      message = `факт ${actual} г. по варке из 100 г сухого ≈ ${per100} г`;
    } else {
      message = `факт ${actual} г. норму выхода не менял — разрыв слишком большой`;
    }
    openBatch = null;
  } else if (batch && actual <= 0) {
    openBatch = null;
  }

  const next_stations = stations.map((s) => {
    if (s.id !== station.id) return s;
    const full = actual > 0 ? Math.max(s.batchFullG, actual) : 0;
    return { ...s, yieldSamples: samples, openBatch, batchFullG: full };
  });

  if (!movements.length && !learned && openBatch === station.openBatch) {
    return { ok: true, state, learned: false, message };
  }

  let next: finance_state = {
    ...state,
    prepStations: next_stations,
    stockMovements: movements.length ? [...state.stockMovements, ...movements] : state.stockMovements,
  };
  if (movements.length) {
    next = push_stock_audit(next, [
      {
        id: new_id('aud'),
        at: date,
        ...audit_actor(input.actor),
        action: 'adjust',
        materialId: cooked.id,
        materialName: cooked.name,
        qtyBefore: book_cooked,
        qtyAfter: actual,
        note: message,
        movementId: movements[0]?.id,
      },
    ]);
  }
  return { ok: true, state: next, learned, message };
}

/** залить маринад: сырьё списывается только если оно есть, стоимость садится в варёное */
export function apply_prep_marinade(
  state: finance_state,
  input: { stationId: string; actor?: stock_actor | null; date?: string }
): { ok: true; state: finance_state } | { ok: false; error: string } {
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station?.marinade?.enabled) return { ok: false, error: 'у этой кастрюли нет маринада' };
  const cooked = state.materials.find((m) => m.id === station.cookedMaterialId);
  if (!cooked) return { ok: false, error: 'нет готовой позиции' };

  const book = stock_qty_map(state);
  const cooked_qty = book.get(cooked.id) ?? 0;
  if (cooked_qty <= 0) return { ok: false, error: 'кастрюля пустая — сначала сварите' };

  const mats = new Map(state.materials.map((m) => [m.id, m]));
  const lines = station.marinade.inputs.filter((line) => line.qty > 0);
  for (const line of lines) {
    if (!mats.has(line.materialId)) {
      return { ok: false, error: `на складе нет «${line.materialId}» для маринада` };
    }
  }

  const date = input.date || new Date().toISOString();
  const note = `маринад: ${station.label}`;
  const outs: stock_movement[] = [];
  let add_cost = 0;
  // нет на складе — уйдёт в минус, админ потом внесёт поступление
  for (const line of lines) {
    const mat = mats.get(line.materialId)!;
    if (material_is_infinite(mat)) continue;
    const cost = fifo_consume_cost(state, mat.id, line.qty);
    add_cost += cost;
    outs.push({
      id: new_id('mv'),
      date,
      type: 'out',
      materialId: mat.id,
      qty: line.qty,
      total: cost,
      note,
      ...actor_on_movement(input.actor),
    });
  }
  add_cost = Math.round(add_cost * 100) / 100;

  const cooked_value = fifo_values_map(state).get(cooked.id) ?? 0;
  const next_total = Math.round((cooked_value + add_cost) * 100) / 100;
  const revalue_note = `${station.kind === 'pot' ? 'варка' : 'заваривание'}: маринад ${station.label}`;
  const reset: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'adjust',
    materialId: cooked.id,
    qty: 0,
    note: 'служебный: переоценка после маринада',
    ...actor_on_movement(input.actor),
  };
  const back: stock_movement = {
    id: new_id('mv'),
    date: later_iso(date),
    type: 'in',
    materialId: cooked.id,
    qty: cooked_qty,
    total: next_total,
    note: revalue_note,
    ...actor_on_movement(input.actor),
  };
  const unit =
    cooked.unit === 'kg' || cooked.unit === 'L'
      ? (next_total / cooked_qty) * 1000
      : next_total / cooked_qty;
  const next_materials = state.materials.map((m) =>
    m.id === cooked.id ? { ...m, costPerUnit: Math.round(unit * 100) / 100 } : m
  );
  const next_stations = stations.map((s) =>
    s.id === station.id ? { ...s, marinadePending: false } : s
  );

  let next: finance_state = {
    ...state,
    materials: next_materials,
    prepStations: next_stations,
    stockMovements: [...state.stockMovements, ...outs, reset, back],
  };
  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'prep',
      materialId: cooked.id,
      materialName: cooked.name,
      qtyBefore: cooked_qty,
      qtyAfter: cooked_qty,
      note: `${note} · +${add_cost} ₽ в себестоимость`,
      movementId: back.id,
    },
  ]);
  return { ok: true, state: next };
}

/** кастрюля/чайник по id сырья (варёное или сухое) */
export function prep_station_id_for_material(
  state: Pick<finance_state, 'prepStations'>,
  materialId: string
): string | null {
  const id = String(materialId || '').trim();
  if (!id) return null;
  for (const s of normalize_prep_stations(state.prepStations)) {
    if (!s.enabled) continue;
    if (s.cookedMaterialId === id || s.dryMaterialId === id) return s.id;
  }
  return null;
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
