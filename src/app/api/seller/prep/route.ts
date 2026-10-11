import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import {
  apply_prep_cook,
  apply_prep_discard,
  heal_prep_batch_scales,
  prep_station_views,
  update_prep_station,
} from '@/lib/finance/prep-stations';

export const dynamic = 'force-dynamic';

async function require_actor() {
  const actor = await staff_actor();
  if (!actor) return null;
  return actor;
}

export async function GET() {
  if (!(await require_actor())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  let state = await read_finance_state();
  const healed = heal_prep_batch_scales(state);
  if (healed !== state && is_supabase_configured()) {
    try {
      await write_finance_state(healed);
      state = healed;
    } catch {
      state = healed;
    }
  } else {
    state = healed;
  }
  return NextResponse.json(
    { stations: prep_station_views(state) },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}

export async function POST(request: Request) {
  const actor = await require_actor();
  if (!actor) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'склад пишется только в supabase' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }

  const kind = (body as { kind?: string })?.kind;
  const state = await read_finance_state();

  if (kind === 'cook') {
    const b = body as {
      stationId?: string;
      dryG?: number;
      note?: string;
    };
    const result = apply_prep_cook(state, {
      stationId: String(b.stationId || ''),
      dryG: Number(b.dryG),
      note: b.note,
      actor,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    try {
      await write_finance_state(result.state);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ошибка записи' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, stations: prep_station_views(result.state) });
  }

  if (kind === 'discard') {
    const stationId = String((body as { stationId?: string }).stationId || '');
    const note = (body as { note?: string }).note;
    const result = apply_prep_discard(state, { stationId, note, actor });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    try {
      await write_finance_state(result.state);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ошибка записи' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, stations: prep_station_views(result.state) });
  }

  if (kind === 'config') {
    const b = body as {
      stationId?: string;
      portionG?: number;
      defaultDryG?: number;
      defaultCookedG?: number;
      label?: string;
      enabled?: boolean;
      dryCostPerKg?: number;
      cookedCostPerKg?: number;
    };
    const stationId = String(b.stationId || '');
    if (!stationId) {
      return NextResponse.json({ error: 'нужна станция' }, { status: 400 });
    }
    let next = update_prep_station(state, stationId, {
      ...(b.portionG != null ? { portionG: Number(b.portionG) } : {}),
      ...(b.defaultDryG != null ? { defaultDryG: Number(b.defaultDryG) } : {}),
      ...(b.defaultCookedG != null ? { defaultCookedG: Number(b.defaultCookedG) } : {}),
      ...(b.label != null ? { label: b.label } : {}),
      ...(b.enabled != null ? { enabled: b.enabled } : {}),
    });

    const station = (next.prepStations || []).find((s) => s.id === stationId);
    if (station) {
      next = {
        ...next,
        materials: next.materials.map((m) => {
          if (b.dryCostPerKg != null && m.id === station.dryMaterialId && Number.isFinite(b.dryCostPerKg)) {
            return { ...m, costPerUnit: Math.round(Number(b.dryCostPerKg) * 100) / 100 };
          }
          if (
            b.cookedCostPerKg != null &&
            m.id === station.cookedMaterialId &&
            Number.isFinite(b.cookedCostPerKg)
          ) {
            return { ...m, costPerUnit: Math.round(Number(b.cookedCostPerKg) * 100) / 100 };
          }
          return m;
        }),
      };
    }

    try {
      await write_finance_state(next);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ошибка записи' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, stations: prep_station_views(next) });
  }

  return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
}
