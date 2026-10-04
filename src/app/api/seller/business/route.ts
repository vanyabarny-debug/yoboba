import { NextResponse } from 'next/server';
import { current_seller_access } from '@/lib/seller-access-server';
import { read_finance_state } from '@/lib/finance/finance-server';
import { sum_order_revenue } from '@/lib/finance/order-revenue';
import {
  days_in_month,
  format_rub,
  moscow_today,
  summarize_month,
  summarize_period,
  warehouse_money,
  with_fact_revenue,
} from '@/lib/finance/model';

type business_tone = 'minus' | 'zero' | 'plus' | 'ok' | 'great';

export const dynamic = 'force-dynamic';

const month_title = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function day_word(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

function month_status(input: {
  month_name: string;
  revenue: number;
  profit: number;
  break_even: number;
  elapsed: number;
  days: number;
  recent_daily: number;
  prev_daily: number | null;
}): { tone: business_tone; detail: string } {
  const elapsed = Math.max(1, input.elapsed);
  const closed = elapsed >= input.days;
  const projected_revenue = closed ? input.revenue : (input.revenue / elapsed) * input.days;
  const projected_profit = closed ? input.profit : (input.profit / elapsed) * input.days;
  const gap = input.break_even > 0 ? (projected_revenue - input.break_even) / input.break_even : null;

  let tone: business_tone;
  if (gap != null) {
    if (gap < -0.03) tone = 'minus';
    else if (gap <= 0.03) tone = 'zero';
    else if (gap < 0.15) tone = 'plus';
    else if (gap < 0.4) tone = 'ok';
    else tone = 'great';
  } else if (projected_profit < -1000) {
    tone = 'minus';
  } else if (Math.abs(projected_profit) <= 1000) {
    tone = 'zero';
  } else {
    const margin = projected_revenue > 0 ? projected_profit / projected_revenue : 0;
    tone = margin < 0.08 ? 'plus' : margin < 0.18 ? 'ok' : 'great';
  }

  let trend = '';
  if (input.prev_daily != null && input.prev_daily > 0) {
    if (input.recent_daily > input.prev_daily * 1.08) trend = 'последняя неделя быстрее · ';
    else if (input.recent_daily < input.prev_daily * 0.92) trend = 'последняя неделя тише · ';
  }

  const rounded = Math.round(projected_profit);
  const money = `${rounded > 0 ? '+' : ''}${format_rub(rounded)}`;
  const when = closed
    ? `${input.month_name} закрывается`
    : `по темпу ${elapsed} ${day_word(elapsed)} ${input.month_name} выйдет`;
  return { tone, detail: `${trend}${when} на ${money}` };
}

export async function GET() {
  const access = await current_seller_access();
  if (!access?.business) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const today = moscow_today();
  const month_id = today.slice(0, 7);
  const month_from = `${month_id}-01`;
  const state = await read_finance_state();
  const fact = await sum_order_revenue(month_from, today);
  const live = summarize_period(state, month_from, today, { revenue: fact.revenue });
  const warehouse = warehouse_money(state, today);
  const month_md = state.monthsData.find((m) => m.month === month_id);
  const break_even = month_md
    ? with_fact_revenue(summarize_month(state, month_md), fact.revenue, state).break_even
    : live.break_even;
  const elapsed = Number(today.slice(8)) || 1;
  const recent = fact.by_day.slice(-7);
  const prev = fact.by_day.slice(-14, -7);
  const avg = (rows: { revenue: number }[]) =>
    rows.length ? rows.reduce((sum, row) => sum + row.revenue, 0) / rows.length : 0;
  const status = month_status({
    month_name: month_title[Number(month_id.slice(5, 7)) - 1] || 'месяц',
    revenue: live.revenue,
    profit: live.net_profit,
    break_even,
    elapsed,
    days: days_in_month(month_id),
    recent_daily: avg(recent),
    prev_daily: prev.length >= 5 ? avg(prev) : null,
  });

  return NextResponse.json(
    {
      revenue: Math.round(live.revenue),
      orders: fact.orders,
      profit: Math.round(live.net_profit),
      spent: warehouse.spent,
      on_hand: warehouse.on_hand,
      realized: warehouse.realized,
      break_even: Math.round(break_even),
      tone: status.tone,
      detail: status.detail,
    },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
