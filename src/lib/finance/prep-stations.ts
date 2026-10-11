/**
 * Варка тапиоки / заваривание чая:
 * сухой склад → готовая порция (то, что в техкартах).
 * Коэффициенты и цены заполняет кассир/админ вручную.
 */

import {
  actor_on_movement,
  fifo_consume_cost,
  new_id,
  push_stock_audit,
  stock_qty_map,
  type finance_state,
  type material,
  type stock_actor,
  type stock_movement,
} from '@/lib/finance/model';

export type prep_station_kind = 'pot' | 'teapot';

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
  /** сколько сварили за последний раз (г) — это и есть 100% шкалы */
  batchFullG: number;
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
    enabled: true,
  },
  {
    id: 'tea_black',
    label: 'чай чёрный',
    kind: 'teapot',
    dryMaterialId: 'tea_black_dry',
    cookedMaterialId: 'tea_black',
    defaultDryG: 30,
    defaultCookedG: 1500,
    portionG: 150,
    batchFullG: 0,
    enabled: true,
  },
  {
    id: 'tea_jasmine',
    label: 'чай жасмин',
    kind: 'teapot',
    dryMaterialId: 'tea_jasmine_dry',
    cookedMaterialId: 'tea_jasmine',
    defaultDryG: 30,
    defaultCookedG: 1500,
    portionG: 150,
    batchFullG: 0,
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
        enabled: true,
      };
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

  for (const dry of PREP_DRY_MATERIALS) {
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
      const dryQty = Math.max(0, qty.get(s.dryMaterialId) ?? 0);
      const cookedQty = Math.max(0, qty.get(s.cookedMaterialId) ?? 0);
      const portion = Math.max(1, s.portionG);
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
      };
    });
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

  const cookedG = cooked_from_dry(station, dryG);
  if (cookedG <= 0) {
    return { ok: false, error: 'не удалось посчитать выход — проверьте норму на складе' };
  }

  const dry = state.materials.find((m) => m.id === station.dryMaterialId);
  const cooked = state.materials.find((m) => m.id === station.cookedMaterialId);
  if (!dry || !cooked) {
    return { ok: false, error: 'нет позиций склада для этой станции' };
  }

  const dry_on_hand = stock_qty_map(state).get(dry.id) ?? 0;
  if (dryG > dry_on_hand + 0.5) {
    return {
      ok: false,
      error: `не хватает сухого: есть ${Math.round(dry_on_hand)} г, нужно ${dryG} г`,
    };
  }

  const date = input.date || new Date().toISOString();
  const note = input.note?.trim() || `${station.kind === 'pot' ? 'варка' : 'заваривание'}: ${station.label}`;

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

  const next_stations = stations.map((s) =>
    s.id === station.id ? { ...s, batchFullG: cookedG } : s
  );

  let next: finance_state = {
    ...state,
    materials: next_materials,
    prepStations: next_stations,
    stockMovements: [...state.stockMovements, out_mv, in_mv],
  };

  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'prep',
      materialId: cooked.id,
      materialName: cooked.name,
      qtyBefore: stock_qty_map(state).get(cooked.id) ?? 0,
      qtyAfter: (stock_qty_map(state).get(cooked.id) ?? 0) + cookedG,
      note: `${note} · −${dryG} г сухого → +${cookedG} г (=100%)`,
      movementId: in_mv.id,
    },
  ]);

  return { ok: true, state: next };
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
    s.id === station.id ? { ...s, batchFullG: 0 } : s
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
