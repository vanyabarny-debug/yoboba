const hits = new Map<string, { count: number; reset_at: number }>();
const window_ms = 10 * 60_000;
const ip_limit = 40;
const login_limit = 20;

function too_many(key: string, limit: number) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || row.reset_at <= now) return false;
  return row.count >= limit;
}

function note(key: string) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || row.reset_at <= now) {
    hits.set(key, { count: 1, reset_at: now + window_ms });
    return;
  }
  row.count += 1;
}

export function client_ip(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function staff_login_blocked(ip: string, login: string) {
  const name = login.trim().toLowerCase().slice(0, 80) || 'empty';
  return too_many(`ip:${ip}`, ip_limit) || too_many(`login:${name}`, login_limit);
}

export function note_staff_login_failure(ip: string, login: string) {
  const name = login.trim().toLowerCase().slice(0, 80) || 'empty';
  note(`ip:${ip}`);
  note(`login:${name}`);
  if (hits.size > 5000) {
    const now = Date.now();
    for (const [key, row] of hits) {
      if (row.reset_at <= now) hits.delete(key);
    }
  }
}
