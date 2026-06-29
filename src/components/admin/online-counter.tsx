'use client';

import { useEffect, useState } from 'react';
import { create_client } from '@/lib/supabase/client';

export default function online_counter() {
  const [count, set_count] = useState(0);

  useEffect(() => {
    const supabase = create_client();

    async function refresh() {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('cart_items')
        .select('user_id')
        .gte('updated_at', since);

      const unique = new Set((data || []).map((r) => r.user_id));
      set_count(unique.size);
    }

    refresh();

    const channel = supabase
      .channel('online-users')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => refresh()
      )
      .subscribe();

    const interval = setInterval(refresh, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <p className="text-sm text-neutral-500">онлайн сейчас</p>
      <p className="text-3xl font-bold font-mono tabular-nums text-accent mt-1">{count}</p>
      <p className="text-xs text-neutral-400 mt-1">активные корзины за 5 мин</p>
    </div>
  );
}
