/** Уведомления админов о завершении открытия */

import { create_service_client } from '@/lib/supabase/service';
import { is_supabase_configured } from '@/lib/supabase/config';
import { send_push_to_user_id } from '@/lib/push-server';

type opening_notification_payload = {
  title: string;
  body: string;
  url: string;
  spot_address: string | null;
  completed_at: string;
};

/** Отправить push-уведомления всем админам */
export async function send_push_to_admins(payload: opening_notification_payload) {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const supabase = create_service_client();

  // Получить всех админов
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (!admins || admins.length === 0) {
    return;
  }

  // Отправить уведомление каждому админу
  const push_payload = {
    title: payload.title,
    body: payload.body,
    tag: `opening-complete-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: { url: payload.url },
  };

  for (const admin of admins) {
    try {
      await send_push_to_user_id(admin.id, push_payload);
    } catch (error) {
      console.warn(`Failed to send push to admin ${admin.id}:`, error);
    }
  }
}
