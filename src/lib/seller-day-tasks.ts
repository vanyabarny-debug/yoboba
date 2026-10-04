/** прогресс задач дня — только на этом устройстве, шаблоны приходят с сервера */

import { moscow_today_iso } from '@/lib/order-number';
import type { day_task_block, day_task_proof, day_task_template } from '@/lib/day-task-templates';

/** одно нажатие кнопки: начать → пауза → готово */
export type day_task_phase = 'pending' | 'running' | 'paused' | 'done';

export type day_task = {
  id: string;
  template_id: string;
  title: string;
  hint: string;
  appear_at: string;
  expected_minutes: number;
  proof: day_task_proof;
  blocks: day_task_block[];
  phase: day_task_phase;
  elapsed_ms: number;
  run_started_at: number | null;
  appeared_at: string | null;
  done_at: string | null;
};

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
    proof: t.proof,
    blocks: t.blocks,
    phase: 'pending',
    elapsed_ms: 0,
    run_started_at: null,
    appeared_at: null,
    done_at: null,
  };
}

function normalize_phase(raw: string | undefined): day_task_phase {
  if (raw === 'done') return 'done';
  if (raw === 'running' || raw === 'in_progress') return 'running';
  if (raw === 'paused' || raw === 'stopped') return 'paused';
  return 'pending';
}

function read_saved(spot_id: string, day: string): day_task[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storage_key(spot_id, day));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as store;
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    return [];
  }
}

export function save_day_tasks(spot_id: string, tasks: day_task[], day = moscow_today_iso()) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storage_key(spot_id, day), JSON.stringify({ day, spot_id, tasks } satisfies store));
}

/** подмешивает свежие тексты админа, прогресс смены оставляет */
export function apply_day_templates(
  spot_id: string,
  templates: day_task_template[],
  day = moscow_today_iso()
): day_task[] {
  const saved = read_saved(spot_id, day);
  const by_tpl = new Map(saved.map((t) => [t.template_id, t]));
  const tasks = templates.map((tpl) => {
    const prev = by_tpl.get(tpl.id);
    const base = blank_task(day, tpl);
    if (!prev) return base;
    const phase = normalize_phase(prev.phase || (prev as { status?: string }).status);
    return {
      ...base,
      id: prev.id || base.id,
      phase,
      elapsed_ms: typeof prev.elapsed_ms === 'number' ? prev.elapsed_ms : 0,
      run_started_at:
        phase === 'running'
          ? typeof prev.run_started_at === 'number'
            ? prev.run_started_at
            : Date.now()
          : null,
      appeared_at: prev.appeared_at ?? null,
      done_at: prev.done_at ?? null,
    };
  });
  save_day_tasks(spot_id, tasks, day);
  return tasks;
}

export function get_board_tasks(tasks: day_task[], now = new Date()) {
  const due = tasks
    .filter(
      (t) =>
        t.phase === 'done' ||
        t.phase !== 'pending' ||
        Boolean(t.appeared_at) ||
        is_task_due(t.appear_at, now)
    )
    .sort((a, b) => a.appear_at.localeCompare(b.appear_at));
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

/** начать → пауза → выполнено */
export function press_day_task(spot_id: string, task_id: string, day = moscow_today_iso()): day_task[] {
  const now = Date.now();
  const tasks = read_saved(spot_id, day).map((t) => {
    if (t.id !== task_id) return t;
    if (t.phase === 'pending') {
      return {
        ...t,
        phase: 'running' as const,
        run_started_at: now,
        appeared_at: t.appeared_at || new Date().toISOString(),
      };
    }
    if (t.phase === 'running') {
      const add = t.run_started_at ? Math.max(0, now - t.run_started_at) : 0;
      return {
        ...t,
        phase: 'paused' as const,
        elapsed_ms: (t.elapsed_ms || 0) + add,
        run_started_at: null,
      };
    }
    if (t.phase === 'paused') {
      return {
        ...t,
        phase: 'done' as const,
        run_started_at: null,
        done_at: new Date().toISOString(),
      };
    }
    return t;
  });
  save_day_tasks(spot_id, tasks, day);
  return tasks;
}
