'use client';

import { useEffect, useMemo, useState } from 'react';
import { weekday_labels } from '@/lib/day-task-templates';
import { moscow_today_iso } from '@/lib/order-number';
import { parse_seller_access, seller_right_ids, seller_right_label, type seller_access } from '@/lib/seller-access';
import { spot_short } from '@/lib/spot-store';
import {
  add_iso_days,
  default_schedule,
  schedule_label,
  shifts_in_month,
  works_on,
} from '@/lib/staff-schedule';
import type { cash_transaction, seller, seller_schedule, seller_shift_record, store_spot } from '@/lib/types';

const field =
  'w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-900 outline-none focus:border-neutral-400';
const chip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm transition-colors ${on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-800'}`;

const short_days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

type form = {
  name: string;
  role_title: string;
  login: string;
  password: string;
  phone: string;
  birthday: string;
  hired_at: string;
  note: string;
  salary_net: number;
  shift_rate: number;
  with_ndfl: boolean;
  spot_ids: string[];
  access: seller_access;
  schedule: seller_schedule | null;
  is_active: boolean;
};

type stats = { shifts: number; orders: number; revenue: number };

function form_from(person: seller): form {
  const salary = Math.max(0, Math.round(Number(person.salary_net) || 0));
  return {
    name: person.name,
    role_title: person.role_title?.trim() || 'бариста',
    login: person.login,
    password: '',
    phone: person.phone || '',
    birthday: person.birthday || '',
    hired_at: person.hired_at || '',
    note: person.note || '',
    salary_net: salary,
    shift_rate: Math.max(0, Math.round(Number(person.shift_rate) || 0)),
    with_ndfl: person.with_ndfl != null ? Boolean(person.with_ndfl) : salary > 0,
    spot_ids: person.spot_ids ?? [],
    access: parse_seller_access(person.access),
    schedule: person.schedule ?? null,
    is_active: person.is_active !== false,
  };
}

function rub(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '·').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function new_password() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function number_input(value: number, on: (n: number) => void, placeholder: string, label: string) {
  return (
    <input
      inputMode="numeric"
      value={value ? String(value) : ''}
      onChange={(e) => on(Math.max(0, Math.round(Number(e.target.value.replace(/[^\d]/g, '')) || 0)))}
      placeholder={placeholder}
      aria-label={label}
      className={`${field} tabular-nums`}
    />
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-neutral-200/80 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {aside ? <div className="text-xs text-neutral-400">{aside}</div> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function StaffProfile({
  person,
  is_new,
  spots,
  on_back,
  on_saved,
  on_deleted,
  on_board,
}: {
  person: seller;
  is_new: boolean;
  spots: store_spot[];
  on_back: () => void;
  on_saved: (next: seller) => void;
  on_deleted: (id: string) => void;
  on_board: () => void;
}) {
  const [form, set_form] = useState<form>(() => form_from(person));
  const [base, set_base] = useState<form>(() => form_from(person));
  const [stats, set_stats] = useState<stats | null>(null);
  const [show_password, set_show_password] = useState(false);
  const [current_password, set_current_password] = useState<string | null>(null);
  const [password_known, set_password_known] = useState(Boolean(person.password_known));
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState('');
  const [saved, set_saved] = useState('');
  const today = moscow_today_iso();
  const month = today.slice(0, 7);

  useEffect(() => {
    if (is_new) return;
    let stop = false;
    void Promise.all([
      fetch(`/api/cash?seller_id=${encodeURIComponent(person.id)}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/seller/shifts', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([cash, shifts]: [{ transactions?: cash_transaction[] } | null, { shifts?: seller_shift_record[] } | null]) => {
      if (stop) return;
      const txs = (cash?.transactions ?? []).filter(
        (t) => t.payment_method !== 'bonus' && (t.shift_date || '').startsWith(month)
      );
      const worked = (shifts?.shifts ?? []).filter(
        (s) =>
          s.shift_date.startsWith(month) &&
          (s.seller_id === person.id || (s.crew ?? []).some((m) => m.seller_id === person.id))
      );
      set_stats({
        shifts: new Set([...worked.map((s) => s.shift_date), ...txs.map((t) => t.shift_date)]).size,
        orders: txs.length,
        revenue: txs.reduce((sum, t) => sum + (Number(t.order_total) || 0), 0),
      });
    });
    return () => {
      stop = true;
    };
  }, [is_new, person.id, month]);

  const dirty = is_new || JSON.stringify(form) !== JSON.stringify(base);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => add_iso_days(today, i)), [today]);
  const planned = shifts_in_month(form.schedule, month);
  const by_shifts = form.shift_rate > 0;
  const monthly = by_shifts ? (form.schedule ? planned * form.shift_rate : 0) : form.salary_net;
  const accrued = by_shifts ? (stats?.shifts ?? 0) * form.shift_rate : form.salary_net;

  async function reveal_password() {
    if (current_password !== null) {
      set_current_password(null);
      return;
    }
    const res = await fetch(`/api/sellers?reveal=${encodeURIComponent(person.id)}`, { credentials: 'same-origin' });
    const data = (await res.json().catch(() => ({}))) as { password?: string | null };
    if (data.password) set_current_password(data.password);
    else set_password_known(false);
  }

  function patch(next: Partial<form>) {
    set_saved('');
    set_form((prev) => ({ ...prev, ...next }));
  }

  function patch_schedule(next: Partial<seller_schedule>) {
    const current = form.schedule ?? default_schedule(today);
    patch({ schedule: { ...current, ...next } as seller_schedule });
  }

  function set_kind(kind: seller_schedule['kind']) {
    const current = form.schedule;
    const time = { from: current?.from || '10:00', to: current?.to || '22:00' };
    if (kind === 'week') patch({ schedule: { kind, days: current?.kind === 'week' ? current.days : [1, 2, 3, 4, 5], ...time } });
    else patch({ schedule: { ...default_schedule(today), ...time } });
  }

  function toggle_day(day: number) {
    if (form.schedule?.kind !== 'week') return;
    const has = form.schedule.days.includes(day);
    patch_schedule({ days: has ? form.schedule.days.filter((d) => d !== day) : [...form.schedule.days, day].sort() });
  }

  function toggle_right(id: (typeof seller_right_ids)[number]) {
    const access: seller_access = { ...form.access, [id]: !form.access[id] };
    if (id === 'stock' && !access.stock) access.stock_money = false;
    if (id === 'stock_money' && access.stock_money) access.stock = true;
    patch({ access });
  }

  async function save() {
    if (!form.name.trim() || !form.login.trim()) {
      set_error('нужны имя и логин');
      return;
    }
    set_saving(true);
    set_error('');
    try {
      const res = await fetch('/api/sellers', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...person,
          ...form,
          access: { ...form.access, push: Boolean(person.push_categories?.length) },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { seller?: seller; error?: string };
      if (!res.ok || !data.seller) throw new Error(data.error || 'не сохранилось');
      const next = form_from(data.seller);
      if (form.password) {
        set_password_known(Boolean(data.seller.password_known));
        set_current_password(data.seller.password_known ? form.password : null);
      }
      set_saved(form.password ? 'сохранено · новый пароль действует' : 'сохранено');
      set_form({ ...next, password: '' });
      set_base({ ...next, password: '' });
      set_show_password(false);
      on_saved(data.seller);
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не сохранилось');
    } finally {
      set_saving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`удалить «${person.name}»? вход в кассу пропадёт`)) return;
    const res = await fetch(`/api/sellers?id=${encodeURIComponent(person.id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) on_deleted(person.id);
    else set_error('не удалось удалить');
  }

  const schedule = form.schedule;

  return (
    <div className="mx-auto max-w-5xl pb-28">
      <button type="button" onClick={on_back} className="mb-5 text-sm text-neutral-500 hover:text-neutral-800">
        ← менеджмент
      </button>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-lg font-semibold ${
            form.is_active ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-500'
          }`}
        >
          {initials(form.name)}
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="имя"
            aria-label="имя"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight text-neutral-900 outline-none placeholder:text-neutral-300"
          />
          <input
            value={form.role_title}
            onChange={(e) => patch({ role_title: e.target.value })}
            placeholder="должность"
            aria-label="должность"
            className="w-full bg-transparent text-sm text-neutral-500 outline-none placeholder:text-neutral-300"
          />
        </div>
        <div className="flex items-center gap-2">
          {!is_new ? (
            <button
              type="button"
              onClick={on_board}
              className="rounded-full bg-white px-3 py-1.5 text-sm text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-900"
            >
              задачи →
            </button>
          ) : null}
          <button type="button" onClick={() => patch({ is_active: !form.is_active })} className={chip(form.is_active)}>
            {form.is_active ? 'работает' : 'не работает'}
          </button>
        </div>
      </div>

      {!is_new ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'смен в этом месяце', value: stats ? `${stats.shifts}${planned ? ` из ${planned}` : ''}` : '…' },
            { label: 'начислено', value: stats ? rub(accrued) : '…' },
            { label: 'заказов', value: stats ? String(stats.orders) : '…' },
            { label: 'выручка', value: stats ? rub(stats.revenue) : '…' },
          ].map((tile) => (
            <div key={tile.label} className="rounded-[22px] border border-neutral-200/80 bg-white px-4 py-3">
              <p className="text-[11px] text-neutral-400">{tile.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{tile.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="вход в кассу">
          <input
            value={form.login}
            onChange={(e) => patch({ login: e.target.value.replace(/\s/g, '').toLowerCase() })}
            placeholder="логин"
            aria-label="логин"
            autoComplete="off"
            className={field}
          />
          {!is_new ? (
            password_known ? (
              <div className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2.5">
                <span className="text-[11px] text-neutral-400">пароль</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-neutral-900">
                  {current_password ?? '••••••••••'}
                </span>
                <button type="button" onClick={() => void reveal_password()} className="text-xs text-neutral-500 hover:text-neutral-900">
                  {current_password === null ? 'показать' : 'скрыть'}
                </button>
                {current_password !== null ? (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(`${form.login} / ${current_password}`)}
                    className="text-xs text-neutral-500 hover:text-neutral-900"
                  >
                    скопировать
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="px-1 text-xs text-neutral-400">
                текущий пароль появится здесь после следующего входа сотрудника — или задай новый
              </p>
            )
          ) : null}
          <div className="flex gap-2">
            <input
              type={show_password ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => patch({ password: e.target.value })}
              placeholder={is_new ? 'пароль, от 8 символов' : 'новый пароль — пусто, чтобы не менять'}
              aria-label="пароль"
              autoComplete="new-password"
              className={`${field} font-mono`}
            />
            <button
              type="button"
              onClick={() => {
                patch({ password: new_password() });
                set_show_password(true);
              }}
              className="shrink-0 rounded-2xl bg-neutral-100 px-3 text-sm text-neutral-600 hover:text-neutral-900"
            >
              придумать
            </button>
          </div>
          {form.password ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={form.password.length < 8 ? 'text-red-500' : 'text-neutral-400'}>
                {form.password.length < 8 ? `ещё ${8 - form.password.length} симв.` : 'передай сотруднику до сохранения'}
              </span>
              <span className="flex gap-3">
                <button type="button" onClick={() => set_show_password((v) => !v)} className="text-neutral-500 hover:text-neutral-900">
                  {show_password ? 'скрыть' : 'показать'}
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(`${form.login} / ${form.password}`)}
                  className="text-neutral-500 hover:text-neutral-900"
                >
                  скопировать
                </button>
              </span>
            </div>
          ) : null}
        </Section>

        <Section title="зарплата" aside={monthly ? 'идёт в ФОТ' : null}>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block px-1 text-[11px] text-neutral-400">за выход на смену</span>
              {number_input(form.shift_rate, (n) => patch({ shift_rate: n }), '0 ₽', 'ставка за смену')}
            </label>
            {by_shifts ? (
              <div className="space-y-1">
                <span className="block px-1 text-[11px] text-neutral-400">в месяц на руки</span>
                <div className="rounded-2xl bg-neutral-900 px-3 py-3 text-sm font-semibold tabular-nums text-white">
                  {form.schedule ? rub(monthly) : '—'}
                </div>
              </div>
            ) : (
              <label className="space-y-1">
                <span className="block px-1 text-[11px] text-neutral-400">или фикс в месяц</span>
                {number_input(form.salary_net, (n) => patch({ salary_net: n }), '0 ₽', 'фикс в месяц')}
              </label>
            )}
          </div>
          {by_shifts ? (
            <p className="px-1 text-xs text-neutral-400">
              {form.schedule
                ? `${planned} смен по графику в этом месяце × ${rub(form.shift_rate)} — считается само, каждый месяц заново`
                : 'задай график ниже — оклад посчитается сам'}
            </p>
          ) : null}
          <button type="button" onClick={() => patch({ with_ndfl: !form.with_ndfl })} className={chip(form.with_ndfl)}>
            {form.with_ndfl ? 'с ндфл' : 'без ндфл'}
          </button>
        </Section>

        <Section title="график" aside={schedule_label(schedule)}>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => set_kind('cycle')} className={chip(schedule?.kind === 'cycle')}>
              сменами
            </button>
            <button type="button" onClick={() => set_kind('week')} className={chip(schedule?.kind === 'week')}>
              по дням недели
            </button>
            {schedule ? (
              <button type="button" onClick={() => patch({ schedule: null })} className={chip(false)}>
                без графика
              </button>
            ) : null}
          </div>

          {schedule?.kind === 'cycle' ? (
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="block px-1 text-[11px] text-neutral-400">работает</span>
                {number_input(schedule.on, (n) => patch_schedule({ on: Math.min(14, Math.max(1, n)) }), '2', 'рабочих дней')}
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-[11px] text-neutral-400">отдыхает</span>
                <input
                  inputMode="numeric"
                  value={String(schedule.off)}
                  onChange={(e) => patch_schedule({ off: Math.min(14, Math.max(0, Number(e.target.value.replace(/[^\d]/g, '')) || 0)) })}
                  aria-label="выходных дней"
                  className={`${field} tabular-nums`}
                />
              </label>
              <label className="space-y-1">
                <span className="block px-1 text-[11px] text-neutral-400">первый день</span>
                <input
                  type="date"
                  value={schedule.start}
                  onChange={(e) => e.target.value && patch_schedule({ start: e.target.value })}
                  aria-label="первый рабочий день цикла"
                  className={field}
                />
              </label>
            </div>
          ) : null}

          {schedule?.kind === 'week' ? (
            <div className="flex flex-wrap gap-1.5">
              {weekday_labels.map((day) => (
                <button key={day.id} type="button" onClick={() => toggle_day(day.id)} className={chip(schedule.days.includes(day.id))}>
                  {day.label}
                </button>
              ))}
            </div>
          ) : null}

          {schedule ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={schedule.from} onChange={(e) => patch_schedule({ from: e.target.value })} aria-label="с" className={field} />
                <input type="time" value={schedule.to} onChange={(e) => patch_schedule({ to: e.target.value })} aria-label="до" className={field} />
              </div>
              <div className="grid grid-cols-7 gap-1 pt-1">
                {days.map((day) => {
                  const on = works_on(schedule, day);
                  const wd = short_days[new Date(`${day}T12:00:00Z`).getUTCDay()];
                  return (
                    <div
                      key={day}
                      className={`rounded-xl py-1.5 text-center ${on ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-400'} ${
                        day === today ? 'ring-2 ring-accent/60' : ''
                      }`}
                    >
                      <p className="text-[10px] leading-tight opacity-70">{wd}</p>
                      <p className="text-sm font-semibold tabular-nums leading-tight">{Number(day.slice(8))}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-neutral-400">выбери, как работает сотрудник — увидишь ближайшие две недели</p>
          )}
        </Section>

        <Section title="о сотруднике">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="телефон"
            aria-label="телефон"
            className={field}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block px-1 text-[11px] text-neutral-400">день рождения</span>
              <input type="date" value={form.birthday} onChange={(e) => patch({ birthday: e.target.value })} aria-label="день рождения" className={field} />
            </label>
            <label className="space-y-1">
              <span className="block px-1 text-[11px] text-neutral-400">работает с</span>
              <input type="date" value={form.hired_at} onChange={(e) => patch({ hired_at: e.target.value })} aria-label="работает с" className={field} />
            </label>
          </div>
          <textarea
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="заметка: медкнижка, размер формы, договорённости"
            aria-label="заметка"
            rows={3}
            className={`${field} resize-none`}
          />
        </Section>

        <Section title="точки" aside={form.spot_ids.length ? null : 'любая активная'}>
          <div className="flex flex-wrap gap-1.5">
            {spots.map((spot) => {
              const on = form.spot_ids.includes(spot.id);
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() =>
                    patch({ spot_ids: on ? form.spot_ids.filter((id) => id !== spot.id) : [...form.spot_ids, spot.id] })
                  }
                  className={chip(on)}
                >
                  {spot_short(spot)}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="что видит на кассе">
          <div className="flex flex-wrap gap-1.5">
            {seller_right_ids
              .filter((id) => id !== 'push')
              .map((id) => (
                <button key={id} type="button" onClick={() => toggle_right(id)} className={chip(form.access[id])}>
                  {seller_right_label[id]}
                </button>
              ))}
          </div>
        </Section>
      </div>

      {!is_new ? (
        <button type="button" onClick={() => void remove()} className="mt-6 text-sm text-neutral-400 hover:text-red-500">
          удалить сотрудника
        </button>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/90 p-1.5 pl-4 shadow-[0_12px_40px_rgba(0,0,0,0.14)] ring-1 ring-black/5 backdrop-blur">
          <span className={`text-sm ${error ? 'text-red-500' : 'text-neutral-500'}`}>
            {error || saved || (dirty ? 'есть изменения' : 'всё сохранено')}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving || (form.password.length > 0 && form.password.length < 8)}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {saving ? 'сохраняем…' : is_new ? 'добавить' : 'сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
