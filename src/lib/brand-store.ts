import {
  BRAND_COLOR_ACCENT,
  BRAND_COLOR_ACCENT_DARK,
  BRAND_SUFFIX,
  BRAND_TAGLINE,
  BRAND_WORD,
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_DISPLAY_TRACKING,
  DEFAULT_DISPLAY_WEIGHT,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_FONT_SANS,
  type brand_font_id,
} from '@/lib/brand';
import {
  brand_font_display_options,
  brand_font_labels,
  brand_font_sans_options,
  brand_font_stacks,
  clamp_font_weight,
  load_brand_google_fonts,
  type brand_font_weight,
} from '@/lib/brand-font-catalog';

export type { brand_font_id, brand_font_weight };
export {
  brand_font_display_options,
  brand_font_labels,
  brand_font_sans_options,
  brand_font_stacks,
};

export const brand_store_version = 15;

const storage_key = 'yoboba_brand_store';
const update_event = 'yoboba-brand-update';

export type brand_settings = {
  version: number;
  brand_word: string;
  brand_suffix: string;
  tagline: string;
  color_accent: string;
  color_accent_pink: string;
  color_background: string;
  color_foreground: string;
  font_sans: brand_font_id;
  font_display: brand_font_id;
  display_weight: brand_font_weight;
  display_tracking: number;
  /** масштаб логотипа / заголовков / акцентов (1 = 100%) */
  display_scale: number;
};

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

function normalize_hex(value: string, fallback: string) {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  return fallback;
}

function normalize_tracking(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(0.2, Math.max(-0.12, Math.round(n * 1000) / 1000));
}

function normalize_scale(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1.8, Math.max(0.6, Math.round(n * 100) / 100));
}

export function get_default_brand_settings(): brand_settings {
  return {
    version: brand_store_version,
    brand_word: BRAND_WORD,
    brand_suffix: BRAND_SUFFIX,
    tagline: BRAND_TAGLINE,
    color_accent: BRAND_COLOR_ACCENT,
    color_accent_pink: BRAND_COLOR_ACCENT_DARK,
    color_background: '#f4f5f6',
    color_foreground: '#20181b',
    font_sans: DEFAULT_FONT_SANS,
    font_display: DEFAULT_FONT_DISPLAY,
    display_weight: DEFAULT_DISPLAY_WEIGHT as brand_font_weight,
    display_tracking: DEFAULT_DISPLAY_TRACKING,
    display_scale: DEFAULT_DISPLAY_SCALE,
  };
}

const legacy_brand_names = new Set([
  'koppu',
  'koppu x',
  'koppux',
  'белый',
  'белый тигр',
  'белыйтигр',
  'БЕЛЫЙ',
  'БЕЛЫЙ ТИГР',
  'gong',
  'gong cha',
  'gongcha',
  'k-drinks',
  'kdrinks',
  'yoboba',
  'chaora',
  'баблтишная',
]);

const legacy_taglines = new Set(['первые в городе']);

/** Мержит сохранённые поля с дефолтами. Не сбрасывает кастом при bump версии. */
function normalize_settings(parsed: Partial<brand_settings>): brand_settings {
  const defaults = get_default_brand_settings();
  const legacy_name = `${parsed.brand_word ?? ''}${parsed.brand_suffix ?? ''}`.trim().toLowerCase();
  const is_legacy_name =
    legacy_brand_names.has(parsed.brand_word?.trim().toLowerCase() ?? '') ||
    legacy_brand_names.has(legacy_name);

  const font_sans =
    parsed.font_sans && parsed.font_sans in brand_font_stacks ? parsed.font_sans : defaults.font_sans;
  const font_display =
    parsed.font_display && parsed.font_display in brand_font_stacks
      ? parsed.font_display
      : defaults.font_display;

  return {
    version: brand_store_version,
    brand_word: is_legacy_name
      ? defaults.brand_word
      : parsed.brand_word?.trim() || defaults.brand_word,
    brand_suffix: is_legacy_name ? defaults.brand_suffix : (parsed.brand_suffix ?? defaults.brand_suffix),
    tagline: (() => {
      const current = parsed.tagline?.trim() ?? '';
      if (!current || legacy_taglines.has(current.toLowerCase())) return defaults.tagline;
      return current;
    })(),
    color_accent: normalize_hex(parsed.color_accent ?? '', defaults.color_accent),
    color_accent_pink: normalize_hex(parsed.color_accent_pink ?? '', defaults.color_accent_pink),
    color_background: normalize_hex(parsed.color_background ?? '', defaults.color_background),
    color_foreground: normalize_hex(parsed.color_foreground ?? '', defaults.color_foreground),
    font_sans,
    font_display,
    display_weight: clamp_font_weight(font_display, parsed.display_weight ?? defaults.display_weight),
    display_tracking: normalize_tracking(parsed.display_tracking, defaults.display_tracking),
    display_scale: normalize_scale(parsed.display_scale, defaults.display_scale),
  };
}

export function get_brand_settings(): brand_settings {
  if (typeof window === 'undefined') return get_default_brand_settings();
  const raw = localStorage.getItem(storage_key);
  if (!raw) {
    const seed = get_default_brand_settings();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<brand_settings>;
    const repaired = normalize_settings(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(repaired)) {
      localStorage.setItem(storage_key, JSON.stringify(repaired));
    }
    return repaired;
  } catch {
    const seed = get_default_brand_settings();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function save_brand_settings(settings: brand_settings) {
  const next = normalize_settings({
    ...settings,
    version: brand_store_version,
  });
  localStorage.setItem(storage_key, JSON.stringify(next));
  load_brand_google_fonts(next.font_sans, next.font_display);
  apply_brand_theme(next);
  emit_update();
  return next;
}

export function reset_brand_settings() {
  save_brand_settings(get_default_brand_settings());
}

export function subscribe_brand_settings(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function get_brand_name(settings?: brand_settings) {
  const s = settings ?? get_brand_settings();
  return `${s.brand_word}${s.brand_suffix}`.trim();
}

export function apply_brand_theme(settings?: brand_settings) {
  if (typeof document === 'undefined') return;
  const s = settings ?? get_brand_settings();
  const root = document.documentElement;
  root.style.setProperty('--color-accent', s.color_accent);
  root.style.setProperty('--color-accent-soft', s.color_accent_pink);
  root.style.setProperty('--color-accent-pink', s.color_accent);
  root.style.setProperty('--color-accent-pink-soft', s.color_accent_pink);
  root.style.setProperty('--background', s.color_background);
  root.style.setProperty('--color-page', s.color_background);
  root.style.setProperty('--foreground', s.color_foreground);
  root.style.setProperty('--brand-font-sans', brand_font_stacks[s.font_sans]);
  root.style.setProperty('--brand-font-display', brand_font_stacks[s.font_display]);
  root.style.setProperty('--font-sans', brand_font_stacks[s.font_sans]);
  root.style.setProperty('--font-display', brand_font_stacks[s.font_display]);
  root.style.setProperty('--brand-font-display-weight', String(s.display_weight));
  root.style.setProperty('--brand-font-display-tracking', `${s.display_tracking}em`);
  root.style.setProperty('--brand-font-display-scale', String(s.display_scale));
}
