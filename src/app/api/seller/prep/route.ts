import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { mutate_finance_state, read_finance_state } from '@/lib/finance/finance-server';
import { bind_spot, commit_spot, resolve_stock_spot } from '@/lib/finance/model';
import {
  apply_prep_cook,
  apply_prep_discard,
  apply_prep_marinade,
  apply_prep_reconcile,
  apply_prep_still_have,
  expire_stale_prep,
  heal_prep_batch_scales,
  heal_prep_cooked_holes,
  prep_station_views,
  tapioca_dry_choices,
  update_prep_station,
} from '@/lib/finance/prep-stations';

export const dynamic = 'force-dynamic';

async function require_actor() {
  const actor = await staff_actor();
  if (!actor) return null;
  return actor;
}

function spot_of(raw: unknown) {
  return resolve_stock_spot(typeof raw === 'string' ? raw : '');
}

export async function GET(request: Request) {
  if (!(await require_actor())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const spot = spot_of(new URL(request.url).searchParams.get('spot_id'));
  let full = await read_finance_state();
  const view = bind_spot(full, spot);
  const healed = expire_stale_prep(heal_prep_cooked_holes(heal_prep_batch_scales(view)));
  if (healed !== view) {
    try {
      full = await mutate_finance_state((fresh) => {
        const again_view = bind_spot(fresh, spot);
        const again = expire_stale_prep(heal_prep_cooked_holes(heal_prep_batch_scales(again_view)));
        if (again === again_view) return { state: null, value: fresh };
        const committed = commit_spot(fresh, spot, again);
        return { state: committed, value: committed };
      });
    } catch {
      full = commit_spot(full, spot, healed);
    }
  }
  const ready = bind_spot(full, spot);
  return NextResponse.json(
    { stations: prep_station_views(ready), tapioca: tapioca_dry_choices(ready) },
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
  const spot = spot_of((body as { spot_id?: unknown }).spot_id);

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
        | {
            ok: true;
            stations: ReturnType<typeof prep_station_views>;
            tapioca: ReturnType<typeof tapioca_dry_choices>;
            message: string;
          }
      >((full) => {
        const state = bind_spot(full, spot);
        if (kind === 'cook') {
          const b = body as {
            stationId?: string;
            dryG?: number;
            actualG?: number | null;
            lines?: { materialId?: string; grams?: number }[];
            note?: string;
          };
          const lines = Array.isArray(b.lines)
            ? b.lines.map((line) => ({
                materialId: String(line?.materialId || ''),
                grams: Number(line?.grams),
              }))
            : undefined;
          const result = apply_prep_cook(state, {
            stationId: String(b.stationId || ''),
            dryG: b.dryG == null ? undefined : Number(b.dryG),
            lines,
            actualG: b.actualG == null ? null : Number(b.actualG),
            note: b.note,
            actor,
          });
          if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
          return {
            state: commit_spot(full, spot, result.state),
            value: {
              ok: true as const,
              stations: prep_station_views(result.state),
              tapioca: tapioca_dry_choices(result.state),
              message: result.message,
            },
          };
        }
        if (kind === 'marinade') {
          const stationId = String((body as { stationId?: string }).stationId || '');
          const result = apply_prep_marinade(state, { stationId, actor });
          if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
          return {
            state: commit_spot(full, spot, result.state),
            value: { ok: true as const, stations: prep_station_views(result.state),
              tapioca: tapioca_dry_choices(result.state), message: '' },
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
            state: commit_spot(full, spot, result.state),
            value: {
              ok: true as const,
              stations: prep_station_views(result.state),
              tapioca: tapioca_dry_choices(result.state),
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
            state: commit_spot(full, spot, result.state),
            value: {
              ok: true as const,
              stations: prep_station_views(result.state),
              tapioca: tapioca_dry_choices(result.state),
              message: result.message,
            },
          };
        }
        const stationId = String((body as { stationId?: string }).stationId || '');
        const note = (body as { note?: string }).note;
        const result = apply_prep_discard(state, { stationId, note, actor });
        if (!result.ok) return { state: null, value: { ok: false as const, error: result.error } };
        return {
          state: commit_spot(full, spot, result.state),
          value: { ok: true as const, stations: prep_station_views(result.state),
              tapioca: tapioca_dry_choices(result.state), message: '' },
        };
      });
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
      return NextResponse.json({
        ok: true,
        stations: saved.stations,
        tapioca: saved.tapioca,
        message: saved.message,
      });
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
      const saved = await mutate_finance_state((full) => {
        const state = bind_spot(full, spot);
        const next = update_prep_station(state, stationId, {
          ...(b.portionG != null ? { portionG: Number(b.portionG) } : {}),
          ...(b.defaultDryG != null ? { defaultDryG: Number(b.defaultDryG) } : {}),
          ...(b.defaultCookedG != null ? { defaultCookedG: Number(b.defaultCookedG) } : {}),
          ...(b.label != null ? { label: b.label } : {}),
          ...(b.enabled != null ? { enabled: b.enabled } : {}),
        });
        return {
          state: commit_spot(full, spot, next),
          value: { stations: prep_station_views(next), tapioca: tapioca_dry_choices(next) },
        };
      });
      return NextResponse.json({ ok: true, stations: saved.stations, tapioca: saved.tapioca });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ошибка записи' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
}
