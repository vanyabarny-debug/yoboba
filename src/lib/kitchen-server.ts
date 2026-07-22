import { default_menu_items } from '@/lib/menu-store';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import type { menu_item, order } from '@/lib/types';

export async function load_menu_map(): Promise<Map<string, menu_item>> {
  const map = new Map<string, menu_item>();

  for (const item of default_menu_items) {
    map.set(item.id, {
      ...item,
      prep_minutes: item.prep_minutes ?? DEFAULT_PREP_MINUTES,
    });
  }

  if (is_supabase_configured()) {
    const supabase = create_service_client();
    const { data } = await supabase.from('menu').select('*');
    for (const row of (data as menu_item[]) || []) {
      const fallback = map.get(row.id);
      map.set(row.id, {
        ...row,
        prep_minutes:
          typeof row.prep_minutes === 'number' && row.prep_minutes > 0
            ? row.prep_minutes
            : fallback?.prep_minutes ?? DEFAULT_PREP_MINUTES,
      });
    }
  }

  return map;
}

export async function load_active_orders(): Promise<order[]> {
  const merged: order[] = [];
  const seen = new Set<string>();

  for (const o of await get_demo_orders(true)) {
    if (!seen.has(o.id)) {
      seen.add(o.id);
      merged.push(o);
    }
  }

  if (is_supabase_configured()) {
    const supabase = create_service_client();
    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['new', 'preparing', 'ready'])
      .order('pickup_time', { ascending: true });
    for (const o of (data as order[]) || []) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        merged.push(o);
      }
    }
  }

  return merged.sort(
    (a, b) => new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime()
  );
}
