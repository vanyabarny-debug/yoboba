/** шаблоны задач дня: отдельные карточки на доске, расписание и повторы */

export type day_task_media = {
  id: string;
  kind: 'image' | 'video';
};

export type day_task_block = {
  id: string;
  /** мелкая подпись над текстом */
  kicker: string;
  text: string;
  media: day_task_media | null;
};

/** что бариста должен приложить, чтобы закрыть задачу */
export type day_task_proof = 'none' | 'photo' | 'video' | 'any';

/** как часто задача вылетает на доску */
export type day_task_repeat = 'daily' | 'weekly' | 'every_n_days' | 'monthly' | 'yearly';

export type day_task_schedule = {
  repeat: day_task_repeat;
  /** для every_n_days — через сколько дней (2 = раз в два дня, 3 = раз в три…) */
  every: number;
  /** дни недели 1=пн … 7=вс; для daily/weekly */
  weekdays: number[];
  /** число месяца 1–31 для monthly/yearly */
  month_day: number;
  /** месяц 1–12 для yearly */
  month: number;
  /** якорь YYYY-MM-DD для every_n_days (от этой даты считаем интервал) */
  from: string;
};

export type day_task_template = {
  id: string;
  title: string;
  hint: string;
  /** HH:MM по Москве — когда карточка появляется */
  appear_at: string;
  /** 0 — без таймера */
  expected_minutes: number;
  proof: day_task_proof;
  blocks: day_task_block[];
  schedule: day_task_schedule;
};

export type day_task_proof_record = {
  id: string;
  template_id: string;
  spot_id: string;
  day: string;
  seller_id: string;
  media: day_task_media;
  created_at: string;
};

export const day_task_media_url = (id: string) => `/api/day-task-media/${id}`;

export const weekday_labels: { id: number; label: string }[] = [
  { id: 1, label: 'пн' },
  { id: 2, label: 'вт' },
  { id: 3, label: 'ср' },
  { id: 4, label: 'чт' },
  { id: 5, label: 'пт' },
  { id: 6, label: 'сб' },
  { id: 7, label: 'вс' },
];

export const repeat_options: { id: day_task_repeat; label: string }[] = [
  { id: 'daily', label: 'каждый день' },
  { id: 'weekly', label: 'раз в неделю (дни)' },
  { id: 'every_n_days', label: 'раз в N дней' },
  { id: 'monthly', label: 'раз в месяц' },
  { id: 'yearly', label: 'раз в год' },
];

export function default_schedule(): day_task_schedule {
  return {
    repeat: 'daily',
    every: 1,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    month_day: 1,
    month: 1,
    from: '2026-01-01',
  };
}

function block(id: string, kicker: string, text: string): day_task_block {
  return { id, kicker, text, media: null };
}

function task(
  id: string,
  title: string,
  appear_at: string,
  minutes: number,
  hint: string,
  pages: day_task_block[]
): day_task_template {
  return {
    id,
    title,
    hint,
    appear_at,
    expected_minutes: minutes,
    proof: 'none',
    blocks: pages,
    schedule: default_schedule(),
  };
}

/** стартовые задачи «в течение дня» — каждая своей карточкой */
export const default_day_tasks: day_task_template[] = [
  task('thermopot', 'термопот', '12:00', 5, 'следить за водой', [
    block('thermopot-1', 'проверить', 'уровень воды в термопоте'),
    block('thermopot-2', 'долить', 'фильтрованную воду до отметки'),
  ]),
  task('wipe-equipment', 'протирка', '12:30', 10, 'оборудование и инвентарь', [
    block('wipe-1', 'протереть', 'оборудование сразу после использования'),
    block('wipe-2', 'протереть', 'инвентарь — не откладывать'),
  ]),
  task('tapioca-ice', 'тапиока и лёд', '13:00', 15, 'при необходимости', [
    block('tapioca-1', 'сварить', 'свежую тапиоку при необходимости'),
    block('tapioca-2', 'заготовить', 'лёд при необходимости'),
  ]),
  task('floors', 'полы и поверхности', '14:00', 15, 'по мере загрязнения', [
    block('floors-1', 'мыть', 'полы по мере загрязнения'),
    block('floors-2', 'протереть', 'рабочие поверхности'),
  ]),
  task('restroom-supplies', 'мыло и бумага', '15:00', 5, 'санузел', [
    block('restroom-s-1', 'проверить', 'мыло и туалетную бумагу'),
    block('restroom-s-2', 'пополнить', 'при необходимости'),
  ]),
  task('restroom-clean', 'уборка санузла', '16:00', 15, 'обязательно за смену', [
    block('restroom-c-1', 'убрать', 'санузел — обязательно за смену'),
  ]),
  task('disinsection', 'дезинсекция', '16:30', 10, 'провести дезинсекцию', [
    block('dis-1', 'провести', 'дезинсекцию'),
  ]),
  task('day-cleaning', 'дневная уборка', '17:00', 20, 'первая из двух за смену', [
    block('day-clean-1', 'провести', 'дневную уборку (первая из двух за смену)'),
  ]),
  task('journal-dez', 'журнал дезсредств', '17:30', 5, 'заполнить журнал', [
    block('j-dez-1', 'заполнить', 'журнал учёта дезинфицирующих средств'),
  ]),
  task('journal-gen', 'журнал генуборок', '18:00', 5, 'заполнить журнал', [
    block('j-gen-1', 'заполнить', 'журнал генеральных уборок'),
  ]),
];

const proofs = new Set<day_task_proof>(['none', 'photo', 'video', 'any']);
const repeats = new Set<day_task_repeat>(['daily', 'weekly', 'every_n_days', 'monthly', 'yearly']);

function clean_media(raw: unknown): day_task_media | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const kind = rec.kind === 'video' ? 'video' : rec.kind === 'image' ? 'image' : '';
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || !kind) return null;
  return { id, kind };
}

function parse_schedule(raw: unknown): day_task_schedule {
  const base = default_schedule();
  if (!raw || typeof raw !== 'object') return base;
  const rec = raw as Record<string, unknown>;
  const repeat = repeats.has(rec.repeat as day_task_repeat) ? (rec.repeat as day_task_repeat) : 'daily';
  const every = Math.min(365, Math.max(1, Math.round(Number(rec.every) || 1)));
  const weekdays = Array.isArray(rec.weekdays)
    ? [...new Set(rec.weekdays.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b)
    : base.weekdays;
  const month_day = Math.min(31, Math.max(1, Math.round(Number(rec.month_day) || 1)));
  const month = Math.min(12, Math.max(1, Math.round(Number(rec.month) || 1)));
  const from =
    typeof rec.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.from.trim())
      ? rec.from.trim()
      : base.from;
  return {
    repeat,
    every,
    weekdays: weekdays.length ? weekdays : base.weekdays,
    month_day,
    month,
    from,
  };
}

/** ISO weekday 1=пн … 7=вс для календарной даты YYYY-MM-DD (как в Москве) */
export function iso_weekday_from_day(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const wd = utc.getUTCDay(); // 0=вс
  return wd === 0 ? 7 : wd;
}

function days_between(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000);
}

/** активна ли задача в этот календарный день (Москва YYYY-MM-DD) */
export function is_template_active_on(schedule: day_task_schedule, day: string): boolean {
  const wd = iso_weekday_from_day(day);
  const day_num = Number(day.slice(8, 10));
  const month_num = Number(day.slice(5, 7));
  switch (schedule.repeat) {
    case 'daily':
      return schedule.weekdays.includes(wd);
    case 'weekly':
      return schedule.weekdays.includes(wd);
    case 'every_n_days': {
      const diff = days_between(schedule.from || day, day);
      return diff >= 0 && diff % Math.max(1, schedule.every) === 0;
    }
    case 'monthly':
      return day_num === schedule.month_day;
    case 'yearly':
      return month_num === schedule.month && day_num === schedule.month_day;
    default:
      return true;
  }
}

export function schedule_summary(schedule: day_task_schedule): string {
  if (schedule.repeat === 'daily') {
    if (schedule.weekdays.length === 7) return 'каждый день';
    return `ежедневно: ${schedule.weekdays.map((d) => weekday_labels.find((w) => w.id === d)?.label).join(', ')}`;
  }
  if (schedule.repeat === 'weekly') {
    return `раз в неделю: ${schedule.weekdays.map((d) => weekday_labels.find((w) => w.id === d)?.label).join(', ') || '—'}`;
  }
  if (schedule.repeat === 'every_n_days') {
    return `раз в ${schedule.every} дн. с ${schedule.from}`;
  }
  if (schedule.repeat === 'monthly') return `${schedule.month_day}-го числа каждого месяца`;
  return `${schedule.month_day}.${String(schedule.month).padStart(2, '0')} каждый год`;
}

export function parse_day_tasks(raw: unknown): day_task_template[] | null {
  if (!Array.isArray(raw) || raw.length > 40) return null;
  const tasks: day_task_template[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const hint = typeof rec.hint === 'string' ? rec.hint.trim() : '';
    const appear_at = typeof rec.appear_at === 'string' ? rec.appear_at.trim() : '';
    const minutes = Number(rec.expected_minutes);
    const proof = rec.proof as day_task_proof;
    if (!/^[a-zA-Z0-9-]{2,80}$/.test(id)) return null;
    if (!title || title.length > 80) return null;
    if (hint.length > 160) return null;
    if (!/^\d{2}:\d{2}$/.test(appear_at)) return null;
    const [hh, mm] = appear_at.split(':').map((n) => Number(n));
    if (hh > 23 || mm > 59) return null;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) return null;
    if (!proofs.has(proof)) return null;
    if (!Array.isArray(rec.blocks) || rec.blocks.length < 1 || rec.blocks.length > 12) return null;
    const blocks: day_task_block[] = [];
    for (const item of rec.blocks) {
      if (!item || typeof item !== 'object') return null;
      const b = item as Record<string, unknown>;
      const bid = typeof b.id === 'string' ? b.id.trim() : '';
      const kicker = typeof b.kicker === 'string' ? b.kicker.trim() : '';
      const text = typeof b.text === 'string' ? b.text.trim() : '';
      const media = clean_media(b.media);
      if (!/^[a-zA-Z0-9-]{2,80}$/.test(bid)) return null;
      if (kicker.length > 40) return null;
      if (text.length > 2000) return null;
      if (!text && !media) return null;
      blocks.push({ id: bid, kicker, text, media });
    }
    tasks.push({
      id,
      title,
      hint,
      appear_at,
      expected_minutes: minutes,
      proof,
      blocks,
      schedule: parse_schedule(rec.schedule),
    });
  }
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) return null;
  return tasks;
}
