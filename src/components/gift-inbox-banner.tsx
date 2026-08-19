'use client';

import { format_price } from '@/lib/cart-summary';
import { gift_items_label } from '@/lib/gifts';
import type { gift } from '@/lib/types';

type props = {
  gifts: gift[];
  on_claim: (gift: gift) => void;
};

export default function gift_inbox_banner({ gifts, on_claim }: props) {
  const ready = gifts.filter((g) => g.status === 'paid');
  if (ready.length === 0) return null;
  const first = ready[0];

  return (
    <div className="page-shell pb-3 min-[1024px]:pb-4">
      <div className="flex items-center gap-3 rounded-[12px] bg-[#ffe14d] px-4 py-3 text-neutral-900">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            вам подарок от {first.sender_name}
          </p>
          <p className="mt-0.5 text-xs text-neutral-700">
            {gift_items_label(first.items)} · {format_price(first.total_price)} ₽
            {ready.length > 1 ? ` · ещё ${ready.length - 1}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => on_claim(first)}
          className="shrink-0 rounded-pill bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white"
        >
          забрать
        </button>
      </div>
    </div>
  );
}
