'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { is_combo_item } from '@/lib/combo';
import { apply_published_menu_store, get_menu_store, subscribe_menu_store } from '@/lib/menu-store';
import { configured_unit_price } from '@/lib/product-details';
import type { menu_item } from '@/lib/types';

/** цена позиции по текущему меню; если позиции нет в меню — null */
export function useCatalogUnit() {
  const [items, set_items] = useState<menu_item[]>(() => get_menu_store().items);

  useEffect(() => {
    const reload = () => set_items(get_menu_store().items);
    reload();
    void fetch('/api/menu', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { store?: ReturnType<typeof get_menu_store> | null } | null) => {
        if (!body?.store?.items?.length) return;
        apply_published_menu_store(body.store);
        reload();
      })
      .catch(() => {});
    return subscribe_menu_store(reload);
  }, []);

  const by_id = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  return useCallback(
    (line: { menu_id?: string; volume?: string }): number | null => {
      const item = line.menu_id ? by_id.get(line.menu_id) : undefined;
      if (!item) return null;
      if (is_combo_item(item)) return Math.max(0, Math.round(item.price));
      return Math.max(0, Math.round(configured_unit_price(item, line.volume || null, 0)));
    },
    [by_id]
  );
}
