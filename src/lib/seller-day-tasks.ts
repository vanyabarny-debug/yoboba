/** ежедневные задачи смены для доски баристы */

import { moscow_today_iso } from '@/lib/order-number';

export type day_task_status = 'pending' | 'in_progress' | 'done';

export type day_task = {
  id: string;
  template_id: string;
  title: string;
  hint: string;
  status: day_task_status;
  started_at: string | null;
  done_at: string | null;
};

type day_task_template = {
  id: string;
  title: string;
  hint: string;
};

/** регулярные задачи дня — появляются сами при открытии смены */
export const day_task_templates: day_task_template[] = [
  {
    id: 'fryer-clean',
    title: 'уборка фритюра',
    hint: 'слить, протереть, собрать',
  },
  {
    id: 'oil-change',
    title: 'сдать масло',
    hint: 'замена / сдача отработки',
  },
  {
    id: 'journals',
    title: 'журналы',
    hint: 'расписаться в журналах смены',
  },
  {
    id: 'showcase',
    title: 'витрина',
    hint: 'протереть стекло и полки',
  },
  {
    id: 'floor',
    title: 'пол у кассы',
    hint: 'подмести / протереть зону выдачи',
  },
  {
    id: 'trash',
    title: 'мусор',
    hint: 'вынести пакеты, сменить мешки',
  },
];

type store = {
  day: string;
  spot_id: string;
  tasks: day_task[];
};

function storage_key(spot_id: string, day: string) {
  return `yoboba:seller-day-tasks:${spot_id}:${day}`;
}

function build_tasks(day: string): day_task[] {
  return day_task_templates.map((t) => ({
    id: `${day}:${t.id}`,
    template_id: t.id,
    title: t.title,
    hint: t.hint,
    status: 'pending' as const,
    started_at: null,
    done_at: null,
  }));
}

export function load_day_tasks(spot_id: string, day = moscow_today_iso()): day_task[] {
  if (typeof window === 'undefined') return build_tasks(day);
  try {
    const raw = localStorage.getItem(storage_key(spot_id, day));
    if (!raw) {
      const tasks = build_tasks(day);
      save_day_tasks(spot_id, tasks, day);
      return tasks;
    }
    const parsed = JSON.parse(raw) as store;
    if (!parsed?.tasks?.length) {
      const tasks = build_tasks(day);
      save_day_tasks(spot_id, tasks, day);
      return tasks;
    }
    // подтянуть новые шаблоны, не трогая уже начатые
    const by_tpl = new Map(parsed.tasks.map((t) => [t.template_id, t]));
    const merged = day_task_templates.map((tpl) => {
      const existing = by_tpl.get(tpl.id);
      if (existing) return { ...existing, title: tpl.title, hint: tpl.hint };
      return {
        id: `${day}:${tpl.id}`,
        template_id: tpl.id,
        title: tpl.title,
        hint: tpl.hint,
        status: 'pending' as const,
        started_at: null,
        done_at: null,
      };
    });
    save_day_tasks(spot_id, merged, day);
    return merged;
  } catch {
    return build_tasks(day);
  }
}

export function save_day_tasks(spot_id: string, tasks: day_task[], day = moscow_today_iso()) {
  if (typeof window === 'undefined') return;
  const payload: store = { day, spot_id, tasks };
  localStorage.setItem(storage_key(spot_id, day), JSON.stringify(payload));
}

export function patch_day_task(
  spot_id: string,
  task_id: string,
  status: day_task_status,
  day = moscow_today_iso()
): day_task[] {
  const tasks = load_day_tasks(spot_id, day).map((t) => {
    if (t.id !== task_id) return t;
    if (status === 'in_progress') {
      return {
        ...t,
        status,
        started_at: t.started_at || new Date().toISOString(),
        done_at: null,
      };
    }
    if (status === 'done') {
      return {
        ...t,
        status,
        started_at: t.started_at || new Date().toISOString(),
        done_at: new Date().toISOString(),
      };
    }
    return { ...t, status: 'pending' as const, started_at: null, done_at: null };
  });
  save_day_tasks(spot_id, tasks, day);
  return tasks;
}
