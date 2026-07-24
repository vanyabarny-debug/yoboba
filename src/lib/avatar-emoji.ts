/** стоимость смены аватарки в тапикоинах */
export const AVATAR_EMOJI_CHANGE_COST = 200;

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

export function is_avatar_emoji(value: unknown): value is string {
  return typeof value === 'string' && (AVATAR_EMOJI_POOL as readonly string[]).includes(value);
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
