'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { format_order_number } from '@/lib/order-number';
import { format_countdown_ms } from '@/lib/kitchen-queue';
import { format_phone_display } from '@/lib/phone';
import {
  play_drink_ready_chime,
  play_start_chime,
  play_timer_alarm,
  play_timer_tick,
} from '@/lib/order-chime';
import type { order } from '@/lib/types';
import circular_timer from '@/components/seller/circular-timer';

export type drink_row = {
  key: string;
  name: string;
  menu_id: string;
  prep_minutes: number;
};

export type prep_state = {
  started_at: number | null;
  done: boolean;
  finished_at?: number | null;
};

type mode = 'work' | 'ready' | 'done';

type props = {
  order: order;
  drinks: drink_row[];
  prep: Record<string, prep_state>;
  is_new?: boolean;
  mode: mode;
  flying_key?: string | null;
  on_start_drink: (order_id: string, drink: drink_row) => void;
  on_mark_drink_done: (
    order_id: string,
    drink: drink_row,
    meta: { actual_ms: number; expected_ms: number; started_at: number }
  ) => void;
  on_final_action: (o: order) => void;
};

function pickup_label(pickup_time: string) {
  return new Date(pickup_time).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function customer_label(o: order) {
  return (o.customer_name || '').trim() || 'гость';
}

export default function order_prep_card({
  order: o,
  drinks,
  prep,
  is_new = false,
  mode,
  flying_key = null,
  on_start_drink,
  on_mark_drink_done,
  on_final_action,
}: props) {
  const [now, set_now] = useState(Date.now());
  const warned_sec = useRef<number | null>(null);
  const alarmed_for = useRef<string | null>(null);
  const paid = Boolean(o.is_paid);
  const phone = (o.customer_phone || '').trim();

  const done_count = drinks.filter((d) => prep[d.key]?.done).length;
  const all_done = drinks.length > 0 && done_count === drinks.length;
  const current = drinks.find((d) => !prep[d.key]?.done) || null;
  const current_st = current ? prep[current.key] : null;
  const cooking = Boolean(current && current_st?.started_at && !current_st.done);
  const current_index = current
    ? drinks.findIndex((d) => d.key === current.key) + 1
    : drinks.length;

  useEffect(() => {
    const id = setInterval(() => set_now(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== 'work' || !current || !current_st?.started_at || current_st.done) return;

    const expected_ms = current.prep_minutes * 60_000;
    const ends = current_st.started_at + expected_ms;
    const left = ends - now;
    const left_sec = Math.ceil(left / 1000);

    if (left > 0 && left_sec <= 5 && left_sec > 0 && warned_sec.current !== left_sec) {
      warned_sec.current = left_sec;
      play_timer_tick();
    }

    if (left <= 0) {
      if (alarmed_for.current !== current.key) {
        alarmed_for.current = current.key;
        play_timer_alarm();
      }
      on_mark_drink_done(o.id, current, {
        actual_ms: expected_ms,
        expected_ms,
        started_at: current_st.started_at,
      });
    }
  }, [now, mode, current, current_st, o.id, on_mark_drink_done]);

  useEffect(() => {
    warned_sec.current = null;
  }, [current?.key]);

  const expected_ms = current ? current.prep_minutes * 60_000 : 0;
  const ends_at =
    cooking && current_st?.started_at ? current_st.started_at + expected_ms : null;
  const left = ends_at ? Math.max(0, ends_at - now) : 0;
  const progress = cooking && expected_ms > 0 ? left / expected_ms : 1;
  const urgent = cooking && left > 0 && left <= 5000;

  function handle_circle() {
    if (mode === 'done') return;

    if (mode === 'ready') {
      if (!all_done) return;
      on_final_action(o);
      return;
    }

    if (mode === 'work' && all_done) {
      on_final_action(o);
      return;
    }

    if (!current) return;

    if (!current_st?.started_at) {
      play_start_chime();
      on_start_drink(o.id, current);
      return;
    }

    if (!current_st.done) {
      const started = current_st.started_at;
      const actual = Math.max(1000, Date.now() - started);
      play_drink_ready_chime();
      on_mark_drink_done(o.id, current, {
        actual_ms: actual,
        expected_ms: current.prep_minutes * 60_000,
        started_at: started,
      });
    }
  }

  let tone: 'idle' | 'cooking' | 'ready' | 'pay' | 'handout' | 'done' = 'idle';
  let label = 'начать';
  let sublabel = drinks.length > 1 ? `1 из ${drinks.length}` : undefined;

  if (mode === 'done') {
    tone = 'done';
    label = 'выдан';
    sublabel = undefined;
  } else if (mode === 'ready' && !all_done) {
    tone = 'ready';
    label = `${done_count}/${drinks.length}`;
    sublabel = 'собирается';
  } else if (mode === 'ready' || all_done) {
    if (paid) {
      tone = 'handout';
      label = 'выдать';
    } else {
      tone = 'pay';
      label = 'оплатить';
    }
    sublabel = undefined;
  } else if (cooking) {
    tone = urgent ? 'ready' : 'cooking';
    label = format_countdown_ms(left);
    sublabel = 'готово';
  } else if (current) {
    tone = 'idle';
    label = 'начать';
    sublabel = `${current_index} из ${drinks.length}`;
  }

  const show_done_list = mode === 'ready' || mode === 'done';
  const list_drinks = show_done_list
    ? drinks.filter((d) => prep[d.key]?.done)
    : drinks;

  const ring_progress =
    mode === 'ready' && !all_done
      ? done_count / Math.max(drinks.length, 1)
      : mode === 'ready' || all_done
        ? 1
        : cooking
          ? progress
          : 1;

  return (
    <article
      className={`rounded-3xl border bg-white px-4 py-4 transition ${
        is_new ? 'border-neutral-300 ring-1 ring-neutral-200' : 'border-neutral-100'
      } ${mode === 'done' ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-neutral-400">
            № {format_order_number(o)}
            {is_new ? <span className="ml-2 text-neutral-600">новый</span> : null}
          </p>
          <p className="text-[15px] font-semibold text-neutral-900 truncate mt-0.5">
            {customer_label(o)}
          </p>
          <p className="text-xs tabular-nums text-neutral-500 mt-0.5">
            {phone ? format_phone_display(phone) : 'телефон не указан'}
          </p>
          <p className={`text-[11px] mt-1 font-medium ${paid ? 'text-neutral-500' : 'text-neutral-700'}`}>
            {paid ? 'оплачен' : 'не оплачен'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold tabular-nums text-neutral-900 leading-none">
            {pickup_label(o.pickup_time)}
          </p>
          <p className="text-[10px] text-neutral-400 mt-1">выдача</p>
        </div>
      </div>

      {mode !== 'done' && (
        <div className="mt-4 mb-3">
          {createElement(circular_timer, {
            progress: ring_progress,
            label,
            sublabel,
            urgent,
            active: cooking,
            tone,
            disabled: mode === 'ready' && !all_done,
            on_click: handle_circle,
          })}
          {mode === 'work' && current && !all_done ? (
            <p className="mt-3 text-center text-sm font-semibold text-neutral-800">
              {current.name}
            </p>
          ) : null}
        </div>
      )}

      {mode === 'done' && (
        <div className="mt-3 mb-1 flex justify-center">
          {createElement(circular_timer, {
            progress: 1,
            label: 'выдан',
            tone: 'done',
            disabled: true,
            on_click: () => {},
          })}
        </div>
      )}

      <ul className="mt-2 space-y-1">
        {list_drinks.map((d) => {
          const st = prep[d.key];
          const is_current = current?.key === d.key && mode === 'work';
          const is_flying = flying_key === d.key;
          return (
            <li
              key={d.key}
              className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm transition ${
                is_flying ? 'bg-neutral-100' : ''
              } ${
                st?.done
                  ? 'text-neutral-500'
                  : is_current
                    ? 'bg-neutral-50 text-neutral-900'
                    : 'text-neutral-500'
              }`}
            >
              <span className={`truncate ${st?.done ? 'line-through decoration-neutral-300' : ''}`}>
                {d.name}
              </span>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                {st?.done ? 'готово' : is_current && cooking ? 'сейчас' : 'ожидает'}
              </span>
            </li>
          );
        })}
      </ul>

      {mode === 'work' && done_count > 0 && !all_done ? (
        <p className="mt-2 text-center text-[11px] text-neutral-500">
          {done_count} из {drinks.length} готово
        </p>
      ) : null}
    </article>
  );
}
