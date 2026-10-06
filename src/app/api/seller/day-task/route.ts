import { NextRequest, NextResponse } from 'next/server';
import { create_service_client } from '@/lib/supabase/service';
import { is_supabase_configured } from '@/lib/supabase/config';
import { moscow_today_iso } from '@/lib/order-number';
import { is_day_complete, type day_checklist_task, type day_checklist_item } from '@/lib/day-checklist';
import {
  checklist_items_for_new_task,
  enrich_checklist_items,
  template_proof_for_item,
} from '@/lib/checklist-task-enrich';
import { proofs_map_for_task } from '@/lib/checklist-proofs-server';
import { send_push_to_admins } from '@/lib/opening-notify';

type task_row = {
  id: string;
  spot_id: string | null;
  spot_address: string | null;
  shift_date: string;
  seller_id: string | null;
  seller_name: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type item_row = {
  id: string;
  item_order: number;
  item_text: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
};

function not_configured() {
  return NextResponse.json({ error: 'база данных не настроена' }, { status: 503 });
}

function to_task(
  row: task_row | null,
  items: item_row[] | null,
  fallback: { id: string; spot_id?: string | null; shift_date?: string; seller_id?: string | null }
): day_checklist_task {
  return {
    id: row?.id || fallback.id,
    spot_id: row?.spot_id || fallback.spot_id || '',
    spot_address: row?.spot_address || null,
    shift_date: row?.shift_date || fallback.shift_date || '',
    seller_id: row?.seller_id || fallback.seller_id || null,
    seller_name: row?.seller_name || null,
    started_at: row?.started_at || null,
    completed_at: row?.completed_at || null,
    items: (items || []).map(
      (item): day_checklist_item => ({
        id: item.id,
        item_order: item.item_order,
        item_text: item.item_text,
        is_checked: item.is_checked,
        checked_at: item.checked_at,
        checked_by: item.checked_by,
      })
    ),
  };
}

async function with_enriched(task: day_checklist_task): Promise<day_checklist_task> {
  const items = await enrich_checklist_items('day', task.id, task.shift_date, task.items);
  return { ...task, items };
}

async function load_task(supabase: ReturnType<typeof create_service_client>, task_id: string) {
  const { data: task_data } = await supabase.from('day_tasks').select('*').eq('id', task_id).single();
  const { data: items_data } = await supabase
    .from('day_checklist_items')
    .select('*')
    .eq('day_task_id', task_id)
    .order('item_order');
  return { task_data: (task_data as task_row | null) ?? null, items_data: (items_data as item_row[] | null) ?? null };
}

/** GET /api/seller/day-task — задача дня на сегодня */
export async function GET(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return not_configured();

  const url = new URL(request.url);
  const seller_id = url.searchParams.get('seller_id');
  const spot_id = url.searchParams.get('spot_id') || null;
  const shift_date = url.searchParams.get('shift_date') || moscow_today_iso();

  if (!seller_id) {
    return NextResponse.json({ error: 'seller_id обязателен' }, { status: 400 });
  }

  const supabase = create_service_client();

  const { data: existing_tasks, error: fetch_error } = await supabase
    .from('day_tasks')
    .select('*')
    .eq('shift_date', shift_date)
    .or(`seller_id.eq.${seller_id},spot_id.eq.${spot_id || 'null'}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetch_error) {
    console.error('day-task load', fetch_error.code, fetch_error.message);
    if (/does not exist|42P01|PGRST205|could not find the table/i.test(`${fetch_error.code} ${fetch_error.message}`)) {
      return NextResponse.json(
        { error: 'таблицы дневного чек-листа ещё нет — выполните supabase/day-checklist.sql' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'не удалось загрузить задачу' }, { status: 500 });
  }

  const existing_task = (existing_tasks?.[0] as task_row | undefined) || null;
  let task_id = existing_task?.id;

  if (!existing_task) {
    const { data: new_task, error: create_error } = await supabase
      .from('day_tasks')
      .insert({ spot_id: spot_id || null, shift_date, seller_id })
      .select()
      .single();

    if (create_error || !new_task) {
      return NextResponse.json({ error: 'не удалось создать задачу' }, { status: 500 });
    }

    task_id = (new_task as task_row).id;

    const lines = await checklist_items_for_new_task('day');
    const items = lines.map((text, index) => ({
      day_task_id: task_id,
      item_order: index + 1,
      item_text: text,
      is_checked: false,
    }));

    await supabase.from('day_checklist_items').insert(items);
  } else if (spot_id && !existing_task.spot_id) {
    await supabase.from('day_tasks').update({ spot_id }).eq('id', task_id);
  }

  const { task_data, items_data } = await load_task(supabase, task_id as string);
  const task = await with_enriched(
    to_task(task_data, items_data, { id: task_id as string, spot_id, shift_date, seller_id })
  );

  return NextResponse.json({ task });
}

/** PATCH /api/seller/day-task — отметить пункт (в любом порядке) */
export async function PATCH(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return not_configured();

  const body = (await request.json()) as {
    task_id: string;
    item_id: string;
    is_checked: boolean;
    seller_id?: string;
    seller_name?: string;
  };

  if (!body.task_id || !body.item_id) {
    return NextResponse.json({ error: 'task_id и item_id обязательны' }, { status: 400 });
  }

  const supabase = create_service_client();
  const now = new Date().toISOString();

  const { data: item_row } = await supabase
    .from('day_checklist_items')
    .select('item_order')
    .eq('id', body.item_id)
    .single();

  if (body.is_checked && item_row?.item_order) {
    const proof = await template_proof_for_item('day', item_row.item_order);
    if (proof !== 'none') {
      const { data: task_row } = await supabase
        .from('day_tasks')
        .select('shift_date')
        .eq('id', body.task_id)
        .single();
      const shift_date = task_row?.shift_date || moscow_today_iso();
      const proofs = await proofs_map_for_task('day', body.task_id, shift_date);
      if (!proofs.has(body.item_id)) {
        return NextResponse.json({ error: 'сначала приложите фото или видео' }, { status: 400 });
      }
    }
  }

  await supabase
    .from('day_checklist_items')
    .update(
      body.is_checked
        ? { is_checked: true, checked_at: now, checked_by: body.seller_name || body.seller_id || null }
        : { is_checked: false, checked_at: null, checked_by: null }
    )
    .eq('id', body.item_id);

  const { task_data, items_data } = await load_task(supabase, body.task_id);
  const task = to_task(task_data, items_data, { id: body.task_id });

  // первый отмеченный пункт запускает задачу
  if (!task_data?.started_at && body.is_checked) {
    await supabase
      .from('day_tasks')
      .update({
        started_at: now,
        seller_id: body.seller_id || task_data?.seller_id,
        seller_name: body.seller_name || task_data?.seller_name,
      })
      .eq('id', body.task_id);
    task.started_at = now;
  }

  const was_complete = task_data?.completed_at != null;
  const is_complete = is_day_complete(task);

  if (is_complete && !was_complete) {
    await supabase
      .from('day_tasks')
      .update({
        completed_at: now,
        seller_id: body.seller_id || task_data?.seller_id,
        seller_name: body.seller_name || task_data?.seller_name,
      })
      .eq('id', body.task_id);

    const { data: admins } = await supabase.from('profiles').select('id, name').eq('role', 'admin');

    if (admins && admins.length > 0) {
      const notifications = (admins as { id: string }[]).map((admin) => ({
        day_task_id: body.task_id,
        admin_id: admin.id,
        is_read: false,
      }));

      await supabase.from('day_notifications').insert(notifications);

      await send_push_to_admins({
        title: 'Дневной чек-лист закрыт',
        body: `${task.spot_address || 'Точка'} — дневные дела выполнил ${body.seller_name || 'бариста'}`,
        url: '/admin',
        spot_address: task.spot_address,
        completed_at: now,
      });
    }

    task.completed_at = now;
  } else if (!is_complete && was_complete) {
    // сняли галочку — чек-лист снова в работе
    await supabase.from('day_tasks').update({ completed_at: null }).eq('id', body.task_id);
    task.completed_at = null;
  }

  return NextResponse.json({ task: await with_enriched(task) });
}

/** POST /api/seller/day-task — начать выполнение */
export async function POST(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return not_configured();

  const body = (await request.json()) as {
    task_id: string;
    seller_id: string;
    seller_name: string;
  };

  if (!body.task_id) {
    return NextResponse.json({ error: 'task_id обязателен' }, { status: 400 });
  }

  const supabase = create_service_client();

  await supabase
    .from('day_tasks')
    .update({
      started_at: new Date().toISOString(),
      seller_id: body.seller_id,
      seller_name: body.seller_name,
    })
    .eq('id', body.task_id);

  return NextResponse.json({ success: true });
}
