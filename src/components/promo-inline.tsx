'use client';

import { createElement } from 'react';
import type { promo_banner } from '@/lib/types';
import promo_card from '@/components/promo-card';

type props = {
  promos: promo_banner[];
  on_promo_click: (promo: promo_banner) => void;
};

export default function promo_inline({ promos, on_promo_click }: props) {
  if (!promos.length) return null;

  return (
    <div className="min-[1024px]:hidden mt-5 mb-2">
      <div className={`grid gap-2 ${promos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {promos.map((promo) =>
          createElement(promo_card, {
            key: promo.id,
            promo,
            size: 'inline',
            on_click: () => on_promo_click(promo),
          })
        )}
      </div>
    </div>
  );
}
