const admin_cookie = 'yoboba_admin';

export function is_admin_session(): boolean {
  return false;
}

export function set_admin_session() {}

export function clear_admin_session() {
  if (typeof document === 'undefined') return;
  document.cookie = `${admin_cookie}=; path=/; max-age=0; samesite=lax`;
}
