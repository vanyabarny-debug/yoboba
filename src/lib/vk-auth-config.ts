export const vk_authorize_url = 'https://id.vk.ru/authorize';
export const vk_token_url = 'https://id.vk.ru/oauth2/auth';
export const vk_user_info_url = 'https://id.vk.ru/oauth2/user_info';
export const vk_default_scope = 'vkid.personal_info email phone';

export function is_vk_auth_configured() {
  // для web + PKCE достаточно client_id и site url; secret не обязателен
  return Boolean(
    process.env.NEXT_PUBLIC_VK_CLIENT_ID && process.env.NEXT_PUBLIC_SITE_URL
  );
}

export function vk_redirect_uri(origin?: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || origin || '';
  return `${base.replace(/\/$/, '')}/auth/vk/callback`;
}

/** публичный origin сайта (не 0.0.0.0 из Docker HOSTNAME) */
export function public_site_origin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) return configured;

  const headers = request.headers;
  const host = headers.get('x-forwarded-host') || headers.get('host');
  if (host && !host.startsWith('0.0.0.0') && !host.startsWith('127.0.0.1')) {
    const proto = headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

export function vk_auth_email(vk_user_id: string) {
  return `vk${vk_user_id}@auth.yoboba`;
}
