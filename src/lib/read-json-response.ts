/** безопасный разбор JSON: если сервер отдал HTML (502/логин/ошибка) — понятная ошибка */
export async function read_json_response<T = unknown>(
  res: Response
): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(res.ok ? 'пустой ответ сервера' : `ошибка сервера ${res.status}`);
  }
  if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
    throw new Error(
      res.status >= 500
        ? 'сервер временно недоступен — обнови страницу'
        : res.status === 401 || res.status === 403
          ? 'нужно войти заново'
          : 'сервер вернул страницу вместо данных — обнови страницу'
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`не удалось разобрать ответ сервера (${res.status})`);
  }
}
