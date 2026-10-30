'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { format_order_number } from '@/lib/order-number';
import { format_phone_display } from '@/lib/phone';
import { play_drink_ready_chime, play_timer_tick } from '@/lib/order-chime';
import type { order } from '@/lib/types';
import { color_for_id } from '@/lib/seller-tile-grid';
import circular_timer from '@/components/seller/circular-timer';

export type drink_row = {
  key: string;
  name: string;
  menu_id: string;
  prep_minutes: number;
  volume?: string;
  temp?: 'cold' | 'hot';
  done?: boolean;
  started?: boolean;
};

export type prep_state = {
  started_at: number | null;
  done: boolean;
  finished_at?: number | null;
};

function order_is_paid(o: order) {
  return (
    Boolean(o.is_paid) ||
    o.payment_type === 'bonus' ||
    (o.payment_type === 'online' && Number(o.total_price) === 0)
  );
}

function payment_under_label(o: order) {
  if (o.payment_type === 'bonus' || (o.payment_type === 'online' && Number(o.total_price) === 0)) {
    return 'оплачен бобаллами · выдайте';
  }
  return 'оплачен · к выдаче';
}

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
  on_open_cook?: (drink: drink_row) => void;
  on_edit?: (order: order) => void;
  on_delete?: (order: order) => void;
  guide_open?: boolean;
};

const NUDGE_MS = 3 * 60_000;

function format_elapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  on_open_cook,
  on_edit,
  on_delete,
  guide_open = false,
}: props) {
  const [now, set_now] = useState(Date.now());
  const [show_info, set_show_info] = useState(false);
  const nudged_bucket = useRef(0);
  const nudge_seen = useRef(false);
  const autostarted = useRef<string | null>(null);
  const paid = order_is_paid(o);
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

  const started_marks = drinks
    .map((drink) => prep[drink.key]?.started_at)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const order_started = started_marks.length ? Math.min(...started_marks) : null;
  const elapsed = order_started ? Math.max(0, now - order_started) : 0;

  useEffect(() => {
    autostarted.current = null;
    nudged_bucket.current = 0;
    nudge_seen.current = false;
  }, [o.id]);

  useEffect(() => {
    if (mode !== 'work' || !current || current_st?.done || current_st?.started_at) return;
    if (autostarted.current === current.key) return;
    autostarted.current = current.key;
    on_start_drink(o.id, current);
  }, [mode, current, current_st?.done, current_st?.started_at, current?.key, o.id, on_start_drink]);

  useEffect(() => {
    if (mode !== 'work' || !order_started) return;
    const bucket = Math.floor((now - order_started) / NUDGE_MS);
    if (!nudge_seen.current) {
      nudge_seen.current = true;
      nudged_bucket.current = bucket;
      return;
    }
    if (bucket > nudged_bucket.current) {
      nudged_bucket.current = bucket;
      play_timer_tick();
    }
  }, [now, mode, order_started]);

  useEffect(() => {
    set_show_info(false);
  }, [o.id, mode, guide_open]);

  const expected_total = drinks.reduce((sum, drink) => sum + Math.max(0, drink.prep_minutes) * 60_000, 0);
  const progress = order_started && expected_total > 0 ? Math.min(1, elapsed / expected_total) : order_started ? 1 : 0;

  const can_finalize = all_done || (mode === 'ready' && paid);

  function handle_circle() {
    if (mode === 'done') return;

    if (can_finalize) {
      on_final_action(o);
      return;
    }

    if (mode === 'ready') return;

    if (current && current_st?.started_at && !current_st.done) {
      const started = current_st.started_at;
      const actual = Math.max(1000, Date.now() - started);
      play_drink_ready_chime();
      on_mark_drink_done(o.id, current, {
        actual_ms: actual,
        expected_ms: current.prep_minutes * 60_000,
        started_at: started,
      });
      return;
    }

    if (on_open_cook && current) {
      on_open_cook(current);
      return;
    }

    if (!current) return;
    on_start_drink(o.id, current);
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
    title = `№ ${order_no}`;
    subtitle = undefined;
    title_hero = true;
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
    title_hero = false;
  } else if (mode === 'work' && current) {
    tone = 'cooking';
    title = format_elapsed(elapsed);
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
        : mode === 'work' && order_started
          ? progress
          : 1;

  const under_label =
    mode === 'work' && current && !all_done
      ? current.name
      : mode === 'ready' && all_done
        ? paid
          ? payment_under_label(o)
          : 'к оплате'
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
      } ${mode === 'done' ? 'opacity-80' : ''} ${
        mode !== 'done' ? 'cursor-pointer' : ''
      }`}
      onClick={() => {
        if (mode === 'done') return;
        if (can_finalize) {
          on_final_action(o);
          return;
        }
        if (mode === 'work' && !cooking && on_open_cook && current) {
          on_open_cook(current);
        }
      }}
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
          onClick={(e) => e.stopPropagation()}
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
              выдача {pickup_label(o.pickup_time)} ·{' '}
              {paid
                ? o.payment_type === 'bonus' || Number(o.total_price) === 0
                  ? 'оплачен бобаллами'
                  : 'оплачен'
                : 'не оплачен'}
            </p>
            <ul className="mt-2.5 space-y-1">
              {drinks.map((d) => {
                const st = prep[d.key];
                const is_current = current?.key === d.key && mode === 'work';
                const is_flying = flying_key === d.key;
                const row = (
                  <div
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
                  </div>
                );
                return (
                  <li key={d.key}>
                    {on_open_cook ? (
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          set_show_info(false);
                          on_open_cook(d);
                        }}
                      >
                        {row}
                      </button>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {on_edit || on_delete ? (
            <div className="mt-2 flex shrink-0 gap-1.5">
              {on_edit ? (
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-white/80 py-2 text-[clamp(0.65rem,2.6cqw,0.8rem)] font-semibold"
                  onClick={() => on_edit(o)}
                >
                  изменить
                </button>
              ) : null}
              {on_delete ? (
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-white/80 py-2 text-[clamp(0.65rem,2.6cqw,0.8rem)] font-semibold text-red-600"
                  onClick={() => on_delete(o)}
                >
                  удалить
                </button>
              ) : null}
            </div>
          ) : null}
          {on_open_cook && (current || drinks[0]) ? (
            <button
              type="button"
              className="mt-2 w-full shrink-0 rounded-xl bg-white/70 py-2 text-[clamp(0.7rem,2.8cqw,0.85rem)] font-semibold"
              onClick={() => {
                const drink = current || drinks[0];
                if (!drink) return;
                set_show_info(false);
                on_open_cook(drink);
              }}
            >
              посмотреть рецепт
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3">
        <div className="aspect-square w-[min(100%,68cqh)] shrink-0">
          {createElement(circular_timer, {
            progress: ring_progress,
            label: title,
            sublabel: subtitle,
            sublabel_style: subtitle_style,
            urgent: false,
            active: mode === 'work' && Boolean(order_started),
            tone,
            colors: timer_colors,
            fill: true,
            hero: title_hero,
            disabled: mode === 'done' || (mode === 'ready' && !can_finalize),
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
