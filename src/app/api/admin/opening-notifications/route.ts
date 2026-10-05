import { NextRequest, NextResponse } from 'next/server';
import { create_service_client } from '@/lib/supabase/service';
import { is_supabase_configured } from '@/lib/supabase/config';

/** GET /api/admin/opening-notifications - получить уведомления о завершенных открытиях */
export async function GET(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'база данных не настроена' },
      { status: 503 }
    );
  }

  const supabase = create_service_client();

  // Получить уведомления за последние 7 дней
  const seven_days_ago = new Date();
  seven_days_ago.setDate(seven_days_ago.getDate() - 7);

  const { data: notifications, error } = await supabase
    .from('opening_notifications')
    .select(
      `
      id,
      is_read,
      created_at,
      opening_tasks (
        id,
        spot_address,
        shift_date,
        seller_name,
        completed_at
      )
    `
    )
    .gte('created_at', seven_days_ago.toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: 'не удалось загрузить уведомления' },
      { status: 500 }
    );
  }

  return NextResponse.json({ notifications: notifications || [] });
}

/** PATCH /api/admin/opening-notifications - отметить уведомление прочитанным */
export async function PATCH(request: NextRequest) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'база данных не настроена' },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    notification_id: string;
    is_read: boolean;
  };

  if (!body.notification_id) {
    return NextResponse.json(
      { error: 'notification_id обязателен' },
      { status: 400 }
    );
  }

  const supabase = create_service_client();

  await supabase
    .from('opening_notifications')
    .update({ is_read: body.is_read })
    .eq('id', body.notification_id);

  return NextResponse.json({ success: true });
}
