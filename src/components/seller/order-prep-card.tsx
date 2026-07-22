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
import { color_for_id } from '@/lib/seller-tile-grid';
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
  const tint = color_for_id(o.id);

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
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border px-2 py-2 transition ${
        is_new ? 'seller-order-new ring-2 ring-accent/40' : ''
      } ${mode === 'done' ? 'opacity-80' : ''}`}
      style={{
        backgroundColor: tint.bg,
        borderColor: is_new ? undefined : tint.border,
        color: tint.fg,
      }}
    >
      <div className="flex items-start justify-between gap-1 shrink-0">
        <div className="min-w-0">
          <p className="text-[9px] font-medium opacity-70">
            № {format_order_number(o)}
            {is_new ? (
              <span className="ml-1 rounded bg-accent px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
                новый
              </span>
            ) : null}
          </p>
          <p className="text-xs font-bold truncate mt-0.5">{customer_label(o)}</p>
          <p className="text-[9px] tabular-nums opacity-70 mt-0.5 truncate">
            {phone ? format_phone_display(phone) : 'без тел.'}
          </p>
          <p className="text-[9px] mt-0.5 font-medium opacity-80">
            {paid ? 'оплачен' : 'не оплачен'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tabular-nums leading-none">
            {pickup_label(o.pickup_time)}
          </p>
          <p className="text-[8px] opacity-60 mt-0.5">выдача</p>
        </div>
      </div>

      {mode !== 'done' && (
        <div className="mt-1.5 mb-1 min-h-0 flex-1 flex flex-col items-center justify-center">
          {createElement(circular_timer, {
            progress: ring_progress,
            label,
            sublabel,
            urgent,
            active: cooking,
            tone,
            compact: true,
            disabled: mode === 'ready' && !all_done,
            on_click: handle_circle,
          })}
          {mode === 'work' && current && !all_done ? (
            <p className="mt-1 text-center text-[10px] font-semibold line-clamp-1 opacity-90">
              {current.name}
            </p>
          ) : null}
        </div>
      )}

      {mode === 'done' && (
        <div className="mt-1 mb-1 min-h-0 flex-1 flex justify-center items-center">
          {createElement(circular_timer, {
            progress: 1,
            label: 'выдан',
            tone: 'done',
            compact: true,
            disabled: true,
            on_click: () => {},
          })}
        </div>
      )}

      <ul className="mt-auto space-y-0.5 shrink-0 max-h-[28%] overflow-hidden">
        {list_drinks.slice(0, 3).map((d) => {
          const st = prep[d.key];
          const is_current = current?.key === d.key && mode === 'work';
          const is_flying = flying_key === d.key;
          return (
            <li
              key={d.key}
              className={`flex items-center justify-between gap-1 rounded-lg px-1 py-0.5 text-[10px] transition ${
                is_flying ? 'bg-white/50' : ''
              } ${is_current ? 'bg-white/40 font-semibold' : 'opacity-75'}`}
            >
              <span className={`truncate ${st?.done ? 'line-through opacity-50' : ''}`}>
                {d.name}
              </span>
              <span className="shrink-0 text-[8px] font-medium uppercase tracking-wide opacity-60">
                {st?.done ? 'ok' : is_current && cooking ? 'сейчас' : '…'}
              </span>
            </li>
          );
        })}
        {list_drinks.length > 3 ? (
          <li className="text-[9px] opacity-60 text-center">+{list_drinks.length - 3}</li>
        ) : null}
      </ul>

      {mode === 'work' && done_count > 0 && !all_done ? (
        <p className="mt-1 text-center text-[9px] opacity-70 shrink-0">
          {done_count}/{drinks.length}
        </p>
      ) : null}
    </article>
  );
}
