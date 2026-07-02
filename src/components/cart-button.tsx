'use client';

import { useEffect, useState } from 'react';
import { create_client } from '@/lib/supabase/client';
import { upsert_cart_item } from '@/lib/cart';
import type { menu_item } from '@/lib/types';

type props = {
  user_id: string | null;
};

export default function cart_button({ user_id }: props) {
  const [count, set_count] = useState(0);

  useEffect(() => {
    if (!user_id) return;
    const supabase = create_client();

    async function load() {
      const { data } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('user_id', user_id);
      const total = (data || []).reduce((s, r) => s + r.quantity, 0);
      set_count(total);
    }
    load();

    const channel = supabase
      .channel(`cart-${user_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${user_id}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user_id]);

  if (!user_id) return null;

  return (
    <button
      type="button"
      className="fixed bottom-4 right-4 mobile-fab-offset md:bottom-6 md:right-6 z-40 rounded-pill bg-accent text-accent-foreground px-5 py-3 shadow-soft font-medium flex items-center gap-2"
    >
      корзина
      {count > 0 && (
        <span className="bg-white text-accent text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}

export async function add_to_cart(user_id: string, item: menu_item, qty: number) {
  const supabase = create_client();
  const { data: existing } = await supabase
    .from('cart_items')
    .select('quantity')
    .eq('user_id', user_id)
    .eq('menu_id', item.id)
    .maybeSingle();

  const new_qty = (existing?.quantity || 0) + qty;
  await upsert_cart_item(user_id, item.id, new_qty);
}
