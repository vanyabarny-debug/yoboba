// Валидация ссылок для кнопки перехода в акции-сторис.
//
// Правило: принимаем только «корневые» ссылки — внутренние разделы сайта
// (начинаются с «/») и ссылки на популярные площадки из белого списка.
// Любые сторонние домены отклоняются.

export type promo_link_platform = {
  id: string;
  label: string;
  domains: string[];
};

// Собственный сайт + популярные соцсети/мессенджеры/видеоплощадки.
export const allowed_link_platforms: promo_link_platform[] = [
  { id: 'site', label: 'сайт yomoyo', domains: ['yomoyo.com', 'yomoyo.ru'] },
  { id: 'telegram', label: 'telegram', domains: ['t.me', 'telegram.me', 'telegram.org'] },
  { id: 'instagram', label: 'instagram', domains: ['instagram.com', 'instagr.am'] },
  { id: 'vk', label: 'вконтакте', domains: ['vk.com', 'vk.ru', 'm.vk.com'] },
  { id: 'ok', label: 'одноклассники', domains: ['ok.ru', 'odnoklassniki.ru'] },
  { id: 'youtube', label: 'youtube', domains: ['youtube.com', 'youtu.be', 'm.youtube.com'] },
  { id: 'whatsapp', label: 'whatsapp', domains: ['wa.me', 'whatsapp.com', 'api.whatsapp.com'] },
  { id: 'tiktok', label: 'tiktok', domains: ['tiktok.com', 'vm.tiktok.com'] },
  { id: 'facebook', label: 'facebook', domains: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com'] },
  { id: 'x', label: 'x / twitter', domains: ['x.com', 'twitter.com'] },
  { id: 'dzen', label: 'дзен', domains: ['dzen.ru', 'zen.yandex.ru'] },
  { id: 'rutube', label: 'rutube', domains: ['rutube.ru'] },
  { id: 'pinterest', label: 'pinterest', domains: ['pinterest.com', 'pin.it'] },
];

export const allowed_platform_labels = allowed_link_platforms.map((p) => p.label);

function strip_www(host: string): string {
  return host.replace(/^www\./, '').toLowerCase();
}

function host_matches(host: string, domain: string): boolean {
  const h = strip_www(host);
  return h === domain || h.endsWith(`.${domain}`);
}

export function is_internal_link(raw: string): boolean {
  const value = raw.trim();
  return value.startsWith('/') && !value.startsWith('//');
}

export function match_platform(host: string): promo_link_platform | null {
  return (
    allowed_link_platforms.find((p) => p.domains.some((d) => host_matches(host, d))) ?? null
  );
}

export type promo_link_result =
  | { ok: true; kind: 'internal'; normalized: string; platform: null }
  | { ok: true; kind: 'external'; normalized: string; platform: promo_link_platform }
  | { ok: false; reason: string };

/**
 * Разбирает и валидирует ссылку. Пустая строка считается валидной (ссылки нет).
 */
export function classify_promo_link(raw: string | null | undefined): promo_link_result {
  const value = (raw ?? '').trim();
  if (!value) return { ok: true, kind: 'internal', normalized: '', platform: null };

  if (is_internal_link(value)) {
    return { ok: true, kind: 'internal', normalized: value, platform: null };
  }

  // допускаем ввод без схемы: «t.me/yomoyo» → «https://t.me/yomoyo»
  const with_scheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(with_scheme);
  } catch {
    return { ok: false, reason: 'некорректная ссылка' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'разрешены только http(s) ссылки' };
  }

  const platform = match_platform(url.hostname);
  if (!platform) {
    return {
      ok: false,
      reason: `сторонние ссылки нельзя. можно: ${allowed_platform_labels.join(', ')}`,
    };
  }

  return { ok: true, kind: 'external', normalized: url.toString(), platform };
}

export function is_allowed_promo_link(raw: string | null | undefined): boolean {
  return classify_promo_link(raw).ok;
}

/**
 * Возвращает нормализованную ссылку или null, если она недопустима.
 * Пустая строка → null (ссылки нет).
 */
export function normalize_promo_link(raw: string | null | undefined): string | null {
  const res = classify_promo_link(raw);
  if (!res.ok) return null;
  return res.normalized || null;
}
