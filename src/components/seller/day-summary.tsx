'use client';

import { useEffect, useState } from 'react';
import type { cash_transaction, day_summary } from '@/lib/types';
import { moscow_today_iso } from '@/lib/order-number';
import { download_csv, to_csv } from '@/lib/csv-export';

const tx_columns = [
  { key: 'created_at', label: 'дата и время' },
  { key: 'seller_name', label: 'продавец' },
  { key: 'spot_address', label: 'точка' },
  { key: 'order_id', label: 'заказ' },
  { key: 'items_summary', label: 'позиции' },
  { key: 'order_total', label: 'сумма' },
  { key: 'payment_method', label: 'оплата' },
  { key: 'amount_received', label: 'получено' },
  { key: 'change_given', label: 'сдача' },
  { key: 'shift_date', label: 'смена' },
];

function calc_summary(transactions: cash_transaction[], shift_date: string): day_summary {
  let cash_total = 0;
  let card_total = 0;
  let cash_received = 0;
  let cash_change = 0;

  for (const t of transactions) {
    if (t.payment_method === 'bonus') continue;
    if (t.payment_method === 'cash') {
      cash_total += t.order_total;
      cash_received += t.amount_received || 0;
      cash_change += t.change_given || 0;
    } else {
      card_total += t.order_total;
    }
  }

  return {
    shift_date,
    cash_total,
    card_total,
    grand_total: cash_total + card_total,
    transaction_count: transactions.length,
    cash_received,
    cash_change,
  };
}

type props = {
  spot_id?: string;
  shift_id?: string;
  seller_id?: string;
  default_date?: string;
};

export default function day_summary_panel({
  spot_id,
  shift_id,
  seller_id,
  default_date,
}: props) {
  const [shift_date, set_shift_date] = useState(default_date || moscow_today_iso());
  const [transactions, set_transactions] = useState<cash_transaction[]>([]);
  const [summary, set_summary] = useState<day_summary | null>(null);

  useEffect(() => {
    if (default_date) set_shift_date(default_date);
  }, [default_date]);

  useEffect(() => {
    const qs = new URLSearchParams();
    // всегда день смены — иначе при фильтре только по shift_id «теряются» оплаты
    qs.set('shift_date', shift_date);
    if (spot_id) qs.set('spot_id', spot_id);
    if (seller_id) qs.set('seller_id', seller_id);
    if (shift_id) qs.set('shift_id', shift_id);
    fetch(`/api/cash?${qs}`, { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data: { transactions: cash_transaction[] }) => {
        const list = data.transactions || [];
        set_transactions(list);
        set_summary(calc_summary(list, shift_date));
      })
      .catch(() => {
        set_transactions([]);
        set_summary(calc_summary([], shift_date));
      });
  }, [shift_date, shift_id, spot_id, seller_id]);

  function export_csv() {
    const rows = transactions.map((t) => ({
      created_at: new Date(t.created_at).toLocaleString('ru-RU'),
      seller_name: t.seller_name,
      spot_address: t.spot_address || '—',
      order_id: t.order_id || '—',
      items_summary: t.items_summary,
      order_total: t.order_total,
      payment_method: t.payment_method === 'cash' ? 'нал' : 'безнал',
      amount_received: t.amount_received ?? '',
      change_given: t.change_given ?? '',
      shift_date: t.shift_date,
    }));
    download_csv(`kassa-${shift_date}.csv`, to_csv(rows, tx_columns));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-neutral-600">
          смена
          <input
            type="date"
            value={shift_date}
            onChange={(e) => set_shift_date(e.target.value)}
            className="ml-2 rounded-lg border border-surface px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={export_csv}
          disabled={transactions.length === 0}
          className="ml-auto rounded-xl bg-highlight text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          выгрузить csv
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">наличные</p>
            <p className="text-2xl font-bold font-mono tabular-nums mt-1">{summary.cash_total} ₽</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">безнал</p>
            <p className="text-2xl font-bold font-mono tabular-nums mt-1">{summary.card_total} ₽</p>
          </div>
          <div className="col-span-2 rounded-2xl bg-neutral-900 p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">итого за смену</p>
            <p className="text-3xl font-bold font-mono tabular-nums mt-1">{summary.grand_total} ₽</p>
            <p className="text-xs text-white/50 mt-2">{summary.transaction_count} операций</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-sm border border-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-neutral-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2">время</th>
              <th className="text-left px-3 py-2">сумма</th>
              <th className="text-left px-3 py-2">оплата</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-neutral-400">
                  операций за эту смену нет
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-t border-surface">
                  <td className="px-3 py-2 text-xs">
                    {new Date(t.created_at).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">{t.order_total} ₽</td>
                  <td className="px-3 py-2">{t.payment_method === 'cash' ? 'нал' : 'безнал'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
