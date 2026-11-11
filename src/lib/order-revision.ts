import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';

let pending: Promise<string | null> | null = null;

/**
 * Короткая метка таблицы заказов: число строк и время последней правки.
 * Полный список скачивается только когда метка сменилась.
 */
export async function orders_revision(): Promise<string | null> {
  if (!is_supabase_configured()) return 'local';
  if (pending) return pending;
  pending = read_revision().finally(() => {
    pending = null;
  });
  return pending;
}

async function read_revision(): Promise<string | null> {
  try {
    const admin = create_service_client();
    const [count_res, latest] = await Promise.all([
      admin.from('orders').select('id', { count: 'exact', head: true }),
      admin
        .from('orders')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (count_res.error || latest.error) return null;
    return `${count_res.count ?? 0}:${latest.data?.updated_at ?? ''}`;
  } catch {
    return null;
  }
}
