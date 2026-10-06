/** Чек-лист «в течение дня» — текущие дела смены между открытием и закрытием */

export type day_checklist_item = {
  id: string;
  item_order: number;
  item_text: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
};

export type day_checklist_task = {
  id: string;
  spot_id: string;
  spot_address: string | null;
  shift_date: string;
  seller_id: string | null;
  seller_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  items: day_checklist_item[];
};

/** Дефолтный чек-лист дня — пункты можно отмечать в любом порядке */
export const default_day_checklist = [
  'Следить за уровнем воды в термопоте — доливать фильтрованную воду до отметки по мере работы',
  'Протирать оборудование и инвентарь сразу после использования — не откладывать',
  'При необходимости варить свежую тапиоку и делать заготовки льда',
  'По мере загрязнения мыть полы и рабочие поверхности — поддерживать чистоту в течение всего дня',
  'Следить за мылом и туалетной бумагой в санузле, пополнять при необходимости',
  'Убрать санузел — обязательно за смену, в любом случае',
  'Провести дезинсекцию',
  'Провести дневную уборку (первая из двух за смену)',
  'Заполнить журнал учёта дезинфицирующих средств',
  'Заполнить журнал генеральных уборок',
];

/** Время появления задачи дня (по Москве) — сразу после утреннего открытия */
export const DAY_TASK_TIME = '12:00';

function time_to_minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Проверка, должна ли задача дня уже появиться */
export function should_show_day_task(now = new Date()): boolean {
  const moscow_time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return time_to_minutes(moscow_time) >= time_to_minutes(DAY_TASK_TIME);
}

/** Проверка завершенности чек-листа */
export function is_day_complete(task: day_checklist_task): boolean {
  return task.items.length > 0 && task.items.every((item) => item.is_checked);
}

/** Процент выполнения */
export function day_progress(task: day_checklist_task): number {
  if (task.items.length === 0) return 0;
  const checked = task.items.filter((item) => item.is_checked).length;
  return Math.round((checked / task.items.length) * 100);
}
