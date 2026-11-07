'use client';

import { useState } from 'react';
import { pct_to_sold, sold_to_pct } from '@/lib/pos-pricing';

type field = 'sold' | 'pct' | 'rub';

/** «продано за» ↔ скидка % ↔ скидка ₽ от суммы по меню: правишь одно — остальное пересчитывается */
export default function DiscountFields({
  list_total,
  sold_total,
  on_sold,
}: {
  list_total: number;
  sold_total: number;
  on_sold: (target: number) => void;
}) {
  const [draft, set_draft] = useState<{ field: field; text: string } | null>(null);
  const list = Math.max(0, Math.round(list_total));
  const sold = Math.max(0, Math.round(sold_total));

  function shown(f: field) {
    if (draft?.field === f) return draft.text;
    if (f === 'sold') return String(sold);
    if (f === 'pct') return String(sold_to_pct(list, sold));
    return String(Math.max(0, list - sold));
  }

  function change(f: field, raw: string) {
    const text = f === 'pct' ? raw.replace(',', '.').replace(/[^\d.]/g, '') : raw.replace(/[^\d]/g, '');
    set_draft({ field: f, text });
    if (text === '') return;
    const n = Number(text) || 0;
    if (f === 'sold') on_sold(Math.min(list, n));
    else if (f === 'pct') on_sold(pct_to_sold(list, n));
    else on_sold(Math.max(0, list - n));
  }

  const input = 'mt-1 w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-right text-sm tabular-nums';
  return (
    <div className="space-y-1.5 rounded-xl bg-neutral-50 p-2">
      <p className="text-[11px] text-neutral-500">
        по меню <span className="font-semibold tabular-nums text-neutral-800">{list.toLocaleString('ru-RU')} ₽</span>
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        <label className="text-[11px] text-neutral-500">
          продано за, ₽
          <input
            inputMode="numeric"
            value={shown('sold')}
            onChange={(e) => change('sold', e.target.value)}
            onBlur={() => set_draft(null)}
            className={input}
          />
        </label>
        <label className="text-[11px] text-neutral-500">
          скидка, %
          <input
            inputMode="decimal"
            value={shown('pct')}
            onChange={(e) => change('pct', e.target.value)}
            onBlur={() => set_draft(null)}
            className={input}
          />
        </label>
        <label className="text-[11px] text-neutral-500">
          скидка, ₽
          <input
            inputMode="numeric"
            value={shown('rub')}
            onChange={(e) => change('rub', e.target.value)}
            onBlur={() => set_draft(null)}
            className={input}
          />
        </label>
      </div>
    </div>
  );
}
