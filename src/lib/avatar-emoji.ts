/** смена эмоджи бесплатна — бобабаллы только за напитки */
export const AVATAR_EMOJI_CHANGE_COST = 0;

/** набор эмоджи для аватарок (бабл-ти / еда / милые) */
export const AVATAR_EMOJI_POOL = [
  '🧋',
  '🍵',
  '🥤',
  '🍓',
  '🍑',
  '🍒',
  '🥝',
  '🥭',
  '🍋',
  '🍊',
  '🍉',
  '🍇',
  '🐻',
  '🐼',
  '🦊',
  '🐱',
  '🐰',
  '🐸',
  '🐯',
  '🦄',
  '🍩',
  '🍪',
  '🧁',
  '🍰',
  '🍦',
  '🌙',
  '⭐',
  '💫',
  '🔥',
  '💚',
  '💙',
  '💜',
  '✨',
  '🌸',
  '🍀',
  '🎯',
] as const;

export type avatar_emoji = (typeof AVATAR_EMOJI_POOL)[number];

/** палитра фона кружка (плоские мягкие цвета, без градиентов) */
export const AVATAR_BG_POOL = [
  { id: 'accent', label: 'коралл', color: null },
  { id: 'peach', label: 'персик', color: '#FFE4DC' },
  { id: 'cream', label: 'крем', color: '#FFF1D6' },
  { id: 'mint', label: 'мята', color: '#DDF5EA' },
  { id: 'sky', label: 'небо', color: '#DCEAF8' },
  { id: 'pearl', label: 'жемчуг', color: '#D9E4F7' },
  { id: 'lilac', label: 'сирень', color: '#EDE4F8' },
  { id: 'rose', label: 'роза', color: '#FCE4EC' },
  { id: 'sand', label: 'песок', color: '#F0E6DA' },
  { id: 'fog', label: 'туман', color: '#E8E8EA' },
] as const;

export type avatar_bg_id = (typeof AVATAR_BG_POOL)[number]['id'];

export function is_avatar_emoji(value: unknown): value is string {
  return typeof value === 'string' && (AVATAR_EMOJI_POOL as readonly string[]).includes(value);
}

export function is_avatar_bg(value: unknown): value is string | null {
  if (value == null || value === '' || value === 'accent') return true;
  if (typeof value !== 'string') return false;
  return AVATAR_BG_POOL.some((c) => c.color === value || c.id === value);
}

/** нормализуем в hex или null (= цвет темы accent) */
export function normalize_avatar_bg(value: unknown): string | null {
  if (value == null || value === '' || value === 'accent') return null;
  if (typeof value !== 'string') return null;
  const by_id = AVATAR_BG_POOL.find((c) => c.id === value);
  if (by_id) return by_id.color;
  const by_color = AVATAR_BG_POOL.find((c) => c.color === value);
  if (by_color) return by_color.color;
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  return null;
}

export function random_avatar_emoji(): string {
  const i = Math.floor(Math.random() * AVATAR_EMOJI_POOL.length);
  return AVATAR_EMOJI_POOL[i] ?? '🧋';
}

/** стабильный эмоджи из id (если в БД ещё нет поля / для гостя) */
export function avatar_emoji_from_id(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_EMOJI_POOL[hash % AVATAR_EMOJI_POOL.length] ?? '🧋';
}

export function avatar_circle_style(bg: string | null | undefined): {
  className: string;
  style?: { backgroundColor: string };
} {
  const color = normalize_avatar_bg(bg);
  if (!color) {
    return {
      className: 'bg-accent/15 ring-2 ring-accent/25',
    };
  }
  return {
    className: 'ring-2 ring-black/[0.06]',
    style: { backgroundColor: color },
  };
}
