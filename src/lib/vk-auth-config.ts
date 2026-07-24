export const vk_authorize_url = 'https://id.vk.ru/authorize';
export const vk_token_url = 'https://id.vk.ru/oauth2/auth';
export const vk_user_info_url = 'https://id.vk.ru/oauth2/user_info';
export const vk_public_info_url = 'https://id.vk.ru/oauth2/public_info';
/**
 * Минимальный scope всегда работает.
 * email/phone — только если включены в кабинете VK ID (иначе часто «Ошибка загрузки»).
 * Переопределение: VK_AUTH_SCOPE="vkid.personal_info email phone"
 */
export const vk_default_scope =
  process.env.VK_AUTH_SCOPE?.trim() || 'vkid.personal_info';

export function is_vk_auth_configured() {
  // для web + PKCE достаточно client_id и site url; secret не обязателен
  return Boolean(
    process.env.NEXT_PUBLIC_VK_CLIENT_ID && process.env.NEXT_PUBLIC_SITE_URL
  );
}

function is_local_host(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local')
  );
}

function try_parse_origin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** origin из заголовков прокси/хоста */
export function origin_from_request(request: Request): string | null {
  const headers = request.headers;
  const host = headers.get('x-forwarded-host') || headers.get('host');
  if (!host || is_local_host(host.split(':')[0] || host)) return null;
  const proto = headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`.replace(/\/$/, '');
}

/**
 * Origin для VK OAuth / redirect_uri.
 * Всегда берём NEXT_PUBLIC_SITE_URL на проде — он должен совпадать с кабинетом VK ID.
 * clientOrigin раньше ломал вход (www vs apex / другой хост).
 */
export function public_site_origin(request: Request, _client_origin?: string | null) {
  const configured = try_parse_origin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured && !is_local_host(new URL(configured).hostname)) {
    return configured;
  }

  const from_request = origin_from_request(request);
  if (from_request) return from_request;

  return configured || new URL(request.url).origin.replace(/\/$/, '');
}

export function vk_redirect_uri(origin: string) {
  return `${origin.replace(/\/$/, '')}/auth/vk/callback`;
}

/** как в VK ID SDK: protocol + hostname без path */
export function vk_authorize_origin(origin: string) {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return origin.replace(/\/$/, '');
  }
}

export function vk_cookies_secure() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  return site.startsWith('https://') || process.env.NODE_ENV === 'production';
}

export function vk_auth_email(vk_user_id: string) {
  return `vk${vk_user_id}@auth.yoboba`;
}
