/** Система закрытия смены с чек-листом */

export type closing_checklist_item = {
  id: string;
  item_order: number;
  item_text: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
};

export type closing_task = {
  id: string;
  spot_id: string;
  spot_address: string | null;
  shift_date: string;
  seller_id: string | null;
  seller_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  items: closing_checklist_item[];
};

/** Дефолтный чек-лист закрытия */
export const default_closing_checklist = [
  'Убрать и промыть оборудование и инвентарь',
  'Промыть термопот',
  'Барная стойка: протереть и убраться (стойка для гостей и касса)',
  'Разложить топпинги и сиропы, убрать сырьё в холодильник',
  'Вымыть полы',
  'Привести в порядок санузел',
  'Выключить бактерицидную лампу, отключить лишнюю технику',
  'Провести дезинсекцию',
  'Занести вечернюю уборку в журнал',
  'Списать остатки тапиоки',
  'Заполнить журнал генеральных уборок',
  'Заполнить журнал учёта дезинфицирующих средств',
  'Заполнить журнал учёта брака и списания',
  'Заполнить журнал учёта температуры',
  'Посчитать кассу, закрыть смену и отправить отчёт',
  'Подготовить мусор: собрать и упаковать в пакеты',
  'Промыть мусорные вёдра',
  'Закрыть дверь для гостей',
  'Вынести мусор',
];

/** Время появления задачи закрытия (по Москве) */
export const CLOSING_TASK_TIME = '20:00';

/** Конвертация HH:MM в минуты */
function time_to_minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Проверка, должна ли задача закрытия уже появиться */
export function should_show_closing_task(now = new Date()): boolean {
  const moscow_time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  
  return time_to_minutes(moscow_time) >= time_to_minutes(CLOSING_TASK_TIME);
}

/** Проверка завершенности чек-листа */
export function is_closing_complete(task: closing_task): boolean {
  return task.items.length > 0 && task.items.every((item) => item.is_checked);
}

/** Процент выполнения */
export function closing_progress(task: closing_task): number {
  if (task.items.length === 0) return 0;
  const checked = task.items.filter((item) => item.is_checked).length;
  return Math.round((checked / task.items.length) * 100);
}
