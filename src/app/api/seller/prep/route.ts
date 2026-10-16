import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { mutate_finance_state, read_finance_state } from '@/lib/finance/finance-server';
import {
  apply_prep_cook,
  apply_prep_discard,
  apply_prep_marinade,
  apply_prep_reconcile,
  apply_prep_still_have,
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
  if (healed !== state) {
    try {
      state = await mutate_finance_state((fresh) => {
        const again = heal_prep_batch_scales(fresh);
        if (again === fresh) return { state: null, value: fresh };
        return { state: again, value: again };
      });
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

  if (
    kind === 'cook' ||
    kind === 'discard' ||
    kind === 'marinade' ||
    kind === 'reconcile' ||
    kind === 'still_have'
  ) {
    try {
      const saved = await mutate_finance_state<
        | { ok: false; error: string }
        | { ok: true; stations: ReturnType<typeof prep_station_views>; message: string }
      >((state) => {
        if (kind === 'cook') {
          const b = body as { stationId?: string; dryG?: number; note?: string };
          const result = apply_prep_cook(state, {
            stationId: String(b.stationId || ''),
            dryG: Number(b.dryG),
            note: b.note,
            actor,
          });
          if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
          return {
            state: result.state,
            value: {
              ok: true as const,
              stations: prep_station_views(result.state),
              message: result.message,
            },
          };
        }
        if (kind === 'marinade') {
          const stationId = String((body as { stationId?: string }).stationId || '');
          const result = apply_prep_marinade(state, { stationId, actor });
          if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
          return {
            state: result.state,
            value: { ok: true as const, stations: prep_station_views(result.state), message: '' },
          };
        }
        if (kind === 'still_have') {
          const b = body as { stationId?: string; cookedG?: number };
          const result = apply_prep_still_have(state, {
            stationId: String(b.stationId || ''),
            cookedG: Number(b.cookedG),
            actor,
          });
          if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
          return {
            state: result.state,
            value: {
              ok: true as const,
              stations: prep_station_views(result.state),
              message: result.message,
            },
          };
        }
        if (kind === 'reconcile') {
          const b = body as { stationId?: string; cookedG?: number; dryG?: number | null };
          const result = apply_prep_reconcile(state, {
            stationId: String(b.stationId || ''),
            cookedG: Number(b.cookedG),
            dryG: typeof b.dryG === 'number' ? b.dryG : null,
            actor,
          });
          if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
          return {
            state: result.state,
            value: {
              ok: true as const,
              stations: prep_station_views(result.state),
              message: result.message,
            },
          };
        }
        const stationId = String((body as { stationId?: string }).stationId || '');
        const note = (body as { note?: string }).note;
        const result = apply_prep_discard(state, { stationId, note, actor });
        if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
        return {
          state: result.state,
          value: { ok: true as const, stations: prep_station_views(result.state), message: '' },
        };
      });
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
      return NextResponse.json({ ok: true, stations: saved.stations, message: saved.message });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ошибка записи' },
        { status: 500 }
      );
    }
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
    try {
      const saved = await mutate_finance_state((state) => {
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
        return { state: next, value: prep_station_views(next) };
      });
      return NextResponse.json({ ok: true, stations: saved });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ошибка записи' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
}
