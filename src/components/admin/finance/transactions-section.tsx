'use client';

import { useState } from 'react';
import { apply_receipt, format_rub, month_label, new_id, update_month, type transaction } from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import {
  Card,
  EmptyState,
  NumInput,
  StatCard,
  TableWrap,
  btn_ghost_danger,
  btn_primary,
  field_class,
  td_class,
  td_num_class,
  th_class,
  th_num_class,
} from '@/components/admin/finance/ui';

const fixed_categories: { id: string; label: string; kind: 'expense' | 'income' }[] = [
  { id: 'material', label: 'закупка сырья / упаковки', kind: 'expense' },
  { id: 'capex', label: 'оборудование (capex)', kind: 'expense' },
  { id: 'other_expense', label: 'прочий расход', kind: 'expense' },
  { id: 'investment', label: 'инвестиции / вложения владельца', kind: 'income' },
  { id: 'other_income', label: 'прочий доход', kind: 'income' },
];

export default function TransactionsSection({ state, set_state, month, compact }: section_props) {
  const md = state.monthsData.find((m) => m.month === month);
  const [category, set_category] = useState('material');
  const [material_id, set_material_id] = useState(state.materials[0]?.id ?? '');
  const [quantity, set_quantity] = useState(0);
  const [amount, set_amount] = useState(0);
  const [day, set_day] = useState(new Date().getDate());
  const [description, set_description] = useState('');
  const [to_stock, set_to_stock] = useState(true);

  const cat_label = (id: string) =>
    fixed_categories.find((c) => c.id === id)?.label ?? state.opexCategories.find((c) => c.id === id)?.name ?? id;

  const tx = [...(md?.transactions ?? [])].sort((a, b) => b.day - a.day);
  const expenses = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const incomes = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const materials_sum = tx.filter((t) => t.category === 'material').reduce((s, t) => s + t.amount, 0);

  function add() {
    if (amount <= 0 && !(category === 'material' && quantity > 0)) return;
    const kind = fixed_categories.find((c) => c.id === category)?.kind ?? 'expense';
    const date = `${month}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    if (category === 'material' && to_stock && material_id && quantity > 0) {
      set_state((prev) => apply_receipt(prev, { materialId: material_id, quantity, total: amount, date, note: description || undefined, update_price: amount > 0, actor: { id: 'admin', name: 'админ', role: 'admin' } }));
    } else {
      const row: transaction = {
        id: new_id('tx'),
        day,
        type: kind,
        category,
        amount,
        description,
        ...(category === 'material' && material_id ? { materialId: material_id } : {}),
        ...(category === 'material' && quantity > 0 ? { quantity } : {}),
      };
      set_state((prev) => update_month(prev, month, (m) => ({ ...m, transactions: [...(m.transactions ?? []), row] })));
    }
    set_amount(0);
    set_quantity(0);
    set_description('');
  }

  function remove(id: string) {
    set_state((prev) => ({
      ...prev,
      monthsData: prev.monthsData.map((m) => (m.month === month ? { ...m, transactions: (m.transactions ?? []).filter((t) => t.id !== id) } : m)),
      stockMovements: prev.stockMovements.filter((mv) => mv.transactionId !== id),
    }));
  }

  if (!md) return <EmptyState>месяц {month_label(month)} ещё не создан — добавьте его сверху</EmptyState>;

  return (
    <div className="space-y-4">
      {compact ? null : (
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={`расходы · ${month_label(month)}`} value={format_rub(expenses)} hint={`закупки сырья ${format_rub(materials_sum)}`} />
        <StatCard label="поступления денег" value={format_rub(incomes)} hint="инвестиции и прочие доходы" />
        <StatCard label="операций" value={String(tx.length)} />
      </div>
      )}

      <Card title="новая операция" hint="закупка сырья с галочкой «на склад» одновременно оприходуется и попадёт в остатки">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="text-xs text-neutral-500 md:col-span-2">
            категория
            <select className={`${field_class} mt-1`} value={category} onChange={(e) => set_category(e.target.value)}>
              <optgroup label="движение денег">
                {fixed_categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="постоянные расходы (факт оплаты)">
                {state.opexCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {category === 'material' && (
            <>
              <label className="text-xs text-neutral-500 md:col-span-2">
                материал
                <select className={`${field_class} mt-1`} value={material_id} onChange={(e) => set_material_id(e.target.value)}>
                  {state.materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-500">
                кол-во ({state.materials.find((m) => m.id === material_id)?.unit ?? ''})
                <NumInput value={quantity} min={0} className={`${field_class} mt-1 text-right`} on_change={set_quantity} />
              </label>
            </>
          )}
          <label className="text-xs text-neutral-500">
            сумма, ₽
            <NumInput value={amount} min={0} className={`${field_class} mt-1 text-right`} on_change={set_amount} />
          </label>
          <label className="text-xs text-neutral-500">
            день
            <NumInput value={day} min={1} step={1} className={`${field_class} mt-1 text-right`} on_change={(v) => set_day(Math.min(31, Math.max(1, Math.round(v))))} />
          </label>
          <label className={`text-xs text-neutral-500 ${category === 'material' ? 'md:col-span-4' : 'md:col-span-2'}`}>
            описание
            <input className={`${field_class} mt-1`} value={description} placeholder="поставщик, комментарий" onChange={(e) => set_description(e.target.value)} />
          </label>
          <div className="flex items-end gap-3 md:col-span-2">
            {category === 'material' && (
              <label className="flex items-center gap-2 pb-2 text-xs text-neutral-600">
                <input type="checkbox" checked={to_stock} onChange={(e) => set_to_stock(e.target.checked)} />
                на склад
              </label>
            )}
            <button type="button" className={`${btn_primary} ml-auto`} onClick={add}>
              добавить
            </button>
          </div>
        </div>
      </Card>

      <Card title={`операции · ${month_label(month)}`}>
        {tx.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th className={th_class}>день</th>
                <th className={th_class}>категория</th>
                <th className={th_class}>описание</th>
                <th className={th_num_class}>сумма</th>
                <th className={th_class}></th>
              </tr>
            </thead>
            <tbody>
              {tx.map((t) => {
                const mat = t.materialId ? state.materials.find((m) => m.id === t.materialId) : undefined;
                const in_stock = state.stockMovements.some((mv) => mv.transactionId === t.id);
                return (
                  <tr key={t.id} className="border-t border-neutral-100">
                    <td className={`${td_class} text-neutral-500`}>{t.day}</td>
                    <td className={td_class}>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${t.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {cat_label(t.category)}
                      </span>
                      {in_stock && <span className="ml-1 text-[10px] text-sky-600">склад</span>}
                    </td>
                    <td className={`${td_class} text-neutral-600`}>
                      {mat && (
                        <span className="text-neutral-800">
                          {mat.name}
                          {t.quantity ? ` × ${t.quantity} ${mat.unit}` : ''}
                          {t.description ? ' · ' : ''}
                        </span>
                      )}
                      {t.description}
                    </td>
                    <td className={`${td_num_class} font-medium ${t.type === 'income' ? 'text-emerald-600' : ''}`}>
                      {t.type === 'income' ? '+' : '−'}
                      {format_rub(t.amount)}
                    </td>
                    <td className={`${td_class} text-right`}>
                      <button type="button" className={btn_ghost_danger} onClick={() => remove(t.id)}>
                        удалить
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState>операций за месяц нет</EmptyState>
        )}
      </Card>
    </div>
  );
}
