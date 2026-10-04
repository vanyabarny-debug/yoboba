/** Система открытия смены с чек-листом */

export type opening_checklist_item = {
  id: string;
  item_order: number;
  item_text: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
};

export type opening_task = {
  id: string;
  spot_id: string;
  spot_address: string | null;
  shift_date: string;
  seller_id: string | null;
  seller_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  items: opening_checklist_item[];
};

/** Дефолтный чек-лист открытия — можно кастомизировать через админку */
export const default_opening_checklist = [
  'Включить освещение и оборудование',
  'Проверить чистоту рабочей зоны',
  'Проверить наличие необходимых материалов',
  'Включить кассу и проверить связь',
  'Проверить температуру в холодильниках',
  'Подготовить зону выдачи заказов',
  'Проверить наличие упаковки и стаканов',
  'Заполнить журнал открытия смены',
  'Проверить актуальность меню',
  'Готов принимать заказы',
];

/** Время появления задачи открытия (по Москве) */
export const OPENING_TASK_TIME = '11:00';

/** Конвертация HH:MM в минуты */
function time_to_minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Проверка, должна ли задача открытия уже появиться */
export function should_show_opening_task(now = new Date()): boolean {
  const moscow_time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  
  return time_to_minutes(moscow_time) >= time_to_minutes(OPENING_TASK_TIME);
}

/** Проверка завершенности чек-листа */
export function is_opening_complete(task: opening_task): boolean {
  return task.items.length > 0 && task.items.every((item) => item.is_checked);
}

/** Процент выполнения */
export function opening_progress(task: opening_task): number {
  if (task.items.length === 0) return 0;
  const checked = task.items.filter((item) => item.is_checked).length;
  return Math.round((checked / task.items.length) * 100);
}
