/**
 * Варка тапиоки / заваривание чая:
 * сухой склад → готовая порция (то, что в техкартах).
 * Норму выхода задаёт кассир. Цена сухого и готового — из партий склада, не из карточки.
 */

import {
  actor_on_movement,
  base_unit,
  base_unit_label,
  add_days,
  day_key,
  fifo_consume_cost,
  moscow_today,
  next_lot_cost_per_base,
  fifo_values_map,
  material_is_free,
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
export type prep_open_batch = { dryG: number; predictedG: number; /** первая варка этой партии */ at?: string };

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
  /**
   * когда началась текущая партия готового.
   * чай живёт 6 часов от этого момента, долив срок не продлевает.
   * тапиока живёт до следующего утра по Москве.
   */
  brewedAt: string | null;
  enabled: boolean;
};

export type prep_station_view = prep_station & {
  dryName: string;
  cookedName: string;
  /** может быть минусом — пачка в программе кончилась раньше, чем в жизни */
  dryQty: number;
  /** готовое в программе. минус — продали больше, чем сварили; не прячем */
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
  /** когда партия тухнет. пусто — кастрюля пустая */
  expiresAt: string | null;
  /** «ещё 4 ч 12 мин», «до утра», «срок вышел» */
  holdLabel: string;
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
    category: 'mixes',
    unit: 'kg',
    costPerUnit: 1500,
    minStock: 400,
  },
  {
    id: 'tea_jasmine_dry',
    name: 'чай жасмин (сухой лист)',
    category: 'mixes',
    unit: 'kg',
    costPerUnit: 1600,
    minStock: 400,
  },
];

export const PREP_EXTRA_MATERIALS: material[] = [
  {
    id: 'cane_sugar_cube',
    name: 'сахар тростниковый (кубики)',
    category: 'mixes',
    unit: 'pcs',
    costPerUnit: 2,
  },
];

/** готовые позиции станций. если карточку убрали со склада, варка всё равно пишет в неё */
const PREP_COOKED_MATERIALS: material[] = [
  { id: 'tapioca', name: 'тапиока сваренная', category: 'prep', unit: 'kg', costPerUnit: 400, minStock: 2000 },
  { id: 'tea_black', name: 'чай чёрный (заваренный)', category: 'prep', unit: 'kg', costPerUnit: 1500, minStock: 400 },
  {
    id: 'tea_jasmine',
    name: 'чай зелёный жасмин (заваренный)',
    category: 'prep',
    unit: 'kg',
    costPerUnit: 1600,
    minStock: 400,
  },
];

/**
 * Дневной маринад: ~50 г самоварного сиропа на 500 мл воды.
 * Сироп 2:1 по весу — из 50 г это 33 г тростникового сахара и 17 мл воды.
 * 500 мл маринада хватает на день, второй раз за день сахар не списываем.
 */
export const DEFAULT_TAPIOCA_MARINADE: prep_marinade = {
  enabled: true,
  label: 'маринад',
  inputs: [{ materialId: 'cane_sugar', qty: 33 }],
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
    brewedAt: null,
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
    brewedAt: null,
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
    brewedAt: null,
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

function normalize_brewed_at(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function normalize_open_batch(raw: unknown): prep_open_batch | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<prep_open_batch>;
  const dryG = Math.max(0, Math.round(Number(r.dryG) || 0));
  const predictedG = Math.max(0, Math.round(Number(r.predictedG) || 0));
  if (dryG <= 0 || predictedG <= 0) return null;
  const at = typeof r.at === 'string' && r.at.trim() ? r.at.trim() : undefined;
  return { dryG, predictedG, ...(at ? { at } : {}) };
}

function fresh_tapioca_marinade(): prep_marinade {
  return {
    ...DEFAULT_TAPIOCA_MARINADE,
    inputs: DEFAULT_TAPIOCA_MARINADE.inputs.map((input) => ({ ...input })),
  };
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
    brewedAt: null,
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
      const marinade =
        id === 'tapioca'
          ? fresh_tapioca_marinade()
          : normalize_marinade('marinade' in r ? r.marinade : undefined, base.marinade);
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
        brewedAt: normalize_brewed_at(r.brewedAt),
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

  const removed_mats = new Set(state.removedMaterialIds ?? []);
  for (const dry of [...PREP_DRY_MATERIALS, ...PREP_EXTRA_MATERIALS]) {
    if (have.has(dry.id) || removed_mats.has(dry.id)) continue;
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

/**
 * стартовая норма + сверки.
 * последняя сверка сразу перетягивает следующую варку, старые остаются фоном.
 */
export function yield_ratio(station: Pick<prep_station, 'defaultDryG' | 'defaultCookedG' | 'yieldSamples'>): {
  cookedPerDry: number;
  samples: number;
  fromExperience: boolean;
} {
  const manual =
    station.defaultDryG > 0 && station.defaultCookedG > 0
      ? station.defaultCookedG / station.defaultDryG
      : 0;
  const samples = station.yieldSamples.filter((sample) => sample.dryG > 0 && sample.cookedG > 0);
  if (!samples.length || manual <= 0) {
    return { cookedPerDry: manual, samples: station.yieldSamples.length, fromExperience: false };
  }
  const latest = samples[samples.length - 1];
  const latestRatio = latest.cookedG / latest.dryG;
  const olderDry = samples.reduce((sum, sample) => sum + sample.dryG, 0) - latest.dryG;
  const olderCooked = samples.reduce((sum, sample) => sum + sample.cookedG, 0) - latest.cookedG;
  const prior = olderDry > 0 ? olderCooked / olderDry : manual;
  return {
    cookedPerDry: prior * 0.25 + latestRatio * 0.75,
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
  if (station.id === 'tapioca') return '50 г самоварного сиропа на 500 мл воды';
  const parts = marinade.inputs.map((input) => {
    const mat = materials.get(input.materialId);
    const unit = mat ? base_unit_label(mat.unit) : 'г';
    return `${input.qty} ${unit} ${mat?.name || input.materialId}`;
  });
  if (marinade.waterMl > 0) parts.push(`${marinade.waterMl} мл воды`);
  if (!parts.length) return null;
  return parts.join(' + ');
}

/** чайная заварка: не дольше 6 часов с первой заварки этой партии */
export const TEA_HOLD_MS = 6 * 60 * 60 * 1000;

/** когда партия должна уйти со склада. тапиока — в полночь по Москве, чай — через 6 часов */
export function prep_expires_at(kind: prep_station_kind, brewedAt: string): string | null {
  const t = Date.parse(brewedAt);
  if (!Number.isFinite(t)) return null;
  if (kind === 'teapot') return new Date(t + TEA_HOLD_MS).toISOString();
  const morning = new Date(`${add_days(moscow_today(new Date(t)), 1)}T00:00:00+03:00`);
  return Number.isFinite(morning.getTime()) ? morning.toISOString() : null;
}

export function prep_hold_label(kind: prep_station_kind, expiresAt: string, now = Date.now()): string {
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left)) return '';
  if (left <= 0) return 'срок вышел';
  if (kind === 'pot') return 'до утра';
  const mins = Math.max(1, Math.ceil(left / 60_000));
  if (mins < 60) return `ещё ${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `ещё ${h} ч ${m} мин` : `ещё ${h} ч`;
}

/** время варки текущей партии: из записи станции или из последнего прихода готового */
function inferred_brewed_at(state: finance_state, materialId: string): string | null {
  const ins = state.stockMovements.filter((mv) => mv.materialId === materialId && mv.type === 'in' && mv.qty > 0);
  if (!ins.length) return null;
  const cooks = ins.filter((mv) => {
    const note = (mv.note || '').trim();
    return /^(варка|заваривание)\b/i.test(note) && !/навар|маринад/i.test(note);
  });
  const pool = cooks.length ? cooks : ins;
  return pool.reduce((max, mv) => (mv.date > max ? mv.date : max), pool[0].date);
}

const PREP_CLOCK_ACTOR: stock_actor = { id: 'prep-clock', name: 'срок годности', role: 'admin' };

/**
 * чай старше 6 часов и тапиока со вчера списываются сами.
 * пустая кастрюля забывает таймер, чтобы следующая варка начала новый.
 */
export function expire_stale_prep(state: finance_state, now = new Date()): finance_state {
  const stations = normalize_prep_stations(state.prepStations);
  const qty = stock_qty_map(state);
  const movements: stock_movement[] = [];
  const audits: Parameters<typeof push_stock_audit>[1] = [];
  let changed = false;
  const date = now.toISOString();
  const next_stations = stations.map((s) => {
    const cooked = qty.get(s.cookedMaterialId) ?? 0;
    if (cooked <= 0.5) {
      if (!s.brewedAt) return s;
      changed = true;
      return { ...s, brewedAt: null };
    }
    const brewed = s.brewedAt || inferred_brewed_at(state, s.cookedMaterialId);
    if (!brewed) return s;
    const expires = prep_expires_at(s.kind, brewed);
    if (!expires) return s;
    if (Date.parse(expires) > now.getTime()) {
      if (s.brewedAt) return s;
      changed = true;
      return { ...s, brewedAt: brewed };
    }
    changed = true;
    const note =
      s.kind === 'teapot'
        ? `срок годности: ${s.label} · 6 часов`
        : `утро: ${s.label}`;
    const movement: stock_movement = {
      id: new_id('mv'),
      date,
      type: 'writeoff',
      materialId: s.cookedMaterialId,
      qty: cooked,
      total: fifo_consume_cost(state, s.cookedMaterialId, cooked),
      note,
      ...actor_on_movement(PREP_CLOCK_ACTOR),
    };
    movements.push(movement);
    const mat = state.materials.find((m) => m.id === s.cookedMaterialId);
    audits.push({
      id: new_id('aud'),
      at: date,
      ...audit_actor(PREP_CLOCK_ACTOR),
      action: 'writeoff',
      materialId: s.cookedMaterialId,
      materialName: mat?.name || s.label,
      qtyBefore: cooked,
      qtyAfter: 0,
      note,
      movementId: movement.id,
    });
    return { ...s, brewedAt: null, openBatch: null, marinadePending: false };
  });
  if (!changed) return state;
  return push_stock_audit(
    {
      ...state,
      prepStations: next_stations,
      stockMovements: movements.length ? [...state.stockMovements, ...movements] : state.stockMovements,
    },
    audits
  );
}

/** после ручного списания готового до нуля таймер партии гаснет */
export function clear_station_clock(state: finance_state, materialId: string): finance_state {
  const left = stock_qty_map(state).get(materialId) ?? 0;
  if (left > 0.5) return state;
  const stations = normalize_prep_stations(state.prepStations);
  let changed = false;
  const next = stations.map((s) => {
    if (s.cookedMaterialId !== materialId || !s.brewedAt) return s;
    changed = true;
    return { ...s, brewedAt: null, openBatch: null, marinadePending: false };
  });
  return changed ? { ...state, prepStations: next } : state;
}

function moscow_day(iso: string) {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return day_key(iso);
  return moscow_today(t);
}

/** дневная порция маринада уже списана — вторую кастрюлю в тот же день только отмечаем */
function marinade_poured_today(state: finance_state, station: prep_station, iso: string) {
  const day = moscow_day(iso);
  const note = `маринад: ${station.label}`;
  const revalue = `${station.kind === 'pot' ? 'варка' : 'заваривание'}: маринад ${station.label}`;
  return state.stockMovements.some(
    (mv) =>
      ((mv.type === 'out' && (mv.note || '').startsWith(note)) || (mv.type === 'in' && mv.note === revalue)) &&
      moscow_day(mv.date) === day
  );
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
      const cookedQty = qty.get(s.cookedMaterialId) ?? 0;
      const bounds = portion_bounds(healed, s.cookedMaterialId, s.portionG);
      const cups = cups_from_grams(cookedQty, bounds);
      const ratio = yield_ratio(s);
      const brewedAt = cookedQty > 0.5 ? s.brewedAt || inferred_brewed_at(healed, s.cookedMaterialId) : null;
      const expiresAt = brewedAt ? prep_expires_at(s.kind, brewedAt) : null;
      return {
        ...s,
        brewedAt,
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
        dryCostPerKg: cost_per_kg(healed, dry),
        cookedCostPerKg: cost_per_kg(healed, cooked),
        expiresAt,
        holdLabel: expiresAt ? prep_hold_label(s.kind, expiresAt) : '',
      };
    });
}

/** ₽/кг по партиям, которые ещё лежат. штуки и пустая карточка — 0 */
function cost_per_kg(state: finance_state, mat: material | undefined) {
  if (!mat || base_unit(mat.unit) !== 'g') return 0;
  return Math.round(next_lot_cost_per_base(state, mat.id) * 1000 * 100) / 100;
}

function looks_like_dry_tapioca(id: string, name: string) {
  const n = `${id} ${name}`.toLowerCase().replace(/ё/g, 'е');
  if (/сварен/.test(n)) return false;
  return /tapioca|тапиок/.test(n);
}

/** сухой продукт станции или другая сухая тапиока — её минус закрывают поставкой */
export function material_is_prep_dry(
  m: { id: string; name?: string },
  stations: Pick<prep_station, 'dryMaterialId' | 'cookedMaterialId'>[]
) {
  if (stations.some((s) => s.cookedMaterialId === m.id)) return false;
  if (stations.some((s) => s.dryMaterialId === m.id)) return true;
  return looks_like_dry_tapioca(m.id, m.name || '');
}

/** какую сухую тапиоку можно выбрать на варке, возможно несколько разных */
export function tapioca_dry_choices(state: finance_state): { id: string; name: string; qty: number }[] {
  const stations = normalize_prep_stations(state.prepStations);
  const pot = stations.find((s) => s.id === 'tapioca') || stations.find((s) => s.kind === 'pot');
  const cooked = new Set(stations.map((s) => s.cookedMaterialId));
  const qty = stock_qty_map(state);
  return state.materials
    .filter((m) => {
      if (cooked.has(m.id) || material_is_free(m) || material_is_infinite(m)) return false;
      if (pot && m.id === pot.dryMaterialId) return true;
      return looks_like_dry_tapioca(m.id, m.name);
    })
    .map((m) => ({ id: m.id, name: m.name, qty: qty.get(m.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** выход готового из сухого: норма, подправленная сверками */
export function cooked_from_dry(station: prep_station, dryG: number): number {
  const dry = Math.max(0, Math.round(Number(dryG) || 0));
  const ratio = yield_ratio(station).cookedPerDry;
  if (dry <= 0 || ratio <= 0) return 0;
  return Math.max(1, Math.round(dry * ratio));
}

function station_material_stub(id: string): material | null {
  const cooked = PREP_COOKED_MATERIALS.find((m) => m.id === id);
  if (cooked) return { ...cooked };
  const dry = [...PREP_DRY_MATERIALS, ...PREP_EXTRA_MATERIALS].find((m) => m.id === id);
  return dry ? { ...dry } : null;
}

/** удалённая со склада карточка чая не должна ронять варку и факт */
function with_station_materials(state: finance_state, station: prep_station): finance_state {
  let materials = state.materials;
  for (const id of [station.cookedMaterialId, station.dryMaterialId]) {
    if (!id || materials.some((m) => m.id === id)) continue;
    const stub = station_material_stub(id);
    if (!stub) continue;
    materials = [...materials, stub];
  }
  return materials === state.materials ? state : { ...state, materials };
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

/**
 * минус в кастрюле — дырка учёта, не чай в чайнике.
 * закрываем в ноль и гасим шкалу, иначе карточка мигает вечно,
 * а следующая заварка тонет в старом списании.
 */
export function heal_prep_cooked_holes(state: finance_state): finance_state {
  const qty = stock_qty_map(state);
  const stations = normalize_prep_stations(state.prepStations);
  const movements: stock_movement[] = [];
  const audits: Parameters<typeof push_stock_audit>[1] = [];
  let changed = false;
  const date = new Date().toISOString();
  const next_stations = stations.map((s) => {
    const cooked = qty.get(s.cookedMaterialId) ?? 0;
    if (cooked >= -0.5) return s;
    changed = true;
    const movement: stock_movement = {
      id: new_id('mv'),
      date,
      type: 'adjust',
      materialId: s.cookedMaterialId,
      qty: 0,
      note: `минус в кастрюле закрыт: ${s.label}`,
    };
    movements.push(movement);
    const mat = state.materials.find((m) => m.id === s.cookedMaterialId);
    audits.push({
      id: new_id('aud'),
      at: date,
      ...audit_actor(null),
      action: 'adjust',
      materialId: s.cookedMaterialId,
      materialName: mat?.name || s.label,
      qtyBefore: cooked,
      qtyAfter: 0,
      note: movement.note,
      movementId: movement.id,
    });
    return { ...s, batchFullG: 0, openBatch: null, marinadePending: false, brewedAt: null };
  });
  if (!changed) return state;
  return push_stock_audit(
    {
      ...state,
      prepStations: next_stations,
      stockMovements: [...state.stockMovements, ...movements],
    },
    audits
  );
}

export type prep_cook_line = { materialId: string; grams: number };

/**
 * сварить / заварить.
 * чай: одно число сухого.
 * тапиока: несколько сухих позиций, расчётный вес, затем факт в кастрюле.
 * сухого может не хватить — уйдёт в минус, админ закрывает поставкой.
 */
export function apply_prep_cook(
  state: finance_state,
  input: {
    stationId: string;
    dryG?: number;
    lines?: prep_cook_line[] | null;
    /** сколько готового реально в кастрюле после этой варки */
    actualG?: number | null;
    note?: string;
    actor?: stock_actor | null;
    date?: string;
  }
): { ok: true; state: finance_state; message: string } | { ok: false; error: string } {
  state = expire_stale_prep(state, input.date ? new Date(input.date) : new Date());
  const stations = normalize_prep_stations(state.prepStations);
  const station = stations.find((s) => s.id === input.stationId);
  if (!station || !station.enabled) {
    return { ok: false, error: 'станция не найдена' };
  }
  if (station.defaultDryG <= 0 || station.defaultCookedG <= 0) {
    return {
      ok: false,
      error: 'на складе не задана норма выхода — заполните «сухой → готовый» во вкладке склад',
    };
  }

  state = with_station_materials(state, station);

  const weighed = input.actualG != null;
  const actualG = weighed ? Math.round(Number(input.actualG)) : null;
  if (actualG != null && (!Number.isFinite(actualG) || actualG < 0 || actualG > 8000)) {
    return { ok: false, error: 'напишите, сколько грамм сейчас в кастрюле' };
  }

  const mats = new Map(state.materials.map((m) => [m.id, m]));
  const cooked = mats.get(station.cookedMaterialId);
  if (!cooked) return { ok: false, error: 'нет готовой позиции склада для этой станции' };

  const raw: prep_cook_line[] =
    Array.isArray(input.lines) && input.lines.length
      ? input.lines
      : [{ materialId: station.dryMaterialId, grams: Number(input.dryG) }];

  const by_id = new Map<string, number>();
  for (const row of raw) {
    const materialId = String(row?.materialId || '').trim();
    const grams = Math.round(Number(row?.grams));
    if (!materialId || !Number.isFinite(grams) || grams <= 0) continue;
    by_id.set(materialId, (by_id.get(materialId) ?? 0) + grams);
  }
  if (!by_id.size) {
    return {
      ok: false,
      error:
        station.kind === 'pot'
          ? 'укажите, сколько и какой тапиоки положили'
          : 'укажите сколько сухого положили (г)',
    };
  }

  const lines: { mat: material; grams: number }[] = [];
  for (const [materialId, grams] of by_id) {
    const mat = mats.get(materialId);
    if (!mat) return { ok: false, error: 'нет такой позиции на складе' };
    if (mat.id === cooked.id) return { ok: false, error: 'в варку кладут сухую тапиоку' };
    if (material_is_free(mat) || material_is_infinite(mat)) {
      return { ok: false, error: `${mat.name} не списывается со склада` };
    }
    if (station.kind === 'pot') {
      const ok_dry = mat.id === station.dryMaterialId || looks_like_dry_tapioca(mat.id, mat.name);
      if (!ok_dry) return { ok: false, error: `${mat.name} — это не тапиока` };
    } else if (mat.id !== station.dryMaterialId) {
      return { ok: false, error: 'для чая одна сухая позиция' };
    }
    lines.push({ mat, grams });
  }

  const dryG = lines.reduce((sum, line) => sum + line.grams, 0);
  const cookedG = cooked_from_dry(station, dryG);
  if (cookedG <= 0) {
    return { ok: false, error: 'не удалось посчитать выход — проверьте норму на складе' };
  }

  const book = stock_qty_map(state);
  const cooked_book = book.get(cooked.id) ?? 0;
  const cooked_scale = Math.max(0, cooked_book);
  const date = input.date || new Date().toISOString();
  const verb = station.kind === 'pot' ? 'варка' : 'заваривание';
  const note = input.note?.trim() || `${verb}: ${station.label}`;

  let dry_cost_total = 0;
  const outs: stock_movement[] = [];
  for (const line of lines) {
    const cost = fifo_consume_cost(state, line.mat.id, line.grams);
    dry_cost_total += cost;
    outs.push({
      id: new_id('mv'),
      date,
      type: 'out',
      materialId: line.mat.id,
      qty: line.grams,
      total: cost,
      note,
      ...actor_on_movement(input.actor),
    });
  }
  dry_cost_total = Math.round(dry_cost_total * 100) / 100;
  const cooked_cost_per_base = cookedG > 0 ? dry_cost_total / cookedG : 0;
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
    total: dry_cost_total,
    note,
    ...actor_on_movement(input.actor),
  };

  const next_stations = stations.map((s) => {
    if (s.id !== station.id) return s;
    const prev = actualG == null ? s.openBatch : null;
    const fresh = cooked_scale <= 0.5;
    return {
      ...s,
      batchFullG: cooked_scale + cookedG,
      marinadePending: Boolean(s.marinade?.enabled) && !marinade_poured_today(state, s, date),
      brewedAt: fresh ? date : s.brewedAt || date,
      openBatch: {
        dryG: (prev?.dryG ?? 0) + dryG,
        predictedG: (prev?.predictedG ?? 0) + cookedG,
        at: prev?.at || date,
      },
    };
  });

  let next: finance_state = {
    ...state,
    materials: next_materials,
    prepStations: next_stations,
    stockMovements: [...state.stockMovements, ...outs, in_mv],
  };

  const taken = lines.map((line) => `${line.grams} г ${line.mat.name}`).join(', ');
  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'prep',
      materialId: cooked.id,
      materialName: cooked.name,
      qtyBefore: cooked_book,
      qtyAfter: cooked_book + cookedG,
      note: `${note} · ${taken} → +${cookedG} г`,
      movementId: in_mv.id,
    },
  ]);

  if (actualG == null) {
    return { ok: true, state: next, message: `${verb}: +${cookedG} г по навару` };
  }

  const settled = apply_prep_reconcile(next, {
    stationId: station.id,
    cookedG: actualG,
    actor: input.actor,
    date: later_iso(date),
  });
  if (!settled.ok) return settled;

  const after = stock_qty_map(settled.state);
  const debts = lines
    .map((line) => {
      const left = after.get(line.mat.id) ?? 0;
      return left < -0.5 ? `${line.mat.name} −${Math.round(-left)} г` : '';
    })
    .filter(Boolean);
  const message = debts.length
    ? `${settled.message} · сухой минус: ${debts.join(', ')} — админу нужна поставка`
    : settled.message;
  return { ok: true, state: settled.state, message };
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

  state = with_station_materials(state, station);
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
    s.id === station.id ? { ...s, marinadePending: false, openBatch: null, brewedAt: null } : s
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

function round_money(n: number) {
  return Math.round(n * 100) / 100;
}

function batch_start_iso(state: finance_state, materialId: string, batch: prep_open_batch): string {
  if (batch.at) return batch.at;
  const ins = state.stockMovements
    .filter(
      (mv) =>
        mv.materialId === materialId &&
        mv.type === 'in' &&
        /^(варка|заваривание)\b/i.test((mv.note || '').trim()) &&
        !/маринад/i.test(mv.note || '')
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let sum = 0;
  let start = ins.length ? ins[ins.length - 1].date : '';
  for (let i = ins.length - 1; i >= 0; i--) {
    sum += ins[i].qty;
    start = ins[i].date;
    if (sum + 0.5 >= batch.predictedG) break;
  }
  return start;
}

/** деньги партии разложить по уже проданным стаканам и тому, что ещё лежит */
function reprice_batch_drinks(
  state: finance_state,
  materialId: string,
  since: string,
  actualG: number
): { state: finance_state; unit: number; drinks: number } | null {
  if (!since) return null;
  const sales = state.stockMovements
    .filter(
      (mv) =>
        mv.materialId === materialId &&
        (mv.type === 'sale' || mv.type === 'staff') &&
        mv.date >= since
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const soldQty = sales.reduce((sum, mv) => sum + mv.qty, 0);
  const trueG = soldQty + Math.max(0, actualG);
  if (trueG <= 0.5 || !sales.length) return null;
  const onHand = fifo_values_map(state).get(materialId) ?? 0;
  const soldValue = sales.reduce((sum, mv) => sum + (Number(mv.total) || 0), 0);
  const pool = onHand + soldValue;
  if (!(pool > 0)) return null;
  const unit = pool / trueG;
  let assigned = 0;
  const totals = new Map<string, number>();
  sales.forEach((mv, index) => {
    const total =
      index === sales.length - 1 ? round_money(soldQty * unit - assigned) : round_money(mv.qty * unit);
    assigned = round_money(assigned + total);
    totals.set(mv.id, Math.max(0, total));
  });
  return {
    state: {
      ...state,
      stockMovements: state.stockMovements.map((mv) =>
        totals.has(mv.id) ? { ...mv, total: totals.get(mv.id) } : mv
      ),
    },
    unit,
    drinks: new Set(sales.map((mv) => mv.orderId || mv.id)).size,
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

  state = with_station_materials(state, station);
  const cooked = state.materials.find((m) => m.id === station.cookedMaterialId);
  const dry = state.materials.find((m) => m.id === station.dryMaterialId);
  if (!cooked || !dry) return { ok: false, error: 'нет позиций склада для этой станции' };

  const book = stock_qty_map(state);
  const book_cooked = book.get(cooked.id) ?? 0;
  const book_dry = book.get(dry.id) ?? 0;
  const date = input.date || new Date().toISOString();
  const movements: stock_movement[] = [];
  const short = book_cooked - actual;

  const batch = station.openBatch;
  let implied = 0;
  let yield_ok = false;
  if (batch && batch.dryG > 0) {
    implied = Math.round(batch.predictedG + (actual - book_cooked));
    const perDry = implied / batch.dryG;
    yield_ok = implied > 0 && perDry >= 0.2 && perDry <= 6;
  }

  let learned = false;
  let samples = station.yieldSamples;
  let openBatch = station.openBatch;
  if (batch && yield_ok) {
    samples = [...samples, { dryG: batch.dryG, cookedG: implied }].slice(-YIELD_KEEP);
    learned = true;
    openBatch = null;
  } else if (batch) {
    openBatch = null;
  }

  let message =
    actual <= 0
      ? 'факт: 0 г — кастрюля пустая'
      : Math.abs(actual - book_cooked) > 0.5
        ? `факт: ${actual} г`
        : 'так и есть, ничего не менял';
  let priced: { unit: number; drinks: number } | null = null;
  if (learned && batch) {
    const since = batch_start_iso(state, cooked.id, batch);
    const repriced = reprice_batch_drinks(state, cooked.id, since, actual);
    if (repriced) {
      state = repriced.state;
      priced = { unit: repriced.unit, drinks: repriced.drinks };
    }
  }

  if (learned && batch && batch.dryG > 0) {
    const per100 = Math.round((implied / batch.dryG) * 100);
    message = `факт ${actual} г. из 100 г сухого ≈ ${per100} г`;
    if (priced) message += `. себестоимость ${priced.drinks} стаканов пересчитана`;
  } else if (batch && short > 0.5) {
    message =
      implied > 0
        ? `навар не менял: из ${batch.dryG} г сухого вышло бы ${implied} г, прогноз был ${batch.predictedG} г. ${Math.round(short)} г — в потеряно`
        : `навар не менял. не хватает ${Math.round(short)} г — в потеряно`;
  } else if (short > 0.5) {
    message = `не хватает ${Math.round(short)} г — в потеряно`;
  } else if (batch && actual - book_cooked > 0.5) {
    message = `факт ${actual} г. норму выхода не менял — разрыв слишком большой`;
  }

  if (learned && Math.abs(actual - book_cooked) > 0.5) {
    const fallback = round_money(fifo_values_map(state).get(cooked.id) ?? 0);
    const remain = priced ? round_money(Math.max(0, actual) * priced.unit) : fallback;
    movements.push({
      id: new_id('mv'),
      date,
      type: 'adjust',
      materialId: cooked.id,
      qty: 0,
      note: 'служебный: переоценка навара',
      ...actor_on_movement(input.actor),
    });
    if (actual > 0) {
      movements.push({
        id: new_id('mv'),
        date: later_iso(date),
        type: 'in',
        materialId: cooked.id,
        qty: actual,
        total: remain,
        note: `варка: навар ${station.label}`,
        ...actor_on_movement(input.actor),
      });
    }
  } else if (!learned && short > 0.5) {
    movements.push({
      id: new_id('mv'),
      date,
      type: 'writeoff',
      materialId: cooked.id,
      qty: short,
      total: fifo_consume_cost(state, cooked.id, short),
      note: `потеряно: ${station.label}`,
      ...actor_on_movement(input.actor),
    });
  } else if (!learned && actual - book_cooked > 0.5) {
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

  const next_stations = stations.map((s) => {
    if (s.id !== station.id) return s;
    const full = actual > 0 ? Math.max(s.batchFullG, actual) : 0;
    return {
      ...s,
      yieldSamples: samples,
      openBatch,
      batchFullG: full,
      ...(actual <= 0 ? { brewedAt: null, marinadePending: false } : {}),
    };
  });

  if (!movements.length && !learned && openBatch === station.openBatch) {
    return { ok: true, state, learned: false, message };
  }

  let next: finance_state = {
    ...state,
    prepStations: next_stations,
    stockMovements: movements.length ? [...state.stockMovements, ...movements] : state.stockMovements,
  };
  if (learned && (priced || actual > 0)) {
    const per = priced
      ? priced.unit
      : (fifo_values_map(next).get(cooked.id) ?? 0) / Math.max(1, actual);
    const unit = cooked.unit === 'kg' || cooked.unit === 'L' ? per * 1000 : per;
    next = {
      ...next,
      materials: next.materials.map((m) =>
        m.id === cooked.id ? { ...m, costPerUnit: Math.round(unit * 100) / 100 } : m
      ),
    };
  }
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
  state = with_station_materials(state, station);
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
  const note = `маринад: ${station.label} · 50 г сиропа на 500 мл воды`;
  if (marinade_poured_today(state, station, date)) {
    const next_stations = stations.map((s) =>
      s.id === station.id ? { ...s, marinadePending: false } : s
    );
    const next = push_stock_audit(
      { ...state, prepStations: next_stations },
      [
        {
          id: new_id('aud'),
          at: date,
          ...audit_actor(input.actor),
          action: 'prep',
          materialId: cooked.id,
          materialName: cooked.name,
          qtyBefore: cooked_qty,
          qtyAfter: cooked_qty,
          note: 'маринад на сегодня уже есть — 500 мл хватает на день',
        },
      ]
    );
    return { ok: true, state: next };
  }
  const outs: stock_movement[] = [];
  let add_cost = 0;
  // нет на складе — уйдёт в минус, админ потом внесёт поступление. вода бесплатная, в минус её не гоним
  for (const line of lines) {
    const mat = mats.get(line.materialId)!;
    if (material_is_infinite(mat) || material_is_free(mat)) continue;
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

/** заказ с этой кастрюлей нельзя создать, пока не залили маринад */
export function marinade_order_block(
  state: finance_state,
  need: Map<string, number>
): { error: string; stationId: string } | null {
  for (const station of normalize_prep_stations(state.prepStations)) {
    if (!station.enabled || !station.marinade?.enabled || !station.marinadePending) continue;
    if ((need.get(station.cookedMaterialId) ?? 0) <= 0) continue;
    return { error: `сначала залей маринад — ${station.label}`, stationId: station.id };
  }
  return null;
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
