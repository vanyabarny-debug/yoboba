const admin_cookie = 'yoboba_admin';
const admin_login = 'admin';
const admin_password = 'admin';

export function check_admin_credentials(login: string, password: string) {
  return login.trim().toLowerCase() === admin_login && password === admin_password;
}

export function is_admin_session(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${admin_cookie}=1`));
}

export function set_admin_session() {
  document.cookie = `${admin_cookie}=1; path=/; max-age=86400; samesite=lax`;
}

export function clear_admin_session() {
  document.cookie = `${admin_cookie}=; path=/; max-age=0; samesite=lax`;
}
