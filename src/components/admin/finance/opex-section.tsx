'use client';

import { amortization_per_month, format_rub, is_salary_opex, month_label, ndfl_from_net, new_id, update_month } from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import {
  Card,
  EmptyState,
  NumInput,
  StatCard,
  TableWrap,
  btn_ghost_danger,
  btn_secondary,
  cell_input_class,
  td_class,
  td_num_class,
  th_class,
  th_num_class,
} from '@/components/admin/finance/ui';

export default function OpexSection({ state, set_state, month, compact }: section_props) {
  const md = state.monthsData.find((m) => m.month === month);
  const prev_month = state.monthsData.filter((m) => m.month < month).pop();
  const opex_total = md ? Object.values(md.opex).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const amort = amortization_per_month(state);
  const capex_total = state.equipments.reduce((s, e) => s + e.price, 0);
  const salary = md
    ? Object.entries(md.opex)
        .filter(([id]) => is_salary_opex(id))
        .reduce((s, [, v]) => s + (Number(v) || 0), 0)
    : 0;

  if (!md) return <EmptyState>месяц {month_label(month)} ещё не создан — добавьте его сверху</EmptyState>;

  return (
    <div className="space-y-4">
      {compact ? null : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`постоянные расходы · ${month_label(month)}`} value={format_rub(opex_total)} />
        <StatCard label="амортизация в месяц" value={format_rub(amort)} hint={`оборудование на ${format_rub(capex_total)}`} />
        <StatCard label="ндфл с фот" value={format_rub(ndfl_from_net(salary, state.ndflRate))} hint={`фот ${format_rub(salary)} на руки`} />
        <StatCard label="итого фикс в месяц" value={format_rub(opex_total + amort)} />
      </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="операционные расходы за месяц"
          hint="аренда, свет, вода, банк — то, что платите каждый месяц. строка с пометкой «фот» идёт в зарплатный фонд"
          actions={
            <>
              {prev_month && (
                <button
                  type="button"
                  className={btn_secondary}
                  onClick={() => set_state((prev) => update_month(prev, month, (m) => ({ ...m, opex: { ...prev_month.opex } })))}
                >
                  скопировать из {month_label(prev_month.month)}
                </button>
              )}
              <button
                type="button"
                className={btn_secondary}
                onClick={() => {
                  const name = window.prompt('название категории расходов');
                  if (!name) return;
                  const id = /зарплат|фот|salary/i.test(name) ? new_id('salary') : new_id('opex');
                  set_state((prev) => ({ ...prev, opexCategories: [...prev.opexCategories, { id, name: name.trim() }] }));
                }}
              >
                + категория
              </button>
            </>
          }
        >
          <TableWrap>
            <thead>
              <tr>
                <th className={th_class}>категория</th>
                <th className={th_num_class}>₽ / месяц</th>
                <th className={th_class}></th>
              </tr>
            </thead>
            <tbody>
              {state.opexCategories.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className={td_class}>
                    <input
                      className={`${cell_input_class} text-left`}
                      value={c.name}
                      onChange={(e) =>
                        set_state((prev) => ({ ...prev, opexCategories: prev.opexCategories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) }))
                      }
                    />
                    {is_salary_opex(c.id) && <span className="ml-2 text-[10px] text-neutral-400">фот</span>}
                  </td>
                  <td className={`${td_num_class} w-36`}>
                    <NumInput
                      value={md.opex[c.id] ?? 0}
                      min={0}
                      on_change={(v) => set_state((prev) => update_month(prev, month, (m) => ({ ...m, opex: { ...m.opex, [c.id]: v } })))}
                    />
                  </td>
                  <td className={`${td_class} text-right`}>
                    <button
                      type="button"
                      className={btn_ghost_danger}
                      onClick={() => {
                        if (!window.confirm(`удалить категорию «${c.name}» из всех месяцев?`)) return;
                        set_state((prev) => ({
                          ...prev,
                          opexCategories: prev.opexCategories.filter((x) => x.id !== c.id),
                          monthsData: prev.monthsData.map((m) => {
                            const opex = { ...m.opex };
                            delete opex[c.id];
                            return { ...m, opex };
                          }),
                        }));
                      }}
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-200 font-semibold">
                <td className={td_class}>итого</td>
                <td className={td_num_class}>{format_rub(opex_total)}</td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>
        </Card>

        <Card
          title="оборудование и амортизация"
          hint="стоимость делится на срок службы — это ежемесячная амортизация в p&l"
          actions={
            <button
              type="button"
              className={btn_secondary}
              onClick={() => set_state((prev) => ({ ...prev, equipments: [...prev.equipments, { id: new_id('eq'), name: 'новое оборудование', price: 0, months: 24 }] }))}
            >
              + оборудование
            </button>
          }
        >
          <TableWrap>
            <thead>
              <tr>
                <th className={th_class}>название</th>
                <th className={th_num_class}>стоимость</th>
                <th className={th_num_class}>срок, мес</th>
                <th className={th_num_class}>в месяц</th>
                <th className={th_class}></th>
              </tr>
            </thead>
            <tbody>
              {state.equipments.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100">
                  <td className={`${td_class} min-w-[180px]`}>
                    <input
                      className={`${cell_input_class} text-left`}
                      value={e.name}
                      onChange={(ev) => set_state((prev) => ({ ...prev, equipments: prev.equipments.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)) }))}
                    />
                  </td>
                  <td className={`${td_num_class} w-32`}>
                    <NumInput value={e.price} min={0} on_change={(v) => set_state((prev) => ({ ...prev, equipments: prev.equipments.map((x) => (x.id === e.id ? { ...x, price: v } : x)) }))} />
                  </td>
                  <td className={`${td_num_class} w-24`}>
                    <NumInput value={e.months} min={1} step={1} on_change={(v) => set_state((prev) => ({ ...prev, equipments: prev.equipments.map((x) => (x.id === e.id ? { ...x, months: Math.max(1, Math.round(v)) } : x)) }))} />
                  </td>
                  <td className={`${td_num_class} text-neutral-500`}>{format_rub(e.months > 0 ? e.price / e.months : 0)}</td>
                  <td className={`${td_class} text-right`}>
                    <button type="button" className={btn_ghost_danger} onClick={() => set_state((prev) => ({ ...prev, equipments: prev.equipments.filter((x) => x.id !== e.id) }))}>
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-200 font-semibold">
                <td className={td_class}>итого</td>
                <td className={td_num_class}>{format_rub(capex_total)}</td>
                <td />
                <td className={td_num_class}>{format_rub(amort)}</td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>
        </Card>
      </div>
    </div>
  );
}
