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

function info_button({
  open,
  on_toggle,
  color,
}: {
  open: boolean;
  on_toggle: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        on_toggle();
      }}
      className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[11px] font-bold leading-none backdrop-blur-sm active:scale-95"
      style={{ color }}
      aria-label={open ? 'скрыть детали' : 'детали заказа'}
      aria-pressed={open}
    >
      {open ? '×' : 'i'}
    </button>
  );
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
  const [show_info, set_show_info] = useState(false);
  const warned_sec = useRef<number | null>(null);
  const alarmed_for = useRef<string | null>(null);
  const paid = Boolean(o.is_paid);
  const phone = (o.customer_phone || '').trim();
  const tint = color_for_id(o.id);
  const order_no = format_order_number(o);

  const done_count = drinks.filter((d) => prep[d.key]?.done).length;
  const all_done = drinks.length > 0 && done_count === drinks.length;
  const current = drinks.find((d) => !prep[d.key]?.done) || null;
  const current_st = current ? prep[current.key] : null;
  const cooking = Boolean(current && current_st?.started_at && !current_st.done);

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

  useEffect(() => {
    set_show_info(false);
  }, [o.id, mode]);

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
  /** главный текст в центре круга */
  let title = `№ ${order_no}`;
  /** текст под главным */
  let subtitle: string | undefined;
  let subtitle_style: 'caps' | 'plain' | 'hero' = 'caps';
  let title_hero = true;

  if (mode === 'done') {
    tone = 'done';
    title = 'выдан';
    subtitle = `№ ${order_no}`;
    subtitle_style = 'hero';
    title_hero = false;
  } else if (mode === 'ready' && !all_done) {
    tone = 'ready';
    title = `№ ${order_no}`;
    subtitle = `${done_count}/${drinks.length}`;
    subtitle_style = 'plain';
  } else if (mode === 'ready' || all_done) {
    if (paid) {
      tone = 'handout';
      title = 'выдать';
    } else {
      tone = 'pay';
      title = 'оплатить';
    }
    subtitle = `№ ${order_no}`;
    subtitle_style = 'hero';
    title_hero = true;
  } else if (cooking) {
    tone = urgent ? 'ready' : 'cooking';
    title = format_countdown_ms(left);
    subtitle = `№ ${order_no}`;
    subtitle_style = 'hero';
    title_hero = true;
  } else if (current) {
    tone = 'idle';
    title = `№ ${order_no}`;
    title_hero = true;
  }

  const ring_progress =
    mode === 'ready' && !all_done
      ? done_count / Math.max(drinks.length, 1)
      : mode === 'ready' || all_done || mode === 'done'
        ? 1
        : cooking
          ? progress
          : 1;

  const under_label =
    mode === 'work' && current && !all_done
      ? current.name
      : mode === 'ready' && all_done
        ? paid
          ? 'к выдаче'
          : 'к оплате'
        : mode === 'done'
          ? 'выдан'
          : null;

  const timer_colors = {
    fill: '#ffffff',
    ring: tint.fg,
    text: tint.fg,
    track: tint.border,
  };

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border transition ${
        is_new ? 'seller-order-new' : ''
      } ${mode === 'done' ? 'opacity-80' : ''}`}
      style={{
        backgroundColor: tint.bg,
        borderColor: is_new ? undefined : tint.border,
        color: tint.fg,
        containerType: 'size',
      }}
    >
      {createElement(info_button, {
        open: show_info,
        on_toggle: () => set_show_info((v) => !v),
        color: tint.fg,
      })}

      {show_info ? (
        <div
          className="absolute inset-0 z-10 flex flex-col overflow-hidden px-3 py-3 pt-9 text-left backdrop-blur-[2px]"
          style={{ backgroundColor: `${tint.bg}f5` }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-55">
              № {order_no}
              {is_new ? ' · новый' : ''}
            </p>
            <p className="mt-1 text-[clamp(0.85rem,3.8cqw,1.1rem)] font-bold leading-tight">
              {customer_label(o)}
            </p>
            <p className="mt-0.5 text-[clamp(0.65rem,2.6cqw,0.8rem)] tabular-nums opacity-80">
              {phone ? format_phone_display(phone) : 'без телефона'}
            </p>
            <p className="mt-1 text-[10px] opacity-70">
              выдача {pickup_label(o.pickup_time)} · {paid ? 'оплачен' : 'не оплачен'}
            </p>
            <ul className="mt-2.5 space-y-1">
              {drinks.map((d) => {
                const st = prep[d.key];
                const is_current = current?.key === d.key && mode === 'work';
                const is_flying = flying_key === d.key;
                return (
                  <li
                    key={d.key}
                    className={`flex items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-[clamp(0.65rem,2.5cqw,0.78rem)] ${
                      is_flying ? 'bg-white/50' : is_current ? 'bg-white/40 font-semibold' : 'bg-white/25'
                    }`}
                  >
                    <span className={`truncate ${st?.done ? 'line-through opacity-50' : ''}`}>
                      {d.name}
                    </span>
                    <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide opacity-55">
                      {st?.done ? 'ok' : is_current && cooking ? 'сейчас' : '…'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3">
        <div className="aspect-square h-[min(100%,78%)] max-w-full">
          {createElement(circular_timer, {
            progress: ring_progress,
            label: title,
            sublabel: subtitle,
            sublabel_style: subtitle_style,
            urgent,
            active: cooking,
            tone,
            colors: timer_colors,
            fill: true,
            hero: title_hero,
            disabled: mode === 'done' || (mode === 'ready' && !all_done),
            on_click: handle_circle,
          })}
        </div>
        {under_label ? (
          <p className="mt-1.5 max-w-[92%] truncate text-center text-[clamp(0.65rem,2.8cqw,0.82rem)] font-semibold leading-snug opacity-90">
            {under_label}
          </p>
        ) : null}
      </div>
    </article>
  );
}
