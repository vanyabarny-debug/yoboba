'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  format_rub,
  menu_price_for_size,
  month_label,
  size_label,
  tech_card_cost,
  update_month,
  type sales_cell,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import {
  Card,
  DrinkThumb,
  EmptyState,
  NumInput,
  StatCard,
  TableWrap,
  btn_secondary,
  td_class,
  td_num_class,
  th_class,
  th_num_class,
} from '@/components/admin/finance/ui';

type fact_response = {
  month: string;
  orders: number;
  revenue: number;
  sales: Record<string, Record<string, sales_cell>>;
  unmatched: { menu_id: string; name: string; qty: number; revenue: number }[];
  error?: string;
};

function exec_tone(ratio: number) {
  if (ratio >= 1) return 'text-emerald-600';
  if (ratio >= 0.7) return 'text-amber-600';
  return 'text-red-500';
}

function exec_bar(ratio: number) {
  if (ratio >= 1) return 'bg-emerald-500';
  if (ratio >= 0.7) return 'bg-amber-400';
  return 'bg-accent';
}

export default function SalesSection({ state, set_state, month, menu, spot_id = '' }: section_props) {
  const md = state.monthsData.find((m) => m.month === month);
  const [fact, set_fact] = useState<fact_response | null>(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const menu_by_id = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);

  useEffect(() => {
    let cancelled = false;
    set_loading(true);
    const spot_q = spot_id ? `&spot_id=${encodeURIComponent(spot_id)}` : '';
    fetch(`/api/admin/finance/sales?month=${month}${spot_q}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: fact_response) => {
        if (cancelled) return;
        if (body.error) throw new Error(body.error);
        set_fact(body);
        set_error('');
      })
      .catch((e) => {
        if (!cancelled) set_error(e instanceof Error ? e.message : 'не удалось загрузить продажи');
      })
      .finally(() => {
        if (!cancelled) set_loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, spot_id]);

  const cards = useMemo(
    () =>
      [...state.techCards]
        .filter((card) => {
          const item = card.menu_item_id ? menu_by_id.get(card.menu_item_id) : undefined;
          return !!item && item.is_available;
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [state.techCards, menu_by_id]
  );

  const totals = useMemo(() => {
    let plan_qty = 0;
    let fact_qty = 0;
    let plan_rev = 0;
    let fact_rev = 0;
    for (const card of cards) {
      const item = card.menu_item_id ? menu_by_id.get(card.menu_item_id) : undefined;
      for (const key of Object.keys(card.sizes)) {
        const cell = md?.sales[card.id]?.[key] ?? { price: item ? menu_price_for_size(item, key) : 0, qty: 0 };
        const f = fact?.sales[card.id]?.[key];
        plan_qty += cell.qty;
        plan_rev += cell.price * cell.qty;
        fact_qty += f?.qty ?? 0;
        fact_rev += (f?.qty ?? 0) * (f?.price || cell.price);
      }
    }
    return { plan_qty, fact_qty, plan_rev, fact_rev, ratio: plan_qty > 0 ? fact_qty / plan_qty : 0 };
  }, [cards, md, fact, menu_by_id]);

  function set_cell(tc: string, size: string, patch: Partial<sales_cell>) {
    set_state((prev) =>
      update_month(prev, month, (m) => {
        const card = prev.techCards.find((c) => c.id === tc);
        const item = card?.menu_item_id ? menu_by_id.get(card.menu_item_id) : undefined;
        const prev_cell = m.sales[tc]?.[size] ?? { price: item ? menu_price_for_size(item, size) : 0, qty: 0 };
        return { ...m, sales: { ...m.sales, [tc]: { ...(m.sales[tc] ?? {}), [size]: { ...prev_cell, ...patch } } } };
      })
    );
  }

  function fill_prices_from_menu() {
    set_state((prev) =>
      update_month(prev, month, (m) => {
        const sales = { ...m.sales };
        for (const card of prev.techCards) {
          const item = card.menu_item_id ? menu_by_id.get(card.menu_item_id) : undefined;
          if (!item) continue;
          sales[card.id] = { ...(sales[card.id] ?? {}) };
          for (const size of Object.keys(card.sizes)) {
            const cell = sales[card.id][size] ?? { price: 0, qty: 0 };
            sales[card.id][size] = { ...cell, price: menu_price_for_size(item, size) };
          }
        }
        return { ...m, sales };
      })
    );
  }

  if (!md) return <EmptyState>месяц {month_label(month)} ещё не создан — добавьте его сверху</EmptyState>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="план"
          value={format_rub(totals.plan_rev)}
          hint={`${totals.plan_qty} шт`}
        />
        <StatCard
          label="факт"
          value={format_rub(fact ? fact.revenue : totals.fact_rev)}
          hint={
            loading
              ? 'загружаю заказы…'
              : fact
                ? `${fact.orders} зак. · ${totals.fact_qty} шт`
                : 'из заказов'
          }
          tone="accent"
        />
        <StatCard
          label="исполнение"
          value={totals.plan_qty > 0 ? `${Math.round(totals.ratio * 100)}%` : '—'}
          tone={totals.plan_qty > 0 ? (totals.ratio >= 1 ? 'good' : totals.ratio >= 0.7 ? 'default' : 'bad') : 'default'}
          hint={totals.plan_qty > 0 ? `${totals.fact_qty} из ${totals.plan_qty} шт` : 'задайте план ниже'}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {fact && fact.unmatched.length > 0 && (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          без техкарты: {fact.unmatched.slice(0, 5).map((u) => `${u.name} ×${u.qty}`).join(', ')}
          {fact.unmatched.length > 5 ? ` и ещё ${fact.unmatched.length - 5}` : ''} — откройте раздел «меню».
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">штуки — план, факт подтянется из кассы и сайта</p>
        <button type="button" className={btn_secondary} onClick={fill_prices_from_menu}>
          цены из меню
        </button>
      </div>

      {cards.length ? (
        <div className="space-y-3">
          {cards.map((card) => {
            const item = card.menu_item_id ? menu_by_id.get(card.menu_item_id) : undefined;
            const keys = Object.keys(card.sizes).sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
            return (
              <Card
                key={card.id}
                title={
                  <div className="flex items-center gap-3">
                    <DrinkThumb item={item} />
                    <div>
                      <p className="font-heading-soft text-sm text-neutral-900">{card.name}</p>
                    </div>
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-neutral-400">
                        <th className="pb-2 text-left font-medium">размер</th>
                        <th className="pb-2 text-right font-medium">цена, ₽</th>
                        <th className="pb-2 text-right font-medium">план, шт</th>
                        <th className="pb-2 text-right font-medium">факт, шт</th>
                        <th className="pb-2 text-right font-medium">исполнение</th>
                        <th className="pb-2 text-right font-medium">выручка</th>
                        <th className="pb-2 text-right font-medium">себест.</th>
                        <th className="pb-2 text-right font-medium">маржа</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => {
                        const cell = md.sales[card.id]?.[key] ?? { price: item ? menu_price_for_size(item, key) : 0, qty: 0 };
                        const cost = tech_card_cost(state, card, key);
                        const f = fact?.sales[card.id]?.[key];
                        const fact_qty = f?.qty ?? 0;
                        const ratio = cell.qty > 0 ? fact_qty / cell.qty : 0;
                        const rev = cell.price * cell.qty;
                        const margin = cell.price > 0 ? (cell.price - cost) / cell.price : 0;
                        return (
                          <tr key={key} className="border-t border-neutral-100">
                            <td className="py-2 pr-3">
                              <span className="inline-flex min-w-[3.5rem] justify-center rounded-pill bg-accent/10 px-2 py-0.5 text-xs font-medium text-neutral-800">
                                {size_label(key)}
                              </span>
                            </td>
                            <td className="w-24 py-2">
                              <NumInput value={cell.price} min={0} on_change={(v) => set_cell(card.id, key, { price: v })} />
                            </td>
                            <td className="w-24 py-2">
                              <NumInput value={cell.qty} min={0} on_change={(v) => set_cell(card.id, key, { qty: v })} />
                            </td>
                            <td className="py-2 text-right tabular-nums text-neutral-600">{loading && !fact ? '…' : fact_qty}</td>
                            <td className="py-2 pl-3">
                              {cell.qty > 0 ? (
                                <div className="flex items-center justify-end gap-2">
                                  <span className="h-1.5 w-16 overflow-hidden rounded-pill bg-neutral-100">
                                    <span
                                      className={`block h-full rounded-pill ${exec_bar(ratio)}`}
                                      style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                                    />
                                  </span>
                                  <span className={`w-10 text-right tabular-nums text-xs ${exec_tone(ratio)}`}>
                                    {Math.round(ratio * 100)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="block text-right text-neutral-300">—</span>
                              )}
                            </td>
                            <td className="py-2 text-right tabular-nums">{format_rub(rev)}</td>
                            <td className="py-2 text-right tabular-nums text-neutral-500">{format_rub(cost * cell.qty)}</td>
                            <td className={`py-2 text-right tabular-nums ${margin < 0.6 ? 'text-red-500' : 'text-emerald-600'}`}>
                              {cell.price > 0 ? `${(margin * 100).toFixed(0)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState>рецептов нет — они создаются из меню в разделе «меню»</EmptyState>
      )}

      <RetailSales state={state} set_state={set_state} month={month} />
    </div>
  );
}

function RetailSales({ state, set_state, month }: Pick<section_props, 'state' | 'set_state' | 'month'>) {
  const retail = state.materials.filter((m) => m.category === 'retail');
  const md = state.monthsData.find((m) => m.month === month);
  if (!retail.length || !md) return null;
  return (
    <Card title="розница (готовая продукция)" hint="товары, которые продаются как есть — без техкарты">
      <TableWrap>
        <thead>
          <tr>
            <th className={th_class}>товар</th>
            <th className={th_num_class}>закупка</th>
            <th className={th_num_class}>цена продажи</th>
            <th className={th_num_class}>кол-во</th>
            <th className={th_num_class}>выручка</th>
          </tr>
        </thead>
        <tbody>
          {retail.map((m) => {
            const cell = md.retailSales?.[m.id] ?? { price: 0, qty: 0 };
            return (
              <tr key={m.id} className="border-t border-neutral-100">
                <td className={td_class}>{m.name}</td>
                <td className={`${td_num_class} text-neutral-500`}>{format_rub(m.costPerUnit)}</td>
                <td className={`${td_num_class} w-28`}>
                  <NumInput
                    value={cell.price}
                    min={0}
                    on_change={(v) =>
                      set_state((prev) => update_month(prev, month, (x) => ({ ...x, retailSales: { ...(x.retailSales ?? {}), [m.id]: { ...cell, price: v } } })))
                    }
                  />
                </td>
                <td className={`${td_num_class} w-24`}>
                  <NumInput
                    value={cell.qty}
                    min={0}
                    on_change={(v) =>
                      set_state((prev) => update_month(prev, month, (x) => ({ ...x, retailSales: { ...(x.retailSales ?? {}), [m.id]: { ...cell, qty: v } } })))
                    }
                  />
                </td>
                <td className={td_num_class}>{format_rub(cell.price * cell.qty)}</td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </Card>
  );
}
