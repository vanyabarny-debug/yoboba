import { NextRequest, NextResponse } from 'next/server';
import { create_service_client } from '@/lib/supabase/service';
import { is_supabase_configured } from '@/lib/supabase/config';
import { moscow_today_iso } from '@/lib/order-number';
import { is_opening_complete, type opening_task } from '@/lib/opening-checklist';
import {
  checklist_items_for_new_task,
  enrich_checklist_items,
  template_proof_for_item,
} from '@/lib/checklist-task-enrich';
import { proofs_map_for_task } from '@/lib/checklist-proofs-server';
import { send_push_to_admins } from '@/lib/opening-notify';

/** GET /api/seller/opening-task - получить задачу открытия на сегодня */
export async function GET(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'база данных не настроена' },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const seller_id = url.searchParams.get('seller_id');
  const spot_id = url.searchParams.get('spot_id') || null;
  const shift_date = url.searchParams.get('shift_date') || moscow_today_iso();

  if (!seller_id) {
    return NextResponse.json(
      { error: 'seller_id обязателен' },
      { status: 400 }
    );
  }

  const supabase = create_service_client();

  // Найти задачу открытия по seller_id и дате (spot_id может быть null до открытия смены)
  let query = supabase
    .from('opening_tasks')
    .select('*')
    .eq('shift_date', shift_date)
    .or(`seller_id.eq.${seller_id},spot_id.eq.${spot_id || 'null'}`)
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: existing_tasks, error: fetch_error } = await query;

  if (fetch_error) {
    return NextResponse.json(
      { error: 'не удалось загрузить задачу' },
      { status: 500 }
    );
  }

  const existing_task = existing_tasks?.[0] || null;
  let task_id = existing_task?.id;

  // Если задачи нет — создать
  if (!existing_task) {
    const { data: new_task, error: create_error } = await supabase
      .from('opening_tasks')
      .insert({
        spot_id: spot_id || null,
        shift_date,
        seller_id,
      })
      .select()
      .single();

    if (create_error || !new_task) {
      return NextResponse.json(
        { error: 'не удалось создать задачу' },
        { status: 500 }
      );
    }

    task_id = new_task.id;

    // Создать дефолтные пункты чек-листа
    const lines = await checklist_items_for_new_task('opening');
    const items = lines.map((text, index) => ({
      opening_task_id: task_id,
      item_order: index + 1,
      item_text: text,
      is_checked: false,
    }));

    await supabase.from('opening_checklist_items').insert(items);
  } else if (spot_id && !existing_task.spot_id) {
    // Если смена открылась, обновить spot_id в существующей задаче
    await supabase
      .from('opening_tasks')
      .update({ spot_id })
      .eq('id', task_id);
  }

  // Загрузить задачу с пунктами
  const { data: task_data } = await supabase
    .from('opening_tasks')
    .select('*')
    .eq('id', task_id)
    .single();

  const { data: items_data } = await supabase
    .from('opening_checklist_items')
    .select('*')
    .eq('opening_task_id', task_id)
    .order('item_order');

  const base_items = (items_data || []).map((item: any) => ({
    id: item.id,
    item_order: item.item_order,
    item_text: item.item_text,
    is_checked: item.is_checked,
    checked_at: item.checked_at,
    checked_by: item.checked_by,
  }));
  const enriched = await enrich_checklist_items(
    'opening',
    task_id as string,
    task_data?.shift_date || shift_date,
    base_items
  );

  const task: opening_task = {
    id: task_data?.id || '',
    spot_id: task_data?.spot_id || spot_id || '',
    spot_address: task_data?.spot_address || null,
    shift_date: task_data?.shift_date || shift_date,
    seller_id: task_data?.seller_id || seller_id,
    seller_name: task_data?.seller_name || null,
    started_at: task_data?.started_at || null,
    completed_at: task_data?.completed_at || null,
    items: enriched,
  };

  return NextResponse.json({ task });
}

/** PATCH /api/seller/opening-task - обновить пункты чек-листа */
export async function PATCH(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'база данных не настроена' },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    task_id: string;
    item_id: string;
    is_checked: boolean;
    seller_id?: string;
    seller_name?: string;
  };

  if (!body.task_id || !body.item_id) {
    return NextResponse.json(
      { error: 'task_id и item_id обязательны' },
      { status: 400 }
    );
  }

  const supabase = create_service_client();

  const { data: item_row } = await supabase
    .from('opening_checklist_items')
    .select('item_order')
    .eq('id', body.item_id)
    .single();

  if (body.is_checked && item_row?.item_order) {
    const proof = await template_proof_for_item('opening', item_row.item_order);
    if (proof !== 'none') {
      const { data: task_row } = await supabase
        .from('opening_tasks')
        .select('shift_date')
        .eq('id', body.task_id)
        .single();
      const shift_date = task_row?.shift_date || moscow_today_iso();
      const proofs = await proofs_map_for_task('opening', body.task_id, shift_date);
      if (!proofs.has(body.item_id)) {
        return NextResponse.json({ error: 'сначала приложите фото или видео' }, { status: 400 });
      }
    }
  }

  // Обновить пункт
  const update_data: any = {
    is_checked: body.is_checked,
  };

  if (body.is_checked) {
    update_data.checked_at = new Date().toISOString();
    update_data.checked_by = body.seller_name || body.seller_id || null;
  } else {
    update_data.checked_at = null;
    update_data.checked_by = null;
  }

  await supabase
    .from('opening_checklist_items')
    .update(update_data)
    .eq('id', body.item_id);

  // Загрузить обновленную задачу
  const { data: task_data } = await supabase
    .from('opening_tasks')
    .select('*')
    .eq('id', body.task_id)
    .single();

  const { data: items_data } = await supabase
    .from('opening_checklist_items')
    .select('*')
    .eq('opening_task_id', body.task_id)
    .order('item_order');

  const base_items = (items_data || []).map((item: any) => ({
    id: item.id,
    item_order: item.item_order,
    item_text: item.item_text,
    is_checked: item.is_checked,
    checked_at: item.checked_at,
    checked_by: item.checked_by,
  }));
  const enriched = await enrich_checklist_items(
    'opening',
    body.task_id,
    task_data?.shift_date || moscow_today_iso(),
    base_items
  );

  const task: opening_task = {
    id: task_data?.id || body.task_id,
    spot_id: task_data?.spot_id || '',
    spot_address: task_data?.spot_address || null,
    shift_date: task_data?.shift_date || '',
    seller_id: task_data?.seller_id || null,
    seller_name: task_data?.seller_name || null,
    started_at: task_data?.started_at || null,
    completed_at: task_data?.completed_at || null,
    items: enriched,
  };

  // Проверить, завершен ли чек-лист
  const was_complete = task_data?.completed_at != null;
  const is_complete = is_opening_complete(task);

  if (is_complete && !was_complete) {
    // Отметить задачу как завершенную
    await supabase
      .from('opening_tasks')
      .update({
        completed_at: new Date().toISOString(),
        seller_id: body.seller_id || task_data?.seller_id,
        seller_name: body.seller_name || task_data?.seller_name,
      })
      .eq('id', body.task_id);

    // Получить всех админов
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'admin');

    // Создать уведомления для админов
    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: any) => ({
        opening_task_id: body.task_id,
        admin_id: admin.id,
        is_read: false,
      }));

      await supabase
        .from('opening_notifications')
        .insert(notifications);

      // Отправить push-уведомления админам
      await send_push_to_admins({
        title: 'Открытие завершено',
        body: `${task.spot_address || 'Точка'} — открытие завершил ${body.seller_name || 'бариста'}`,
        url: '/admin',
        spot_address: task.spot_address,
        completed_at: new Date().toISOString(),
      });
    }

    task.completed_at = new Date().toISOString();
  }

  return NextResponse.json({ task });
}

/** POST /api/seller/opening-task - начать выполнение открытия */
export async function POST(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'база данных не настроена' },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    task_id: string;
    seller_id: string;
    seller_name: string;
  };

  if (!body.task_id) {
    return NextResponse.json(
      { error: 'task_id обязателен' },
      { status: 400 }
    );
  }

  const supabase = create_service_client();

  // Отметить начало выполнения
  await supabase
    .from('opening_tasks')
    .update({
      started_at: new Date().toISOString(),
      seller_id: body.seller_id,
      seller_name: body.seller_name,
    })
    .eq('id', body.task_id);

  return NextResponse.json({ success: true });
}
