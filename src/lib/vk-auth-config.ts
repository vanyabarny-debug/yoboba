export const vk_authorize_url = 'https://id.vk.ru/authorize';
export const vk_token_url = 'https://id.vk.ru/oauth2/auth';
export const vk_user_info_url = 'https://id.vk.ru/oauth2/user_info';
export const vk_default_scope = 'vkid.personal_info email';

export function is_vk_auth_configured() {
  const public_ok = Boolean(
    process.env.NEXT_PUBLIC_VK_CLIENT_ID && process.env.NEXT_PUBLIC_SITE_URL
  );
  if (!public_ok) return false;
  // VK_CLIENT_SECRET is server-only — on the client public vars are enough
  if (typeof window !== 'undefined') return true;
  return Boolean(process.env.VK_CLIENT_SECRET);
}

export function vk_redirect_uri(origin?: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || origin || '';
  return `${base.replace(/\/$/, '')}/auth/vk/callback`;
}

export function vk_auth_email(vk_user_id: string) {
  return `vk${vk_user_id}@auth.yoboba`;
}
