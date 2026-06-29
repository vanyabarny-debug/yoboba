'use client';

import { useEffect, useState } from 'react';
import { create_client } from '@/lib/supabase/client';
import type { live_cart_row } from '@/lib/types';

export default function live_carts() {
  const [rows, set_rows] = useState<live_cart_row[]>([]);

  useEffect(() => {
    const supabase = create_client();

    async function load() {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('cart_items')
        .select('id, user_id, quantity, updated_at, menu:menu_id(id, name, price, category)')
        .gte('updated_at', since)
        .order('updated_at', { ascending: false });

      set_rows((data as unknown as live_cart_row[]) || []);
    }

    load();

    const channel = supabase
      .channel('live-carts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items' },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const grouped = rows.reduce<Record<string, live_cart_row[]>>((acc, row) => {
    if (!acc[row.user_id]) acc[row.user_id] = [];
    acc[row.user_id].push(row);
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <h3 className="font-semibold mb-3">live-корзины</h3>
      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-neutral-400">пока пусто</p>
      ) : (
        <ul className="space-y-3 max-h-64 overflow-y-auto">
          {Object.entries(grouped).map(([uid, items]) => (
            <li key={uid} className="bg-surface rounded-xl p-3">
              <p className="text-xs text-neutral-400 mb-1">
                клиент {uid.slice(0, 8)}…
              </p>
              <ul className="text-sm space-y-0.5">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>{item.menu?.name || '—'}</span>
                    <span className="text-neutral-500">×{item.quantity}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
