/** ежедневные задачи смены — появляются по расписанию (МСК) */

import { moscow_today_iso } from '@/lib/order-number';

/** шаги карточки: иконка → что сделать → кнопка начать → таймер → стоп → сделано */
export type day_task_phase =
  | 'icon'
  | 'info'
  | 'armed'
  | 'running'
  | 'stopped'
  | 'done';

export type day_task = {
  id: string;
  template_id: string;
  title: string;
  hint: string;
  /** HH:MM по Москве — когда карточка впервые появляется на доске */
  appear_at: string;
  /** ориентир длительности, мин */
  expected_minutes: number;
  phase: day_task_phase;
  /** накопленное время таймера (мс), без текущего отрезка */
  elapsed_ms: number;
  /** старт текущего отрезка running */
  run_started_at: number | null;
  appeared_at: string | null;
  done_at: string | null;
};

type day_task_template = {
  id: string;
  title: string;
  hint: string;
  appear_at: string;
  expected_minutes: number;
};

/** расписание на день (МСК) — не все сразу */
export const day_task_templates: day_task_template[] = [
  {
    id: 'journals',
    title: 'журналы',
    hint: 'расписаться в журналах смены',
    appear_at: '10:00',
    expected_minutes: 5,
  },
  {
    id: 'showcase',
    title: 'витрина',
    hint: 'протереть стекло и полки',
    appear_at: '11:30',
    expected_minutes: 10,
  },
  {
    id: 'floor',
    title: 'пол у кассы',
    hint: 'подмести / протереть зону выдачи',
    appear_at: '13:00',
    expected_minutes: 8,
  },
  {
    id: 'oil-change',
    title: 'сдать масло',
    hint: 'замена / сдача отработки',
    appear_at: '15:00',
    expected_minutes: 15,
  },
  {
    id: 'fryer-clean',
    title: 'уборка фритюра',
    hint: 'слить, протереть, собрать',
    appear_at: '17:00',
    expected_minutes: 20,
  },
  {
    id: 'trash',
    title: 'мусор',
    hint: 'вынести пакеты, сменить мешки',
    appear_at: '18:30',
    expected_minutes: 5,
  },
];

/** единый цвет задач дня */
export const day_task_color = {
  bg: '#FFE8E8',
  fg: '#D64545',
  border: '#FFC9C9',
} as const;

type store = {
  day: string;
  spot_id: string;
  tasks: day_task[];
};

function storage_key(spot_id: string, day: string) {
  return `yoboba:seller-day-tasks:v2:${spot_id}:${day}`;
}

function moscow_hm(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function hm_to_minutes(hm: string): number {
  const [h, m] = hm.split(':').map((x) => Number(x) || 0);
  return h * 60 + m;
}

export function is_task_due(appear_at: string, now = new Date()): boolean {
  return hm_to_minutes(moscow_hm(now)) >= hm_to_minutes(appear_at);
}

function blank_task(day: string, t: day_task_template): day_task {
  return {
    id: `${day}:${t.id}`,
    template_id: t.id,
    title: t.title,
    hint: t.hint,
    appear_at: t.appear_at,
    expected_minutes: t.expected_minutes,
    phase: 'icon',
    elapsed_ms: 0,
    run_started_at: null,
    appeared_at: null,
    done_at: null,
  };
}

function migrate_task(day: string, raw: Partial<day_task> & { template_id: string; status?: string }): day_task | null {
  const tpl = day_task_templates.find((t) => t.id === raw.template_id);
  if (!tpl) return null;
  const base = blank_task(day, tpl);
  const allowed: day_task_phase[] = ['icon', 'info', 'armed', 'running', 'stopped', 'done'];
  let phase: day_task_phase = 'icon';
  if (raw.phase && allowed.includes(raw.phase)) phase = raw.phase;
  else if (raw.status === 'done') phase = 'done';
  else if (raw.status === 'in_progress') phase = 'running';
  return {
    ...base,
    id: raw.id || base.id,
    phase,
    elapsed_ms: typeof raw.elapsed_ms === 'number' ? raw.elapsed_ms : 0,
    run_started_at: typeof raw.run_started_at === 'number' ? raw.run_started_at : null,
    appeared_at: raw.appeared_at ?? null,
    done_at: raw.done_at ?? null,
  };
}

function build_all(day: string): day_task[] {
  return day_task_templates.map((t) => blank_task(day, t));
}

export function load_day_tasks(spot_id: string, day = moscow_today_iso()): day_task[] {
  if (typeof window === 'undefined') return build_all(day);
  try {
    const raw = localStorage.getItem(storage_key(spot_id, day));
    if (!raw) {
      const tasks = build_all(day);
      save_day_tasks(spot_id, tasks, day);
      return tasks;
    }
    const parsed = JSON.parse(raw) as store;
    const by_tpl = new Map(
      (parsed.tasks || [])
        .map((t) => migrate_task(day, t))
        .filter(Boolean)
        .map((t) => [t!.template_id, t!])
    );
    const merged = day_task_templates.map((tpl) => by_tpl.get(tpl.id) || blank_task(day, tpl));
    save_day_tasks(spot_id, merged, day);
    return merged;
  } catch {
    return build_all(day);
  }
}

export function save_day_tasks(spot_id: string, tasks: day_task[], day = moscow_today_iso()) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storage_key(spot_id, day), JSON.stringify({ day, spot_id, tasks } satisfies store));
}

/** задачи, уже вышедшие по расписанию или начатые / завершённые */
export function get_board_tasks(tasks: day_task[], now = new Date()) {
  const due = tasks.filter(
    (t) =>
      t.phase === 'done' ||
      t.phase !== 'icon' ||
      Boolean(t.appeared_at) ||
      is_task_due(t.appear_at, now)
  );
  return {
    open: due.filter((t) => t.phase !== 'done'),
    done: due.filter((t) => t.phase === 'done'),
  };
}

export function mark_appeared(spot_id: string, tasks: day_task[], now = new Date(), day = moscow_today_iso()) {
  let changed = false;
  const next = tasks.map((t) => {
    if (t.appeared_at || t.phase === 'done') return t;
    if (!is_task_due(t.appear_at, now)) return t;
    changed = true;
    return { ...t, appeared_at: now.toISOString() };
  });
  if (changed) save_day_tasks(spot_id, next, day);
  return next;
}

export function live_elapsed_ms(task: day_task, now = Date.now()): number {
  const base = task.elapsed_ms || 0;
  if (task.phase === 'running' && task.run_started_at) {
    return base + Math.max(0, now - task.run_started_at);
  }
  return base;
}

/** один шаг взаимодействия с карточкой */
export function advance_day_task(
  spot_id: string,
  task_id: string,
  day = moscow_today_iso()
): day_task[] {
  const now = Date.now();
  const tasks = load_day_tasks(spot_id, day).map((t) => {
    if (t.id !== task_id) return t;

    switch (t.phase) {
      case 'icon':
        return { ...t, phase: 'info' as const, appeared_at: t.appeared_at || new Date().toISOString() };
      case 'info':
        return { ...t, phase: 'armed' as const };
      case 'armed':
        return {
          ...t,
          phase: 'running' as const,
          run_started_at: now,
        };
      case 'running': {
        const add = t.run_started_at ? Math.max(0, now - t.run_started_at) : 0;
        return {
          ...t,
          phase: 'stopped' as const,
          elapsed_ms: (t.elapsed_ms || 0) + add,
          run_started_at: null,
        };
      }
      case 'stopped':
        return {
          ...t,
          phase: 'done' as const,
          run_started_at: null,
          done_at: new Date().toISOString(),
        };
      default:
        return t;
    }
  });
  save_day_tasks(spot_id, tasks, day);
  return tasks;
}
