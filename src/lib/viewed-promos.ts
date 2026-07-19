// Локальный трекер просмотренных акций-сторис. Просмотренные показываем тускло,
// как в инсте. Хранится в localStorage, чтобы переживать перезагрузку.

const storage_key = 'yoboba_viewed_promos';
const update_event = 'yoboba-viewed-promos-update';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storage_key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  localStorage.setItem(storage_key, JSON.stringify(ids));
  window.dispatchEvent(new Event(update_event));
}

export function get_viewed_promos(): Set<string> {
  return new Set(read());
}

export function is_promo_viewed(id: string): boolean {
  return read().includes(id);
}

export function mark_promo_viewed(id: string) {
  if (typeof window === 'undefined') return;
  const ids = read();
  if (ids.includes(id)) return; // уже отмечена — не дёргаем подписчиков
  ids.push(id);
  write(ids);
}

export function subscribe_viewed_promos(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}
