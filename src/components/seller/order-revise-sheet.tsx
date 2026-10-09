'use client';

import { useEffect, useMemo, useState } from 'react';
import { is_combo_item } from '@/lib/combo';
import { format_order_number } from '@/lib/order-number';
import { configured_unit_price, get_item_volumes } from '@/lib/product-details';
import type { menu_item, order, order_item } from '@/lib/types';

type line = {
  menu_id: string;
  name: string;
  quantity: string;
  /** сколько реально уплатили за 1 шт */
  price: string;
  volume?: string;
  kind?: order_item['kind'];
  combo_picks?: string[];
  combo_components?: order_item['combo_components'];
  /** цена по меню для выбранного объёма (для подсказки скидки) */
  catalog_price: number;
};

type props = {
  order: order | null;
  busy: boolean;
  error: string;
  on_close: () => void;
  on_save: (items: order_item[]) => void;
};

function catalog_for(item: menu_item | undefined, volume?: string) {
  if (!item) return 0;
  if (is_combo_item(item)) return Math.max(0, Math.round(item.price));
  return Math.max(0, Math.round(configured_unit_price(item, volume || null, 0)));
}

export default function order_revise_sheet({ order, busy, error, on_close, on_save }: props) {
  const [menu, set_menu] = useState<menu_item[]>([]);
  const [lines, set_lines] = useState<line[]>(() =>
    (order?.items || []).map((item) => ({
      menu_id: item.menu_id || '',
      name: item.name,
      quantity: String(item.quantity),
      price: String(item.price),
      volume: item.volume,
      kind: item.kind,
      ...(item.combo_picks?.length ? { combo_picks: item.combo_picks } : {}),
      ...(item.combo_components?.length ? { combo_components: item.combo_components } : {}),
      catalog_price: Math.max(0, Math.round(item.price)),
    }))
  );

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/menu', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { store?: { items?: menu_item[] } | null; items?: menu_item[] }) => {
        if (cancelled) return;
        const list = body.store?.items?.length
          ? body.store.items
          : Array.isArray(body.items)
            ? body.items
            : [];
        set_menu(list.filter((i) => i && i.archived !== true));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const menu_by_id = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);

  useEffect(() => {
    if (!menu.length) return;
    set_lines((prev) =>
      prev.map((row) => {
        const item = row.menu_id ? menu_by_id.get(row.menu_id) : undefined;
        const catalog_price = catalog_for(item, row.volume) || row.catalog_price;
        return { ...row, catalog_price };
      })
    );
  }, [menu, menu_by_id]);

  if (!order) return null;

  const paid_total = lines.reduce(
    (s, row) => s + (Number(row.price) || 0) * (Number(row.quantity) || 0),
    0
  );
  const catalog_total = lines.reduce(
    (s, row) => s + (row.catalog_price || 0) * (Number(row.quantity) || 0),
    0
  );
  const discount = Math.max(0, catalog_total - paid_total);

  function set_line(i: number, patch: Partial<line>) {
    set_lines((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function change_volume(i: number, volume: string) {
    set_lines((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const item = row.menu_id ? menu_by_id.get(row.menu_id) : undefined;
        const catalog_price = catalog_for(item, volume) || row.catalog_price;
        const paid = Number(row.price) || 0;
        // если платили по меню или выше — подставляем новую цену меню; скидку сохраняем пропорцией
        const was_discount = row.catalog_price > 0 && paid < row.catalog_price;
        const next_paid = was_discount
          ? Math.max(0, Math.round(catalog_price * (paid / row.catalog_price)))
          : catalog_price || paid;
        return {
          ...row,
          volume: volume || undefined,
          catalog_price,
          price: String(next_paid),
        };
      })
    );
  }

  function save() {
    const items: order_item[] = lines.map((line) => ({
      menu_id: line.menu_id,
      name: line.name.trim(),
      quantity: Number(line.quantity),
      price: Number(line.price),
      ...(line.volume ? { volume: line.volume } : {}),
      ...(line.kind ? { kind: line.kind } : {}),
      ...(line.combo_picks?.length ? { combo_picks: line.combo_picks } : {}),
      ...(line.combo_components?.length ? { combo_components: line.combo_components } : {}),
    }));
    on_save(items);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="закрыть" onClick={on_close} />
      <form
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="text-base font-semibold text-neutral-900">заказ №{format_order_number(order)}</h2>
        <p className="mt-1 text-xs text-neutral-400">
          объём и оплачено можно менять · меньше цены меню = скидка · сразу в базу и в историю
        </p>

        <div className="mt-4 space-y-3">
          {lines.map((line, i) => {
            const item = line.menu_id ? menu_by_id.get(line.menu_id) : undefined;
            const combo = is_combo_item(item);
            const vols = item && !combo ? get_item_volumes(item) : [];
            const paid = Number(line.price) || 0;
            const has_discount = line.catalog_price > 0 && paid < line.catalog_price;
            return (
              <div key={`${order.id}-${i}`} className="rounded-2xl border border-neutral-100 bg-neutral-50/80 p-2.5">
                <div className="flex items-start gap-1.5">
                  <input
                    value={line.name}
                    aria-label="название"
                    onChange={(e) => set_line(i, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-highlight"
                  />
                  <button
                    type="button"
                    aria-label="убрать позицию"
                    onClick={() => set_lines((prev) => prev.filter((_, idx) => idx !== i))}
                    className="px-1 pt-1 text-lg text-neutral-400"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {!combo && vols.length > 0 ? (
                    <select
                      aria-label="объём"
                      value={line.volume || String(vols[0]?.ml || '')}
                      onChange={(e) => change_volume(i, e.target.value)}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-highlight"
                    >
                      {vols.map((v) => (
                        <option key={v.ml} value={String(v.ml)}>
                          {v.ml} мл
                        </option>
                      ))}
                    </select>
                  ) : !combo ? (
                    <input
                      value={line.volume || ''}
                      aria-label="объём мл"
                      placeholder="мл"
                      inputMode="numeric"
                      onChange={(e) => {
                        const volume = e.target.value.replace(/[^\d]/g, '');
                        change_volume(i, volume);
                      }}
                      className="w-16 rounded-lg border border-neutral-200 bg-white px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                    />
                  ) : (
                    <span className="rounded-lg bg-white px-2 py-2 text-xs text-neutral-400">комбо</span>
                  )}
                  <input
                    value={line.quantity}
                    inputMode="numeric"
                    aria-label="количество"
                    onChange={(e) => set_line(i, { quantity: e.target.value.replace(/[^\d]/g, '') })}
                    className="w-12 rounded-lg border border-neutral-200 bg-white px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                  />
                  <label className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">оплач.</span>
                    <input
                      value={line.price}
                      inputMode="numeric"
                      aria-label="оплачено за штуку"
                      onChange={(e) => set_line(i, { price: e.target.value.replace(/[^\d]/g, '') })}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                    />
                  </label>
                </div>
                {line.catalog_price > 0 ? (
                  <p className={`mt-1 text-[11px] ${has_discount ? 'text-amber-700' : 'text-neutral-400'}`}>
                    по меню {line.catalog_price.toLocaleString('ru-RU')} ₽
                    {has_discount
                      ? ` · скидка ${Math.max(0, line.catalog_price - paid).toLocaleString('ru-RU')} ₽`
                      : ''}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() =>
            set_lines((prev) => [
              ...prev,
              { menu_id: '', name: '', quantity: '1', price: '0', catalog_price: 0 },
            ])
          }
          className="mt-3 text-xs font-medium text-neutral-500"
        >
          + позиция
        </button>

        <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2 text-sm">
          <p className="font-semibold tabular-nums text-neutral-900">
            итого оплачено {paid_total.toLocaleString('ru-RU')} ₽
          </p>
          {discount > 0 ? (
            <p className="mt-0.5 text-xs text-amber-700">
              скидка относительно меню {discount.toLocaleString('ru-RU')} ₽ (было бы{' '}
              {catalog_total.toLocaleString('ru-RU')} ₽)
            </p>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy || lines.length === 0}
            className="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            {busy ? 'сохраняю...' : 'сохранить в базу'}
          </button>
          <button
            type="button"
            onClick={on_close}
            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700"
          >
            отмена
          </button>
        </div>
      </form>
    </div>
  );
}
