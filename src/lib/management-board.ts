/** доска менеджмента: какие карточки висят у точки и сотрудника */

import { CLOSING_TASK_TIME } from '@/lib/closing-checklist';
import {
  default_schedule,
  is_template_active_on,
  parse_day_tasks,
  type day_task_block,
  type day_task_media,
  type day_task_proof,
  type day_task_repeat,
  type day_task_schedule,
  type day_task_template,
} from '@/lib/day-task-templates';
import { OPENING_TASK_TIME } from '@/lib/opening-checklist';
import { seller_right_ids, type seller_access, type seller_right } from '@/lib/seller-access';
import { is_task_due } from '@/lib/seller-day-tasks';

/** как карточки на кассе: открытие, день, закрытие и разовая */
export const task_categories = [
  { id: 'opening', label: 'открытие' },
  { id: 'during', label: 'в течение дня' },
  { id: 'closing', label: 'закрытие' },
  { id: 'once', label: 'разовое' },
] as const;

export type task_category = (typeof task_categories)[number]['id'];

export type board_source = 'opening' | 'closing' | 'day' | 'widget' | 'custom';

export type check_item = {
  id: string;
  text: string;
  proof: day_task_proof;
  media: day_task_media | null;
};

export type board_card = {
  id: string;
  source: board_source;
  ref: string;
  kind: 'task' | 'widget';
  title: string;
  category: task_category;
  time: string;
  /** 0 — без таймера на карточке */
  minutes: number;
  proof: day_task_proof;
  repeat: day_task_repeat;
  every: number;
  from: string;
  month: number;
  month_day: number;
  weekdays: number[];
  date: string | null;
  checklist: check_item[];
  access: seller_right[];
  note: string;
};

export type card_override = {
  category?: task_category;
  time?: string;
  minutes?: number;
  proof?: day_task_proof;
  repeat?: day_task_repeat;
  every?: number;
  from?: string;
  month?: number;
  month_day?: number;
  weekdays?: number[];
  date?: string | null;
  checklist?: check_item[];
  access?: seller_right[];
  title?: string;
  note?: string;
};

export type custom_task = {
  id: string;
  title: string;
  note: string;
  category: task_category;
  time: string;
  minutes: number;
  proof: day_task_proof;
  repeat: day_task_repeat;
  every: number;
  from: string;
  month: number;
  month_day: number;
  weekdays: number[];
  date: string | null;
  checklist: check_item[];
  access: seller_right[];
};

export type placement = {
  id: string;
  card_id: string;
  /** null — все точки */
  spot_id: string | null;
  /** null — все сотрудники */
  seller_id: string | null;
};

export type management_store = {
  overrides: Record<string, card_override>;
  customs: custom_task[];
  placements: placement[];
};

/** кастрюли и чайники — рабочие виджеты, не задачи смены */
export const widget_catalog = [
  { id: 'tapioca', title: 'тапиока' },
  { id: 'tea_black', title: 'чай чёрный' },
  { id: 'tea_jasmine', title: 'чай жасмин' },
] as const;

const category_ids = new Set<string>(task_categories.map((c) => c.id));
const proof_ids = new Set<day_task_proof>(['none', 'photo', 'video', 'any']);
const repeat_ids = new Set<day_task_repeat>(['daily', 'weekly', 'every_n_days', 'monthly', 'yearly']);
const all_days = [1, 2, 3, 4, 5, 6, 7];

export function category_label(id: task_category) {
  return task_categories.find((c) => c.id === id)?.label || id;
}

export function empty_management_store(): management_store {
  return { overrides: {}, customs: [], placements: [] };
}

export function new_custom_id() {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function new_placement_id() {
  return `place-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clean_days(raw: unknown): number[] {
  if (!Array.isArray(raw)) return all_days;
  const days = [...new Set(raw.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7))].sort(
    (a, b) => a - b
  );
  return days.length ? days : all_days;
}

function clean_time(raw: unknown, fallback: string) {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function clean_date(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function clean_access(raw: unknown): seller_right[] {
  if (!Array.isArray(raw)) return ['work'];
  const access = seller_right_ids.filter((id) => raw.includes(id));
  return access.length ? access : ['work'];
}

function clean_category(raw: unknown, fallback: task_category): task_category {
  return typeof raw === 'string' && category_ids.has(raw) ? (raw as task_category) : fallback;
}

function clean_ref(raw: unknown) {
  if (typeof raw !== 'string') return '';
  const id = raw.trim();
  return /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(id) ? id : '';
}

function clean_proof(raw: unknown, fallback: day_task_proof): day_task_proof {
  return typeof raw === 'string' && proof_ids.has(raw as day_task_proof) ? (raw as day_task_proof) : fallback;
}

function clean_repeat(raw: unknown, fallback: day_task_repeat): day_task_repeat {
  return typeof raw === 'string' && repeat_ids.has(raw as day_task_repeat)
    ? (raw as day_task_repeat)
    : fallback;
}

function clean_minutes(raw: unknown, fallback: number) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 240) return fallback;
  return value;
}

function clean_span(raw: unknown, min: number, max: number, fallback: number) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function clean_media(raw: unknown): day_task_media | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const kind = rec.kind === 'video' ? 'video' : rec.kind === 'image' ? 'image' : '';
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || !kind) return null;
  return { id, kind };
}

function clean_checklist(raw: unknown): check_item[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: check_item[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const text = typeof rec.text === 'string' ? rec.text.trim().slice(0, 500) : '';
    const media = clean_media(rec.media);
    if (!/^[a-zA-Z0-9-]{2,80}$/.test(id) || seen.has(id)) continue;
    if (!text && !media) continue;
    seen.add(id);
    items.push({ id, text, proof: clean_proof(rec.proof, 'none'), media });
    if (items.length >= 40) break;
  }
  return items;
}

function schedule_bits(schedule?: day_task_schedule) {
  const base = schedule ?? default_schedule();
  return {
    repeat: base.repeat,
    every: base.every,
    from: base.from,
    month: base.month,
    month_day: base.month_day,
    weekdays: base.weekdays.length ? base.weekdays : all_days,
  };
}

function blocks_to_checks(blocks: day_task_block[]): check_item[] {
  return blocks.map((block) => ({
    id: block.id,
    text: block.text,
    proof: 'none',
    media: block.media,
  }));
}

export function schedule_from_card(card: board_card): day_task_schedule {
  return {
    repeat: card.repeat,
    every: Math.min(365, Math.max(1, card.every || 1)),
    weekdays: card.weekdays.length ? card.weekdays : all_days,
    month_day: Math.min(31, Math.max(1, card.month_day || 1)),
    month: Math.min(12, Math.max(1, card.month || 1)),
    from: card.from || '2026-01-01',
  };
}

function apply_override(card: board_card, ov?: card_override): board_card {
  if (!ov) return card;
  return {
    ...card,
    category: ov.category ?? card.category,
    time: ov.time !== undefined ? ov.time : card.time,
    minutes: ov.minutes ?? card.minutes,
    proof: ov.proof ?? card.proof,
    repeat: ov.repeat ?? card.repeat,
    every: ov.every ?? card.every,
    from: ov.from || card.from,
    month: ov.month ?? card.month,
    month_day: ov.month_day ?? card.month_day,
    weekdays: ov.weekdays?.length ? ov.weekdays : card.weekdays,
    date: ov.date === undefined ? card.date : ov.date,
    checklist: ov.checklist ?? card.checklist,
    access: ov.access?.length ? ov.access : card.access,
    title: ov.title?.trim() || card.title,
    note: ov.note ?? card.note,
  };
}

function custom_card(task: custom_task): board_card {
  return {
    id: task.id,
    source: 'custom',
    ref: task.id,
    kind: 'task',
    title: task.title,
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
    note: task.note,
  };
}

export type catalog_context = {
  opening?: string;
  closing?: string;
  opening_items?: check_item[];
  closing_items?: check_item[];
};

const blank_task = {
  minutes: 0,
  proof: 'none' as day_task_proof,
  repeat: 'daily' as day_task_repeat,
  every: 1,
  from: '2026-01-01',
  month: 1,
  month_day: 1,
  checklist: [] as check_item[],
};

export function build_catalog(
  tasks: day_task_template[],
  store: management_store,
  times?: catalog_context
): board_card[] {
  const cards: board_card[] = [
    apply_override(
      {
        id: 'opening',
        source: 'opening',
        ref: 'opening',
        kind: 'task',
        title: 'открытие',
        category: 'opening',
        time: times?.opening || OPENING_TASK_TIME,
        ...blank_task,
        checklist: times?.opening_items || [],
        weekdays: all_days,
        date: null,
        access: ['work'],
        note: '',
      },
      store.overrides.opening
    ),
    apply_override(
      {
        id: 'closing',
        source: 'closing',
        ref: 'closing',
        kind: 'task',
        title: 'закрытие',
        category: 'closing',
        time: times?.closing || CLOSING_TASK_TIME,
        ...blank_task,
        checklist: times?.closing_items || [],
        weekdays: all_days,
        date: null,
        access: ['work'],
        note: '',
      },
      store.overrides.closing
    ),
  ];

  for (const task of tasks) {
    const id = `day:${task.id}`;
    cards.push(
      apply_override(
        {
          id,
          source: 'day',
          ref: task.id,
          kind: 'task',
          title: task.title,
          category: 'during',
          time: task.appear_at,
          minutes: task.expected_minutes,
          proof: task.proof,
          ...schedule_bits(task.schedule),
          date: null,
          checklist: blocks_to_checks(task.blocks),
          access: ['work'],
          note: task.hint || '',
        },
        store.overrides[id]
      )
    );
  }

  for (const task of store.customs) cards.push(custom_card(task));

  for (const widget of widget_catalog) {
    const id = `widget:${widget.id}`;
    cards.push(
      apply_override(
        {
          id,
          source: 'widget',
          ref: widget.id,
          kind: 'widget',
          title: widget.title,
          category: 'during',
          time: '',
          ...blank_task,
          weekdays: all_days,
          date: null,
          access: ['work'],
          note: '',
        },
        store.overrides[id]
      )
    );
  }

  return cards;
}

export function sort_cards(cards: board_card[]) {
  const rank: Record<board_source, number> = {
    custom: 0,
    opening: 1,
    day: 2,
    closing: 3,
    widget: 4,
  };
  return [...cards].sort(
    (a, b) =>
      rank[a.source] - rank[b.source] ||
      a.time.localeCompare(b.time) ||
      a.title.localeCompare(b.title, 'ru')
  );
}

export function placement_matches(row: placement, spot_id: string, seller_id: string) {
  if (row.spot_id && row.spot_id !== spot_id) return false;
  if (row.seller_id && row.seller_id !== seller_id) return false;
  return true;
}

export function placement_exact(
  row: placement,
  spot_id: string | null,
  seller_id: string | null
) {
  return (row.spot_id || null) === (spot_id || null) && (row.seller_id || null) === (seller_id || null);
}

export function access_allows(need: seller_right[], rights: seller_access) {
  if (!need.length) return rights.work;
  return need.some((id) => rights[id]);
}

export function card_on_day(card: board_card, day: string) {
  if (card.kind === 'widget') return true;
  if (card.date) return card.date === day;
  if (card.category === 'once') return false;
  return is_template_active_on(schedule_from_card(card), day);
}

export function card_due(card: board_card, now = new Date()) {
  if (!card.time) return true;
  return is_task_due(card.time, now);
}

export function task_placed(
  cards: board_card[],
  placements: placement[],
  card_id: string,
  spot_id: string,
  seller_id: string,
  rights: seller_access,
  day: string
) {
  const card = cards.find((item) => item.id === card_id);
  if (!card || card.kind === 'widget') return false;
  if (!placements.some((row) => row.card_id === card_id && placement_matches(row, spot_id, seller_id))) {
    return false;
  }
  if (!access_allows(card.access, rights)) return false;
  return card_on_day(card, day);
}

/** null — виджеты ещё не раскладывали, на кассе остаются все кастрюли */
export function assigned_widget_refs(
  cards: board_card[],
  placements: placement[],
  spot_id: string,
  seller_id: string,
  rights: seller_access
): string[] | null {
  const widgets = new Map(cards.filter((card) => card.kind === 'widget').map((card) => [card.id, card]));
  const hits = placements.filter(
    (row) => widgets.has(row.card_id) && placement_matches(row, spot_id, seller_id)
  );
  if (!hits.length) return null;
  return [
    ...new Set(
      hits
        .filter((row) => access_allows(widgets.get(row.card_id)!.access, rights))
        .map((row) => widgets.get(row.card_id)!.ref)
    ),
  ];
}

function report_proof(card: board_card): day_task_proof {
  if (card.proof !== 'none') return card.proof;
  const proofs = new Set(card.checklist.map((item) => item.proof));
  if (proofs.has('any') || (proofs.has('photo') && proofs.has('video'))) return 'any';
  if (proofs.has('video')) return 'video';
  if (proofs.has('photo')) return 'photo';
  return 'none';
}

function safe_block_id(id: string, fallback: string) {
  return /^[a-zA-Z0-9-]{2,80}$/.test(id) ? id : fallback;
}

function checks_to_blocks(items: check_item[], previous: day_task_block[] = []): day_task_block[] {
  const prev = new Map(previous.map((block) => [block.id, block]));
  const blocks: day_task_block[] = [];
  items.forEach((item, index) => {
    const id = safe_block_id(item.id, `step-${index + 1}`);
    if (blocks.some((block) => block.id === id)) return;
    const text = item.text.trim().slice(0, 2000);
    const media = item.media && /^[a-zA-Z0-9-]{8,80}$/.test(item.media.id) ? item.media : null;
    if (!text && !media) return;
    const old = prev.get(id);
    blocks.push({
      id,
      kicker: (old?.kicker || '').slice(0, 40),
      text: text || old?.text || '',
      media,
    });
  });
  return blocks.slice(0, 12).filter((block) => block.text || block.media);
}

function custom_template(card: board_card): day_task_template {
  const blocks = checks_to_blocks(card.checklist);
  return {
    id: card.id,
    title: card.title,
    hint: (card.note || card.title).slice(0, 160),
    appear_at: card.time || '12:00',
    expected_minutes: card.minutes,
    proof: report_proof(card),
    blocks: blocks.length
      ? blocks
      : [{ id: 'step-1', kicker: '', text: card.note || card.title, media: null }],
    schedule: card.date ? { ...default_schedule(), weekdays: all_days } : schedule_from_card(card),
  };
}

/** шаблоны, которые уже лежат на доске этой точки и этого сотрудника */
export function assigned_day_templates(
  templates: day_task_template[],
  cards: board_card[],
  placements: placement[],
  spot_id: string,
  seller_id: string,
  rights: seller_access,
  day: string
): day_task_template[] {
  const by_id = new Map(cards.map((card) => [card.id, card]));
  const out: day_task_template[] = [];

  for (const template of templates) {
    const card = by_id.get(`day:${template.id}`);
    if (!card) continue;
    if (!placements.some((row) => row.card_id === card.id && placement_matches(row, spot_id, seller_id))) {
      continue;
    }
    if (!access_allows(card.access, rights) || !card_on_day(card, day)) continue;
    const blocks = checks_to_blocks(card.checklist, template.blocks);
    out.push({
      ...template,
      title: card.title || template.title,
      appear_at: card.time || template.appear_at,
      hint: (card.note || template.hint).slice(0, 160),
      expected_minutes: card.minutes,
      proof: report_proof(card),
      blocks: blocks.length ? blocks : template.blocks,
      schedule: card.date ? { ...default_schedule(), weekdays: all_days } : schedule_from_card(card),
    });
  }

  for (const card of cards) {
    if (card.source !== 'custom') continue;
    if (!placements.some((row) => row.card_id === card.id && placement_matches(row, spot_id, seller_id))) {
      continue;
    }
    if (!access_allows(card.access, rights) || !card_on_day(card, day)) continue;
    out.push(custom_template(card));
  }

  return out;
}

function parse_override(raw: unknown): card_override | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const override: card_override = {};
  if (rec.category != null) override.category = clean_category(rec.category, 'during');
  if (rec.time != null) override.time = clean_time(rec.time, '12:00');
  if (rec.minutes != null) override.minutes = clean_minutes(rec.minutes, 0);
  if (rec.proof != null) override.proof = clean_proof(rec.proof, 'none');
  if (rec.repeat != null) override.repeat = clean_repeat(rec.repeat, 'daily');
  if (rec.every != null) override.every = clean_span(rec.every, 1, 365, 1);
  if (typeof rec.from === 'string') override.from = clean_date(rec.from) || '2026-01-01';
  if (rec.month != null) override.month = clean_span(rec.month, 1, 12, 1);
  if (rec.month_day != null) override.month_day = clean_span(rec.month_day, 1, 31, 1);
  if (rec.weekdays != null) override.weekdays = clean_days(rec.weekdays);
  if ('date' in rec) override.date = clean_date(rec.date);
  if (rec.checklist != null) override.checklist = clean_checklist(rec.checklist) || [];
  if (rec.access != null) override.access = clean_access(rec.access);
  if (typeof rec.title === 'string') override.title = rec.title.trim().slice(0, 80);
  if (typeof rec.note === 'string') override.note = rec.note.trim().slice(0, 400);
  return override;
}

function parse_custom(raw: unknown): custom_task | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = clean_ref(rec.id);
  const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 80) : '';
  if (!id.startsWith('custom-') || !title) return null;
  return {
    id,
    title,
    note: typeof rec.note === 'string' ? rec.note.trim().slice(0, 400) : '',
    category: clean_category(rec.category, 'once'),
    time: clean_time(rec.time, '12:00'),
    minutes: clean_minutes(rec.minutes, 0),
    proof: clean_proof(rec.proof, 'none'),
    repeat: clean_repeat(rec.repeat, 'daily'),
    every: clean_span(rec.every, 1, 365, 1),
    from: (typeof rec.from === 'string' && clean_date(rec.from)) || '2026-01-01',
    month: clean_span(rec.month, 1, 12, 1),
    month_day: clean_span(rec.month_day, 1, 31, 1),
    weekdays: clean_days(rec.weekdays),
    date: clean_date(rec.date),
    checklist: clean_checklist(rec.checklist) || [],
    access: clean_access(rec.access),
  };
}

function known_card(id: string, custom_ids: Set<string>) {
  if (id === 'opening' || id === 'closing') return true;
  if (id.startsWith('widget:')) return widget_catalog.some((widget) => id === `widget:${widget.id}`);
  if (id.startsWith('day:')) return /^day:[a-z0-9][a-z0-9_-]{0,80}$/i.test(id);
  return custom_ids.has(id);
}

export function parse_management_store(raw: unknown): management_store {
  const empty = empty_management_store();
  if (!raw || typeof raw !== 'object') return empty;
  const rec = raw as Record<string, unknown>;

  const customs: custom_task[] = [];
  const seen_custom = new Set<string>();
  if (Array.isArray(rec.customs)) {
    for (const row of rec.customs) {
      const task = parse_custom(row);
      if (!task || seen_custom.has(task.id)) continue;
      seen_custom.add(task.id);
      customs.push(task);
      if (customs.length >= 200) break;
    }
  }

  const overrides: Record<string, card_override> = {};
  if (rec.overrides && typeof rec.overrides === 'object') {
    for (const [key, value] of Object.entries(rec.overrides as Record<string, unknown>)) {
      if (!known_card(key, seen_custom) || key.startsWith('custom-')) continue;
      const override = parse_override(value);
      if (override) overrides[key] = override;
    }
  }

  const placements: placement[] = [];
  const seen_place = new Set<string>();
  if (Array.isArray(rec.placements)) {
    for (const row of rec.placements) {
      if (!row || typeof row !== 'object') continue;
      const item = row as Record<string, unknown>;
      const id = clean_ref(item.id);
      const card_id = typeof item.card_id === 'string' ? item.card_id.trim() : '';
      if (!id.startsWith('place-') || !known_card(card_id, seen_custom) || seen_place.has(id)) continue;
      const spot_id = item.spot_id == null || item.spot_id === '' ? null : clean_ref(item.spot_id);
      const seller_id = item.seller_id == null || item.seller_id === '' ? null : clean_ref(item.seller_id);
      if (item.spot_id && !spot_id) continue;
      if (item.seller_id && !seller_id) continue;
      seen_place.add(id);
      placements.push({ id, card_id, spot_id, seller_id });
      if (placements.length >= 2000) break;
    }
  }

  return { overrides, customs, placements };
}

/** задачи дня после правок с доски — null, если запись не проходит проверку */
export function patched_day_tasks(tasks: day_task_template[], cards: board_card[]) {
  const by_id = new Map(cards.map((card) => [card.id, card]));
  const next = tasks.map((task) => {
    const card = by_id.get(`day:${task.id}`);
    if (!card) return task;
    const blocks = checks_to_blocks(card.checklist, task.blocks);
    return {
      ...task,
      title: (card.title || task.title).slice(0, 80),
      hint: (card.note || task.hint).slice(0, 160),
      appear_at: /^\d{2}:\d{2}$/.test(card.time) ? card.time : task.appear_at,
      expected_minutes: clean_minutes(card.minutes, task.expected_minutes),
      proof: report_proof(card),
      blocks: blocks.length ? blocks : task.blocks,
      schedule: card.date ? { ...default_schedule(), weekdays: all_days } : schedule_from_card(card),
    };
  });
  return parse_day_tasks(next);
}

export function checklist_section_from_card(card: board_card, fallback_time: string) {
  const items = card.checklist
    .map((item) => ({
      id: item.id,
      text: item.text.trim().slice(0, 500),
      proof: item.proof !== 'none' ? item.proof : card.proof,
      media: item.media,
    }))
    .filter((item) => item.text && /^[a-zA-Z0-9-]{2,80}$/.test(item.id));
  const ids = new Set(items.map((item) => item.id));
  if (!items.length || ids.size !== items.length || items.length > 80) return null;
  const appear_at = /^\d{2}:\d{2}$/.test(card.time) ? card.time : fallback_time;
  return { appear_at, items };
}
