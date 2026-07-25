/**
 * Куда вернуть пользователя после успешного входа.
 * Только относительные пути; /login, /auth и /profile не считаем целью —
 * /profile раньше создавал петлю login?returnUrl=/profile после VK.
 */
export function sanitize_auth_return_path(raw: string | null | undefined): string {
  if (!raw) return '/';

  let path = raw.trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname + new URL(path).search;
    }
  } catch {
    return '/';
  }

  if (!path.startsWith('/') || path.startsWith('//')) return '/';

  const pathname = path.split(/[?#]/)[0] || '/';
  if (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/auth') ||
    pathname === '/profile' ||
    pathname.startsWith('/profile/')
  ) {
    return '/';
  }

  return path;
}
