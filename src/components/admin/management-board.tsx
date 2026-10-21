'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import {
  empty_management_store,
  new_custom_id,
  new_placement_id,
  card_on_day,
  placement_exact,
  sort_cards,
  task_categories,
  type board_card,
  type check_item,
  type custom_task,
  type management_store,
  type task_category,
} from '@/lib/management-board';
import { moscow_today_iso } from '@/lib/order-number';
import { seller_right_ids, seller_right_label, type seller_right } from '@/lib/seller-access';
import { get_spots, seller_works_at, spot_short, subscribe_spot_store } from '@/lib/spot-store';
import type { store_spot } from '@/lib/types';
import CircularTimer from '@/components/seller/circular-timer';
import PrepVessel, { liquid_tone_for } from '@/components/seller/prep-vessel';
import {
  day_task_media_url,
  iso_weekday_from_day,
  repeat_options,
  weekday_labels,
  type day_task_media,
  type day_task_proof,
  type day_task_repeat,
} from '@/lib/day-task-templates';

type staff = {
  id: string;
  name: string;
  role_title: string;
  is_active: boolean;
  spot_ids: string[];
};

type draft = {
  id: string | null;
  title: string;
  category: task_category;
  time: string;
  minutes: string;
  weekdays: number[];
  date: string;
  repeat: day_task_repeat;
  every: string;
  from: string;
  month: string;
  month_day: string;
  proof: day_task_proof;
  checklist: check_item[];
  access: seller_right[];
  seller_id: string;
};

type drag_state = {
  id: string;
  from: 'library' | 'board';
  x: number;
  y: number;
  moved: boolean;
  pointer: string;
};

const field =
  'w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-900 outline-none';

const opening_color = { bg: '#E8F5E9', fg: '#2E7D32', border: '#A5D6A7' };
const day_color = { bg: '#FFE8E8', fg: '#D64545', border: '#FFC9C9' };
const closing_color = { bg: '#FFF3E0', fg: '#E65100', border: '#FFB74D' };

const widget_card: Record<string, { bg: string; fg: string; border: string; kind: 'pot' | 'teapot' }> = {
  tapioca: { bg: '#FFF1E3', fg: '#C45E1A', border: '#FFD7B0', kind: 'pot' },
  tea_black: { bg: '#F3E8DC', fg: '#6B3A14', border: '#E0C4A8', kind: 'teapot' },
  tea_jasmine: { bg: '#F0F7E8', fg: '#4F7A22', border: '#D4E8B8', kind: 'teapot' },
};

const proof_options: { id: day_task_proof; label: string }[] = [
  { id: 'none', label: 'без отчёта' },
  { id: 'photo', label: 'фотоотчёт' },
  { id: 'video', label: 'видеоотчёт' },
  { id: 'any', label: 'фото или видео' },
];

const line_proof: Record<day_task_proof, string> = {
  none: 'отчёт',
  photo: 'фото',
  video: 'видео',
  any: 'файл',
};

const month_names = [
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

const month_when = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

type scale_id = 'week' | 'month' | 'year';

const scales: { id: scale_id; label: string }[] = [
  { id: 'week', label: 'неделя' },
  { id: 'month', label: 'месяц' },
  { id: 'year', label: 'год' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function iso_date(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function split_iso(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

function add_days(day: string, n: number) {
  const { y, m, d } = split_iso(day);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return iso_date(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function monday_of(day: string) {
  return add_days(day, 1 - iso_weekday_from_day(day));
}

function days_in_month(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function step_inside_year(day: string, dir: 1 | -1, unit: 'week' | 'month') {
  const year = day.slice(0, 4);
  if (unit === 'week') {
    const next = add_days(day, dir * 7);
    if (next.slice(0, 4) === year) return next;
    return dir > 0 ? `${year}-01-01` : `${year}-12-31`;
  }
  const { y, m, d } = split_iso(day);
  let next_m = m + dir;
  if (next_m < 1) next_m = 12;
  if (next_m > 12) next_m = 1;
  return iso_date(y, next_m, Math.min(d, days_in_month(y, next_m)));
}

function moscow_parts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const month = Number(pick('month'));
  const day = Number(pick('day'));
  return {
    iso: `${pick('year')}-${pick('month')}-${pick('day')}`,
    line: `${day} ${month_when[month - 1] || ''}  ${pick('hour')}:${pick('minute')}`,
  };
}

function card_tone(card: board_card) {
  if (card.source === 'opening') return opening_color;
  if (card.source === 'closing') return closing_color;
  if (card.kind === 'widget') return widget_card[card.ref] || widget_card.tapioca;
  return day_color;
}

function tasks_on_day(cards: board_card[], day: string) {
  return sort_cards(cards.filter((card) => card.kind !== 'widget' && card_on_day(card, day)));
}

function new_step_id() {
  return `step-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function next_proof(proof: day_task_proof): day_task_proof {
  if (proof === 'none') return 'photo';
  if (proof === 'photo') return 'video';
  if (proof === 'video') return 'any';
  return 'none';
}

function TaskIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[42%] w-[42%]"
      aria-hidden
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function Ring({ color, children }: { color: { fg: string; border: string }; children: React.ReactNode }) {
  const size = 100;
  const stroke = 5.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative block h-full w-full">
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 h-full w-full" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="#ffffff" stroke={color.border} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color.fg}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={0}
        />
      </svg>
      <div className="absolute inset-[9%] flex items-center justify-center overflow-hidden rounded-full">{children}</div>
    </div>
  );
}

function CashierTile({
  card,
  marked,
  onPointerDown,
  onOpen,
  onRemove,
}: {
  card: board_card;
  marked?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const widget = card.kind === 'widget' ? widget_card[card.ref] || widget_card.tapioca : null;
  const color =
    card.source === 'opening' ? opening_color : card.source === 'closing' ? closing_color : widget || day_color;
  const under =
    card.source === 'opening' ? 'открытие' : card.source === 'closing' ? 'закрытие' : card.title;

  return (
    <article
      aria-label={card.title}
      onPointerDown={onPointerDown}
      className="relative flex h-full min-h-0 cursor-grab select-none flex-col overflow-hidden rounded-2xl border active:cursor-grabbing"
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.fg,
        containerType: 'size',
      }}
    >
      {onRemove ? (
        <button
          type="button"
          aria-label="убрать"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="absolute left-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-sm font-semibold backdrop-blur-sm"
        >
          ×
        </button>
      ) : null}
      {marked ? (
        <span className="absolute left-2 top-2 z-10 text-sm font-bold" aria-hidden>
          ✓
        </span>
      ) : null}
      {onOpen ? (
        <button
          type="button"
          aria-label="открыть"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onOpen}
          className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[11px] font-bold leading-none backdrop-blur-sm"
          style={{ color: color.fg }}
        >
          i
        </button>
      ) : null}
      {widget ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3">
          <div className="aspect-square w-[min(100%,64cqh)] max-w-[9.5rem] shrink-0">
            <PrepVessel kind={widget.kind} fill={0.62} size="fill" tone={liquid_tone_for(card.ref)} />
          </div>
          <p className="mt-1 max-w-[92%] truncate text-center text-[clamp(0.7rem,3cqw,0.95rem)] font-bold leading-snug">
            {card.title}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3">
          <div className="aspect-square w-[min(100%,68cqh)] shrink-0">
            {card.source === 'opening' || card.source === 'closing' ? (
              <CircularTimer
                progress={0}
                label="0%"
                sublabel="выполнено"
                tone="handout"
                colors={{ fill: '#ffffff', ring: color.fg, text: color.fg, track: color.border }}
                fill
                on_click={onOpen || (() => {})}
              />
            ) : (
              <Ring color={color}>
                <TaskIcon color={color.fg} />
              </Ring>
            )}
          </div>
          <p className="mt-1.5 max-w-[92%] truncate text-center text-[clamp(0.65rem,2.8cqw,0.82rem)] font-semibold leading-snug opacity-90">
            {under}
          </p>
        </div>
      )}
    </article>
  );
}

function DayCalendar({
  scale,
  focus,
  today,
  cards,
  exact_ids,
  on_scale,
  on_focus,
  on_drag,
  on_open,
  on_remove,
}: {
  scale: scale_id;
  focus: string;
  today: string;
  cards: board_card[];
  exact_ids: Set<string>;
  on_scale: (scale: scale_id) => void;
  on_focus: (day: string) => void;
  on_drag: (e: React.PointerEvent, id: string) => void;
  on_open: (id: string) => void;
  on_remove: (id: string) => void;
}) {
  const { y, m } = split_iso(focus);
  const week = Array.from({ length: 7 }, (_, i) => add_days(monday_of(focus), i));
  const month_lead = iso_weekday_from_day(iso_date(y, m, 1)) - 1;
  const month_cells: (string | null)[] = [...Array(month_lead).fill(null)];
  for (let d = 1; d <= days_in_month(y, m); d++) month_cells.push(iso_date(y, m, d));
  while (month_cells.length % 7) month_cells.push(null);

  const same_month = week[0].slice(5, 7) === week[6].slice(5, 7);
  const range =
    scale === 'week'
      ? same_month
        ? `${Number(week[0].slice(8))}–${Number(week[6].slice(8))} ${month_names[Number(week[6].slice(5, 7)) - 1]}`
        : `${Number(week[0].slice(8))} ${month_names[Number(week[0].slice(5, 7)) - 1]} – ${Number(week[6].slice(8))} ${month_names[Number(week[6].slice(5, 7)) - 1]}`
      : scale === 'month'
        ? month_names[m - 1]
        : String(y);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {scales.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => on_scale(item.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                scale === item.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {scale === 'year' ? (
          <p className="text-sm font-semibold text-neutral-900">{y}</p>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="назад"
              onClick={() => on_focus(step_inside_year(focus, -1, scale))}
              className="grid h-8 w-8 place-items-center rounded-full text-lg text-neutral-500 hover:bg-neutral-100"
            >
              ‹
            </button>
            <p className="min-w-28 text-center text-sm font-semibold text-neutral-900">{range}</p>
            <button
              type="button"
              aria-label="вперёд"
              onClick={() => on_focus(step_inside_year(focus, 1, scale))}
              className="grid h-8 w-8 place-items-center rounded-full text-lg text-neutral-500 hover:bg-neutral-100"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {scale === 'week' ? (
        <div className="grid min-h-0 flex-1 grid-cols-7 gap-1.5">
          {week.map((day) => {
            const list = tasks_on_day(cards, day);
            const on = day === today;
            return (
              <div key={day} className={`flex min-h-0 flex-col rounded-2xl ${on ? 'bg-neutral-50' : ''}`}>
                <p className={`px-1 py-1 text-center text-xs font-semibold ${on ? 'text-neutral-900' : 'text-neutral-400'}`}>
                  {weekday_labels[iso_weekday_from_day(day) - 1]?.label} {Number(day.slice(8))}
                </p>
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-0.5 pb-1">
                  {list.map((card) => (
                    <div key={card.id} className="h-28 shrink-0">
                      <CashierTile
                        card={card}
                        onPointerDown={(e) => on_drag(e, card.id)}
                        onOpen={() => on_open(card.id)}
                        onRemove={exact_ids.has(card.id) ? () => on_remove(card.id) : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {scale === 'month' ? (
        <div className="grid min-h-0 flex-1 grid-cols-7 gap-1 overflow-y-auto">
          {weekday_labels.map((day) => (
            <p key={day.id} className="text-center text-[11px] font-semibold text-neutral-400">
              {day.label}
            </p>
          ))}
          {month_cells.map((day, index) => {
            const list = day ? tasks_on_day(cards, day) : [];
            return (
              <div
                key={day || `empty-${index}`}
                className={`min-h-16 rounded-xl p-1 ${day === today ? 'bg-neutral-50' : ''}`}
              >
                {day ? (
                  <button
                    type="button"
                    onClick={() => {
                      on_focus(day);
                      on_scale('week');
                    }}
                    className={`mb-1 text-xs font-semibold ${day === today ? 'text-neutral-900' : 'text-neutral-400'}`}
                  >
                    {Number(day.slice(8))}
                  </button>
                ) : null}
                <div className="space-y-0.5">
                  {list.map((card) => {
                    const tone = card_tone(card);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onPointerDown={(e) => on_drag(e, card.id)}
                        className="block w-full truncate rounded-md px-1 py-0.5 text-left text-[10px] font-semibold"
                        style={{ backgroundColor: tone.bg, color: tone.fg }}
                      >
                        {card.time ? `${card.time} ` : ''}
                        {card.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {scale === 'year' ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto xl:grid-cols-4">
          {month_names.map((name, index) => {
            const month = index + 1;
            const lead = iso_weekday_from_day(iso_date(y, month, 1)) - 1;
            const cells: (string | null)[] = [...Array(lead).fill(null)];
            for (let d = 1; d <= days_in_month(y, month); d++) cells.push(iso_date(y, month, d));
            return (
              <div key={name}>
                <button
                  type="button"
                  onClick={() => {
                    on_focus(iso_date(y, month, 1));
                    on_scale('month');
                  }}
                  className="mb-1 text-xs font-semibold text-neutral-900"
                >
                  {name}
                </button>
                <div className="grid grid-cols-7 gap-px">
                  {cells.map((day, cell) => {
                    const list = day ? tasks_on_day(cards, day) : [];
                    const tone = list[0] ? card_tone(list[0]) : null;
                    return (
                      <button
                        key={day || `y-${cell}`}
                        type="button"
                        disabled={!day}
                        onClick={() => {
                          if (!day) return;
                          on_focus(day);
                          on_scale('week');
                        }}
                        className={`h-4 rounded-sm text-[8px] leading-4 ${
                          day === today ? 'font-bold text-neutral-900' : 'text-neutral-400'
                        }`}
                        style={tone ? { backgroundColor: tone.bg, color: tone.fg } : undefined}
                      >
                        {day ? Number(day.slice(8)) : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FolderCard({
  title,
  meta,
  on_open,
}: {
  title: string;
  meta?: string;
  on_open: () => void;
}) {
  return (
    <button
      type="button"
      onClick={on_open}
      className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:bg-neutral-50"
    >
      <p className="truncate text-sm font-semibold text-neutral-900">{title}</p>
      {meta ? <p className="mt-1 truncate text-xs text-neutral-500">{meta}</p> : <span className="mt-1 block h-4" />}
    </button>
  );
}

export default function ManagementBoard() {
  const [screen, set_screen] = useState<'home' | 'board'>('home');
  const [spots, set_spots] = useState<store_spot[]>([]);
  const [staff, set_staff] = useState<staff[]>([]);
  const [store, set_store] = useState<management_store>(empty_management_store);
  const [cards, set_cards] = useState<board_card[]>([]);
  const [ready, set_ready] = useState(false);
  const [spot_id, set_spot_id] = useState<string | null>(null);
  const [seller_id, set_seller_id] = useState<string | null>(null);
  const [draft, set_draft] = useState<draft | null>(null);
  const [ghost, set_ghost] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hot, set_hot] = useState<'board' | 'library' | null>(null);
  const [scale, set_scale] = useState<scale_id>('week');
  const [focus, set_focus] = useState(moscow_today_iso);
  const [now, set_now] = useState(() => new Date());

  const store_ref = useRef(store);
  const cards_ref = useRef(cards);
  const seq = useRef(0);
  const drag = useRef<drag_state | null>(null);
  const board_ref = useRef<HTMLDivElement>(null);
  const library_ref = useRef<HTMLDivElement>(null);
  const place_ref = useRef<(id: string) => void>(() => {});
  const unplace_ref = useRef<(id: string) => void>(() => {});
  const open_ref = useRef<(id: string) => void>(() => {});

  store_ref.current = store;
  cards_ref.current = cards;

  useEffect(() => {
    function reload() {
      set_spots(get_spots());
    }
    reload();
    return subscribe_spot_store(reload);
  }, []);

  useEffect(() => {
    let stop = false;
    void (async () => {
      const [board_res, staff_res] = await Promise.all([
        fetch('/api/admin/management-board', { credentials: 'same-origin' }),
        fetch('/api/sellers', { credentials: 'same-origin' }),
      ]);
      if (stop) return;
      if (board_res.ok) {
        const data = (await board_res.json()) as { store: management_store; cards: board_card[] };
        store_ref.current = data.store;
        set_store(data.store);
        set_cards(data.cards);
      }
      if (staff_res.ok) {
        const data = (await staff_res.json()) as {
          sellers?: {
            id: string;
            name: string;
            role_title?: string;
            is_active?: boolean;
            spot_ids?: string[];
          }[];
        };
        set_staff(
          (data.sellers || []).map((person) => ({
            id: person.id,
            name: person.name,
            role_title: person.role_title || '',
            is_active: person.is_active !== false,
            spot_ids: person.spot_ids || [],
          }))
        );
      }
      set_ready(true);
    })();
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => set_now(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function zone_at(x: number, y: number): 'board' | 'library' | null {
      const board_box = board_ref.current?.getBoundingClientRect();
      const library_box = library_ref.current?.getBoundingClientRect();
      if (
        board_box &&
        x >= board_box.left &&
        x <= board_box.right &&
        y >= board_box.top &&
        y <= board_box.bottom
      ) {
        return 'board';
      }
      if (
        library_box &&
        x >= library_box.left &&
        x <= library_box.right &&
        y >= library_box.top &&
        y <= library_box.bottom
      ) {
        return 'library';
      }
      return null;
    }

    function on_move(e: PointerEvent) {
      const current = drag.current;
      if (!current) return;
      const dx = e.clientX - current.x;
      const dy = e.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) < 8) return;
      if (current.pointer === 'touch' && !current.moved && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      current.moved = true;
      set_ghost({ id: current.id, x: e.clientX, y: e.clientY });
      set_hot(zone_at(e.clientX, e.clientY));
    }

    function on_up(e: PointerEvent) {
      const current = drag.current;
      drag.current = null;
      set_ghost(null);
      set_hot(null);
      if (!current) return;
      if (!current.moved) {
        open_ref.current(current.id);
        return;
      }
      const zone = zone_at(e.clientX, e.clientY);
      if (zone === 'board' && current.from === 'library') place_ref.current(current.id);
      if (zone === 'library' && current.from === 'board') unplace_ref.current(current.id);
    }

    window.addEventListener('pointermove', on_move);
    window.addEventListener('pointerup', on_up);
    return () => {
      window.removeEventListener('pointermove', on_move);
      window.removeEventListener('pointerup', on_up);
    };
  }, []);

  useEffect(() => {
    if (!draft) return;
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') set_draft(null);
    }
    window.addEventListener('keydown', on_key);
    return () => window.removeEventListener('keydown', on_key);
  }, [draft]);

  const active_spots = useMemo(() => spots.filter((spot) => spot.is_active), [spots]);
  const active_staff = useMemo(() => staff.filter((person) => person.is_active), [staff]);

  const spot_choices = useMemo(() => {
    if (!seller_id) return active_spots;
    const person = active_staff.find((item) => item.id === seller_id);
    if (!person || !person.spot_ids.length) return active_spots;
    return active_spots.filter((spot) => person.spot_ids.includes(spot.id));
  }, [active_spots, active_staff, seller_id]);

  const staff_choices = useMemo(() => {
    if (!spot_id) return active_staff;
    return active_staff.filter((person) => seller_works_at(person.spot_ids, spot_id));
  }, [active_staff, spot_id]);

  const placed = useMemo(() => {
    function covers(row: (typeof store.placements)[number]) {
      const spot_ok = spot_id ? !row.spot_id || row.spot_id === spot_id : !row.spot_id;
      const person_ok = seller_id ? !row.seller_id || row.seller_id === seller_id : !row.seller_id;
      return spot_ok && person_ok;
    }
    return sort_cards(cards.filter((card) => store.placements.some((row) => row.card_id === card.id && covers(row))));
  }, [cards, seller_id, spot_id, store.placements]);

  const exact_ids = useMemo(() => {
    const ids = new Set<string>();
    for (const row of store.placements) {
      if (placement_exact(row, spot_id, seller_id)) ids.add(row.card_id);
    }
    return ids;
  }, [seller_id, spot_id, store.placements]);

  const placed_ids = useMemo(() => new Set(placed.map((card) => card.id)), [placed]);
  const library = useMemo(
    () => sort_cards(cards.filter((card) => !placed_ids.has(card.id))),
    [cards, placed_ids]
  );
  const widgets = useMemo(() => placed.filter((card) => card.kind === 'widget'), [placed]);
  const clock = moscow_parts(now);

  async function commit(next: management_store) {
    const token = ++seq.current;
    store_ref.current = next;
    set_store(next);
    const res = await fetch('/api/admin/management-board', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ store: next }),
    });
    if (seq.current !== token) return;
    if (!res.ok) {
      const again = await fetch('/api/admin/management-board', { credentials: 'same-origin' });
      if (!again.ok || seq.current !== token) return;
      const data = (await again.json()) as { store: management_store; cards: board_card[] };
      store_ref.current = data.store;
      set_store(data.store);
      set_cards(data.cards);
      return;
    }
    const data = (await res.json()) as { store: management_store; cards: board_card[] };
    if (seq.current !== token) return;
    store_ref.current = data.store;
    set_store(data.store);
    set_cards(data.cards);
  }

  function place(card_id: string) {
    const current = store_ref.current;
    const already = current.placements.some((row) => {
      if (row.card_id !== card_id) return false;
      const spot_ok = spot_id ? !row.spot_id || row.spot_id === spot_id : !row.spot_id;
      const person_ok = seller_id ? !row.seller_id || row.seller_id === seller_id : !row.seller_id;
      return spot_ok && person_ok;
    });
    if (already) return;
    void commit({
      ...current,
      placements: [
        ...current.placements,
        { id: new_placement_id(), card_id, spot_id, seller_id },
      ],
    });
  }

  function unplace(card_id: string) {
    const current = store_ref.current;
    void commit({
      ...current,
      placements: current.placements.filter(
        (row) => !(row.card_id === card_id && placement_exact(row, spot_id, seller_id))
      ),
    });
  }

  place_ref.current = place;
  unplace_ref.current = unplace;

  function open_card(id: string) {
    const card = cards_ref.current.find((item) => item.id === id);
    if (!card) return;
    set_draft({
      id: card.id,
      title: card.title,
      category: card.category,
      time: card.time || '12:00',
      minutes: card.minutes ? String(card.minutes) : '',
      weekdays: card.weekdays.length ? [...card.weekdays] : [1, 2, 3, 4, 5, 6, 7],
      date: card.date || moscow_today_iso(),
      repeat: card.repeat,
      every: String(card.every || 1),
      from: card.from || moscow_today_iso(),
      month: String(card.month || 1),
      month_day: String(card.month_day || 1),
      proof: card.proof,
      checklist: card.checklist.map((item) => ({ ...item })),
      access: card.access.length ? [...card.access] : ['work'],
      seller_id: seller_id || '',
    });
  }

  open_ref.current = open_card;

  function open_new() {
    set_draft({
      id: null,
      title: '',
      category: 'once',
      time: '12:00',
      minutes: '',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      date: moscow_today_iso(),
      repeat: 'daily',
      every: '1',
      from: moscow_today_iso(),
      month: '1',
      month_day: '1',
      proof: 'photo',
      checklist: [],
      access: ['work'],
      seller_id: seller_id || '',
    });
  }

  function pick_spot(id: string) {
    const next = id || null;
    set_spot_id(next);
    if (!seller_id || !next) return;
    const person = active_staff.find((item) => item.id === seller_id);
    if (person && !seller_works_at(person.spot_ids, next)) set_seller_id(null);
  }

  function pick_seller(id: string) {
    const next = id || null;
    set_seller_id(next);
    if (!next) return;
    const person = active_staff.find((item) => item.id === next);
    if (!person) return;
    if (spot_id && seller_works_at(person.spot_ids, spot_id)) return;
    if (person.spot_ids.length === 1) set_spot_id(person.spot_ids[0]);
    else set_spot_id(null);
  }

  function start_drag(e: React.PointerEvent, id: string, from: 'library' | 'board') {
    if (e.button !== 0) return;
    drag.current = {
      id,
      from,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      pointer: e.pointerType,
    };
  }

  function draft_task(id: string, title: string, note: string): custom_task {
    const access = draft!.access.length ? draft!.access : (['work'] as seller_right[]);
    const weekdays = draft!.weekdays.length ? draft!.weekdays : [1, 2, 3, 4, 5, 6, 7];
    const date = draft!.category === 'once' ? draft!.date || moscow_today_iso() : null;
    const checklist = draft!.checklist
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text || item.media);
    return {
      id,
      title,
      note,
      category: draft!.category,
      time: draft!.time || '12:00',
      minutes: Math.min(240, Math.max(0, Math.round(Number(draft!.minutes) || 0))),
      proof: draft!.proof,
      repeat: draft!.repeat,
      every: Math.min(365, Math.max(1, Math.round(Number(draft!.every) || 1))),
      from: draft!.from || moscow_today_iso(),
      month: Math.min(12, Math.max(1, Math.round(Number(draft!.month) || 1))),
      month_day: Math.min(31, Math.max(1, Math.round(Number(draft!.month_day) || 1))),
      weekdays: date ? [1, 2, 3, 4, 5, 6, 7] : weekdays,
      date,
      checklist,
      access,
    };
  }

  function save_draft() {
    if (!draft) return;
    const title = draft.title.trim();
    const current = store_ref.current;

    if (!draft.id) {
      if (!title) return;
      const id = new_custom_id();
      const who = draft.seller_id || null;
      const task = draft_task(id, title, title);
      if (who !== seller_id) set_seller_id(who);
      void commit({
        ...current,
        customs: [task, ...current.customs],
        placements: [
          ...current.placements,
          { id: new_placement_id(), card_id: id, spot_id, seller_id: who },
        ],
      });
      set_draft(null);
      return;
    }

    const card = cards_ref.current.find((item) => item.id === draft.id);
    if (!card) return;
    if (card.kind === 'widget') {
      void commit({
        ...current,
        overrides: {
          ...current.overrides,
          [card.id]: { access: draft.access.length ? draft.access : ['work'] },
        },
      });
      set_draft(null);
      return;
    }
    if (card.source === 'custom') {
      if (!title) return;
      const task = draft_task(card.id, title, card.note || title);
      void commit({
        ...current,
        customs: current.customs.map((item) => (item.id === card.id ? task : item)),
      });
    } else {
      const task = draft_task(card.id, title || card.title, card.note);
      void commit({
        ...current,
        overrides: {
          ...current.overrides,
          [card.id]: {
            category: task.category,
            time: task.time,
            minutes: task.minutes,
            proof: task.proof,
            repeat: task.repeat,
            every: task.every,
            from: task.from,
            month: task.month,
            month_day: task.month_day,
            weekdays: task.weekdays,
            date: task.date,
            checklist: task.checklist,
            access: task.access,
            title: card.source === 'day' ? task.title : undefined,
            note: task.note,
          },
        },
      });
    }
    set_draft(null);
  }

  function patch_line(id: string, patch: Partial<check_item>) {
    set_draft((prev) =>
      prev
        ? { ...prev, checklist: prev.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)) }
        : prev
    );
  }

  async function attach_line(id: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    const res = await fetch('/api/admin/day-tasks/media', {
      method: 'POST',
      credentials: 'same-origin',
      body,
    });
    if (!res.ok) return;
    const data = (await res.json()) as { media?: day_task_media };
    if (!data.media) return;
    patch_line(id, { media: data.media });
  }

  function delete_draft() {
    if (!draft?.id) return;
    const current = store_ref.current;
    void commit({
      ...current,
      customs: current.customs.filter((task) => task.id !== draft.id),
      placements: current.placements.filter((row) => row.card_id !== draft.id),
      overrides: Object.fromEntries(
        Object.entries(current.overrides).filter(([key]) => key !== draft.id)
      ),
    });
    set_draft(null);
  }

  function toggle_day(day: number) {
    set_draft((prev) => {
      if (!prev) return prev;
      const has = prev.weekdays.includes(day);
      if (has && prev.weekdays.length === 1) return prev;
      return {
        ...prev,
        weekdays: has ? prev.weekdays.filter((item) => item !== day) : [...prev.weekdays, day].sort(),
      };
    });
  }

  function toggle_access(right: seller_right) {
    set_draft((prev) => {
      if (!prev) return prev;
      const has = prev.access.includes(right);
      if (has && prev.access.length === 1) return prev;
      const access = has ? prev.access.filter((item) => item !== right) : [...prev.access, right];
      return { ...prev, access };
    });
  }

  const ghost_card = ghost ? cards.find((card) => card.id === ghost.id) : null;
  const editing = draft?.id ? cards.find((card) => card.id === draft.id) : null;
  const draft_is_widget = editing?.kind === 'widget';
  const draft_is_named = !draft?.id || editing?.source === 'custom' || editing?.source === 'day';
  const draft_is_timed = !draft_is_widget && editing?.source !== 'opening' && editing?.source !== 'closing';

  return (
    <AdminShell wide>
      {!ready ? <p className="py-16 text-center text-sm text-neutral-400">загрузка...</p> : null}

      {ready && screen === 'home' ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">точки</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FolderCard title="все точки" on_open={() => { set_spot_id(null); set_seller_id(null); set_screen('board'); }} />
              {active_spots.map((spot) => (
                <FolderCard
                  key={spot.id}
                  title={spot_short(spot)}
                  meta={spot.city}
                  on_open={() => {
                    set_spot_id(spot.id);
                    set_seller_id(null);
                    set_screen('board');
                  }}
                />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">сотрудники</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FolderCard
                title="все сотрудники"
                on_open={() => {
                  set_seller_id(null);
                  set_screen('board');
                }}
              />
              {active_staff.map((person) => (
                <FolderCard
                  key={person.id}
                  title={person.name}
                  meta={person.role_title || undefined}
                  on_open={() => {
                    pick_seller(person.id);
                    set_screen('board');
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {ready && screen === 'board' ? (
        <div className="flex min-h-[calc(100vh-8.5rem)] flex-col gap-4 lg:h-[calc(100vh-8.5rem)] lg:min-h-0">
          <button
            type="button"
            onClick={() => set_screen('home')}
            className="w-fit text-sm text-neutral-500 hover:text-neutral-800"
          >
            менеджмент
          </button>
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]">
            <section className="flex min-h-[28rem] flex-col lg:h-full lg:min-h-0">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start">
                  <select
                    value={spot_id ?? ''}
                    onChange={(e) => pick_spot(e.target.value)}
                    aria-label="точка"
                    className="max-w-full cursor-pointer truncate bg-transparent text-lg font-semibold text-neutral-900 outline-none"
                  >
                    <option value="">все точки</option>
                    {spot_choices.map((spot) => (
                      <option key={spot.id} value={spot.id}>
                        {spot_short(spot)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={seller_id ?? ''}
                    onChange={(e) => pick_seller(e.target.value)}
                    aria-label="сотрудник"
                    className="max-w-full cursor-pointer truncate bg-transparent text-sm text-neutral-500 outline-none"
                  >
                    <option value="">все сотрудники</option>
                    {staff_choices.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="shrink-0 text-right text-3xl font-semibold leading-none tracking-tight text-neutral-900 tabular-nums">
                  {clock.line}
                </p>
              </div>
              <div
                ref={board_ref}
                className={`flex min-h-0 flex-1 flex-col rounded-[28px] border bg-white/80 p-2.5 ${
                  hot === 'board' ? 'border-accent' : 'border-neutral-200/80'
                }`}
              >
                {widgets.length ? (
                  <div className="mb-2 flex gap-2 overflow-x-auto">
                    {widgets.map((card) => (
                      <div key={card.id} className="h-24 w-20 shrink-0">
                        <CashierTile
                          card={card}
                          onPointerDown={(e) => start_drag(e, card.id, 'board')}
                          onOpen={() => open_card(card.id)}
                          onRemove={exact_ids.has(card.id) ? () => unplace(card.id) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <DayCalendar
                    scale={scale}
                    focus={focus}
                    today={clock.iso}
                    cards={placed}
                    exact_ids={exact_ids}
                    on_scale={set_scale}
                    on_focus={set_focus}
                    on_drag={(e, id) => start_drag(e, id, 'board')}
                    on_open={open_card}
                    on_remove={unplace}
                  />
                </div>
              </div>
            </section>

            <section ref={library_ref} className="flex min-h-[24rem] flex-col lg:h-full lg:min-h-0">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  aria-label="новая задача"
                  onClick={open_new}
                  className="grid h-9 w-9 place-items-center rounded-full bg-neutral-900 text-xl leading-none text-white"
                >
                  +
                </button>
              </div>
              <div
                className={`grid min-h-0 flex-1 auto-rows-[13rem] grid-cols-2 content-start gap-2 overflow-y-auto rounded-[28px] border bg-white/80 p-2.5 ${
                  hot === 'library' ? 'border-accent' : 'border-neutral-200/80'
                }`}
              >
                {library.map((card) => (
                  <CashierTile
                    key={card.id}
                    card={card}
                    onPointerDown={(e) => start_drag(e, card.id, 'library')}
                    onOpen={() => open_card(card.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {ghost && ghost_card ? (
        <div
          className="pointer-events-none fixed z-[70] h-40 w-32"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, -50%)' }}
        >
          <CashierTile card={ghost_card} />
        </div>
      ) : null}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="закрыть"
            className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            onClick={() => set_draft(null)}
          />
          <div className="relative w-full max-w-md">
            <button
              type="button"
              aria-label="закрыть"
              onClick={() => set_draft(null)}
              className="absolute top-0 right-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-colors hover:bg-neutral-50 sm:-right-12"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
            <div className="max-h-[85vh] space-y-3 overflow-y-auto rounded-[28px] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
              {draft_is_named && !draft_is_widget ? (
                <input
                  value={draft.title}
                  onChange={(e) => set_draft({ ...draft, title: e.target.value })}
                  placeholder="что сделать"
                  className={field}
                />
              ) : null}
              {draft_is_widget ? null : (
                <select
                  value={draft.category}
                  onChange={(e) => set_draft({ ...draft, category: e.target.value as task_category })}
                  aria-label="категория"
                  className={field}
                >
                  {task_categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
              {draft_is_widget ? null : (
                <div className={draft_is_timed ? 'grid grid-cols-2 gap-2' : ''}>
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(e) => set_draft({ ...draft, time: e.target.value })}
                    aria-label="время"
                    className={field}
                  />
                  {draft_is_timed ? (
                    <input
                      inputMode="numeric"
                      value={draft.minutes}
                      onChange={(e) => set_draft({ ...draft, minutes: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                      placeholder="минуты"
                      aria-label="минуты"
                      className={field}
                    />
                  ) : null}
                </div>
              )}
              {draft_is_widget || draft.category !== 'once' ? null : (
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => set_draft({ ...draft, date: e.target.value })}
                  aria-label="день"
                  className={field}
                />
              )}
              {draft_is_widget || draft.category === 'once' ? null : (
                <select
                  value={draft.repeat}
                  onChange={(e) => set_draft({ ...draft, repeat: e.target.value as day_task_repeat })}
                  aria-label="повтор"
                  className={field}
                >
                  {repeat_options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
              {draft_is_widget || draft.category === 'once' || (draft.repeat !== 'daily' && draft.repeat !== 'weekly') ? null : (
                <div className="flex flex-wrap gap-1.5">
                  {weekday_labels.map((day) => {
                    const on = draft.weekdays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggle_day(day.id)}
                        className={`rounded-full px-3 py-1.5 text-sm ${
                          on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {draft_is_widget || draft.category === 'once' || draft.repeat !== 'every_n_days' ? null : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="numeric"
                    value={draft.every}
                    onChange={(e) => set_draft({ ...draft, every: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                    placeholder="каждые N дней"
                    aria-label="каждые N дней"
                    className={field}
                  />
                  <input
                    type="date"
                    value={draft.from}
                    onChange={(e) => set_draft({ ...draft, from: e.target.value })}
                    aria-label="с даты"
                    className={field}
                  />
                </div>
              )}
              {draft_is_widget || draft.category === 'once' || draft.repeat !== 'yearly' ? null : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="numeric"
                    value={draft.every}
                    onChange={(e) => set_draft({ ...draft, every: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                    placeholder="каждые N лет"
                    aria-label="каждые N лет"
                    className={field}
                  />
                  <input
                    type="date"
                    value={draft.from}
                    onChange={(e) => set_draft({ ...draft, from: e.target.value })}
                    aria-label="с даты"
                    className={field}
                  />
                </div>
              )}
              {draft_is_widget || draft.category === 'once' || (draft.repeat !== 'monthly' && draft.repeat !== 'yearly') ? null : (
                <div className="grid grid-cols-2 gap-2">
                  {draft.repeat === 'yearly' ? (
                    <input
                      inputMode="numeric"
                      value={draft.month}
                      onChange={(e) => set_draft({ ...draft, month: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                      placeholder="месяц"
                      aria-label="месяц"
                      className={field}
                    />
                  ) : null}
                  <input
                    inputMode="numeric"
                    value={draft.month_day}
                    onChange={(e) => set_draft({ ...draft, month_day: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                    placeholder="число"
                    aria-label="число"
                    className={field}
                  />
                </div>
              )}
              {draft_is_widget ? null : (
                <select
                  value={draft.proof}
                  onChange={(e) => set_draft({ ...draft, proof: e.target.value as day_task_proof })}
                  aria-label="фотоотчёт"
                  className={field}
                >
                  {proof_options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
              {draft_is_widget ? null : (
                <div className="space-y-2">
                  {draft.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5">
                      <input
                        value={item.text}
                        onChange={(e) => patch_line(item.id, { text: e.target.value })}
                        placeholder="пункт"
                        className={field}
                      />
                      <button
                        type="button"
                        onClick={() => patch_line(item.id, { proof: next_proof(item.proof) })}
                        className={`shrink-0 rounded-full px-2.5 py-2 text-xs ${
                          item.proof === 'none' ? 'bg-neutral-100 text-neutral-500' : 'bg-neutral-900 text-white'
                        }`}
                      >
                        {line_proof[item.proof]}
                      </button>
                      <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-neutral-100 text-[10px] text-neutral-500">
                        {item.media?.kind === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={day_task_media_url(item.media.id)} alt="" className="h-full w-full object-cover" />
                        ) : item.media ? (
                          'видео'
                        ) : (
                          'фото'
                        )}
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) void attach_line(item.id, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        aria-label="удалить пункт"
                        onClick={() =>
                          set_draft({ ...draft, checklist: draft.checklist.filter((row) => row.id !== item.id) })
                        }
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    aria-label="пункт"
                    onClick={() =>
                      set_draft({
                        ...draft,
                        checklist: [...draft.checklist, { id: new_step_id(), text: '', proof: 'none', media: null }],
                      })
                    }
                    className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-lg leading-none text-white"
                  >
                    +
                  </button>
                </div>
              )}
              {!draft.id ? (
                <select
                  value={draft.seller_id}
                  onChange={(e) => set_draft({ ...draft, seller_id: e.target.value })}
                  aria-label="кто"
                  className={field}
                >
                  <option value="">все сотрудники</option>
                  {staff_choices.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {seller_right_ids.map((right) => {
                  const on = draft.access.includes(right);
                  return (
                    <button
                      key={right}
                      type="button"
                      onClick={() => toggle_access(right)}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {seller_right_label[right]}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={save_draft}
                disabled={!draft.id && !draft.title.trim()}
                className="sticky bottom-0 w-full rounded-full bg-accent py-3 text-sm font-medium text-accent-foreground disabled:opacity-40"
              >
                сохранить
              </button>
              {draft.id && editing?.source === 'custom' ? (
                <button type="button" onClick={delete_draft} className="w-full py-1 text-sm text-neutral-400">
                  удалить
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
