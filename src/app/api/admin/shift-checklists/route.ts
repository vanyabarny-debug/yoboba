import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { moscow_today_iso } from '@/lib/order-number';
import { create_service_client } from '@/lib/supabase/service';
import { is_supabase_configured } from '@/lib/supabase/config';
import { parse_shift_checklist_bundle } from '@/lib/shift-checklist-templates';
import {
  get_shift_checklist_templates,
  save_shift_checklist_templates,
} from '@/lib/shift-checklist-templates-server';
import { list_checklist_proofs } from '@/lib/checklist-proofs-server';
import { get_day_task_templates, proofs_for_day } from '@/lib/day-task-templates-server';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

type task_progress = {
  id: string;
  seller_id: string | null;
  seller_name: string | null;
  spot_id: string | null;
  spot_address: string | null;
  shift_date: string;
  started_at: string | null;
  completed_at: string | null;
  total: number;
  checked: number;
  percent: number;
};

function progress_from(task: {
  id: string;
  seller_id: string | null;
  seller_name: string | null;
  spot_id: string | null;
  spot_address: string | null;
  shift_date: string;
  started_at: string | null;
  completed_at: string | null;
  items: { is_checked: boolean }[];
}): task_progress {
  const total = task.items.length;
  const checked = task.items.filter((i) => i.is_checked).length;
  return {
    id: task.id,
    seller_id: task.seller_id,
    seller_name: task.seller_name,
    spot_id: task.spot_id,
    spot_address: task.spot_address,
    shift_date: task.shift_date,
    started_at: task.started_at,
    completed_at: task.completed_at,
    total,
    checked,
    percent: total ? Math.round((checked / total) * 100) : 0,
  };
}

async function load_progress(day: string) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { opening: [] as task_progress[], day: [] as task_progress[], closing: [] as task_progress[] };
  }
  const supabase = create_service_client();

  async function map_kind(
    table: 'opening_tasks' | 'day_tasks' | 'closing_tasks',
    items_table: 'opening_checklist_items' | 'day_checklist_items' | 'closing_checklist_items',
    fk: 'opening_task_id' | 'day_task_id' | 'closing_task_id'
  ) {
    const { data: tasks } = await supabase.from(table).select('*').eq('shift_date', day);
    if (!tasks?.length) return [] as task_progress[];
    const out: task_progress[] = [];
    for (const row of tasks as Record<string, unknown>[]) {
      const id = String(row.id);
      const { data: items } = await supabase
        .from(items_table)
        .select('is_checked')
        .eq(fk, id);
      out.push(
        progress_from({
          id,
          seller_id: (row.seller_id as string | null) ?? null,
          seller_name: (row.seller_name as string | null) ?? null,
          spot_id: (row.spot_id as string | null) ?? null,
          spot_address: (row.spot_address as string | null) ?? null,
          shift_date: String(row.shift_date),
          started_at: (row.started_at as string | null) ?? null,
          completed_at: (row.completed_at as string | null) ?? null,
          items: (items as { is_checked: boolean }[]) || [],
        })
      );
    }
    return out;
  }

  const [opening, day_tasks, closing] = await Promise.all([
    map_kind('opening_tasks', 'opening_checklist_items', 'opening_task_id'),
    map_kind('day_tasks', 'day_checklist_items', 'day_task_id'),
    map_kind('closing_tasks', 'closing_checklist_items', 'closing_task_id'),
  ]);

  return { opening, day: day_tasks, closing };
}

export async function GET(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const url = new URL(request.url);
  const day = url.searchParams.get('day')?.slice(0, 10) || moscow_today_iso();
  const [bundle, progress, checklist_proofs, timed_tasks, timed_proofs] = await Promise.all([
    get_shift_checklist_templates(),
    load_progress(day),
    list_checklist_proofs(day),
    get_day_task_templates(),
    proofs_for_day(day),
  ]);
  return NextResponse.json({
    bundle,
    day,
    progress,
    checklist_proofs,
    timed_tasks,
    timed_proofs,
  });
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { bundle?: unknown } | null;
  const bundle = parse_shift_checklist_bundle(body?.bundle);
  if (!bundle) {
    return NextResponse.json({ error: 'проверьте пункты и время' }, { status: 400 });
  }
  await save_shift_checklist_templates(bundle);
  return NextResponse.json({ bundle });
}
