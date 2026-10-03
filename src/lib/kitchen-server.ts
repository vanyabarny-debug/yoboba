import { default_menu_items } from '@/lib/menu-store';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { read_published_menu } from '@/lib/menu-catalog-server';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import type { menu_item, order } from '@/lib/types';

let menu_map_cache: { at: number; map: Map<string, menu_item> } | null = null;

export async function load_menu_map(): Promise<Map<string, menu_item>> {
  if (menu_map_cache && Date.now() - menu_map_cache.at < 15_000) {
    return menu_map_cache.map;
  }

  const map = new Map<string, menu_item>();
  const published = await read_published_menu();
  const source = published?.items?.length ? published.items : default_menu_items;

  for (const item of source) {
    map.set(item.id, {
      ...item,
      prep_minutes:
        typeof item.prep_minutes === 'number' && item.prep_minutes > 0
          ? item.prep_minutes
          : DEFAULT_PREP_MINUTES,
    });
  }

  menu_map_cache = { at: Date.now(), map };
  return map;
}

export async function load_active_orders(): Promise<order[]> {
  const merged: order[] = [];
  const seen = new Set<string>();

  for (const o of await get_demo_orders(true)) {
    if (!seen.has(o.id)) {
      seen.add(o.id);
      merged.push({
        ...o,
        is_paid:
          Boolean(o.is_paid) ||
          o.payment_type === 'bonus' ||
          (o.payment_type === 'online' && Number(o.total_price) === 0),
      });
    }
  }

  if (is_supabase_configured()) {
    const supabase = create_service_client();
    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['new', 'preparing', 'ready'])
      .order('pickup_time', { ascending: true });

    const rows = (data as order[]) || [];
    const profile_map = new Map<string, { name?: string | null; phone?: string | null }>();
    const ids = [...new Set(rows.map((o) => o.user_id).filter(Boolean))];

    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, phone')
        .in('id', ids);
      for (const p of profiles || []) {
        profile_map.set(p.id, p);
      }
    }

    for (const o of rows) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const profile = profile_map.get(o.user_id);
      const is_paid =
        Boolean(o.is_paid) ||
        o.payment_type === 'bonus' ||
        (o.payment_type === 'online' && Number(o.total_price) === 0);
      merged.push({
        ...o,
        is_paid,
        customer_name: (o.customer_name || profile?.name || '').trim() || 'гость',
        customer_phone: o.customer_phone || profile?.phone || null,
      });
    }
  }

  // для кухни — по времени выдачи; доска бариста пересортирует «новые сверху»
  return merged.sort(
    (a, b) => new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime()
  );
}

