'use client';

import { createElement } from 'react';
import cart_mark from '@/components/cart-mark';

type props = {
  count: number;
  total: number;
  on_click: () => void;
};

export default function cart_fab({ count, total, on_click }: props) {
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={on_click}
      data-cart-target
      className="fixed mobile-fab-offset z-40 min-[1024px]:hidden flex items-center gap-2 rounded-pill bg-accent text-accent-foreground pl-4 pr-5 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.18)] font-extrabold text-[17px] animate-in fade-in zoom-in-95 duration-200"
      aria-label={`корзина, ${total} рублей`}
    >
      {createElement(cart_mark, { size: 22 })}
      <span>{total} ₽</span>
      <span className="bg-white text-accent text-xs font-extrabold rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1">
        {count}
      </span>
    </button>
  );
}
