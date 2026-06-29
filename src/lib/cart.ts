import { create_client } from '@/lib/supabase/client';
import type { menu_item } from '@/lib/types';

export type cart_item = {
  menu_id: string;
  quantity: number;
};

export async function add_to_cart(user_id: string, item: menu_item, qty: number) {
  const supabase = create_client();
  const { data: existing } = await supabase
    .from('cart_items')
    .select('quantity')
    .eq('user_id', user_id)
    .eq('menu_id', item.id)
    .maybeSingle();

  const new_qty = (existing?.quantity || 0) + qty;
  return upsert_cart_item(user_id, item.id, new_qty);
}

export async function upsert_cart_item(user_id: string, menu_id: string, quantity: number) {
  const supabase = create_client();

  if (quantity <= 0) {
    return supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user_id)
      .eq('menu_id', menu_id);
  }

  return supabase.from('cart_items').upsert(
    {
      user_id,
      menu_id,
      quantity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,menu_id' }
  );
}

export async function clear_cart(user_id: string) {
  const supabase = create_client();
  return supabase.from('cart_items').delete().eq('user_id', user_id);
}

export async function get_cart_items(user_id: string) {
  const supabase = create_client();
  return supabase
    .from('cart_items')
    .select('id, menu_id, quantity, menu:menu_id(id, name, price, image_url)')
    .eq('user_id', user_id);
}
