import {
  BRAND_COLOR_ACCENT,
  BRAND_COLOR_ACCENT_DARK,
  BRAND_COLOR_INK,
  BRAND_COLOR_MUTE,
  BRAND_COLOR_PAGE,
  BRAND_COLOR_SURFACE,
  BRAND_PEARL,
  BRAND_PEARL_DOT,
  BRAND_SUFFIX,
  BRAND_TAGLINE,
  BRAND_WORD,
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_DISPLAY_TRACKING,
  DEFAULT_DISPLAY_WEIGHT,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_FONT_HEADING_SOFT,
  DEFAULT_FONT_LOGO,
  DEFAULT_FONT_SANS,
  DEFAULT_LOGO_TRACKING,
  DEFAULT_LOGO_WEIGHT,
  type brand_font_id,
  type heading_style,
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

export type { brand_font_id, brand_font_weight, heading_style };
export {
  brand_font_display_options,
  brand_font_labels,
  brand_font_sans_options,
  brand_font_stacks,
};

export const brand_store_version = 19;

const storage_key = 'yoboba_brand_store';
const update_event = 'yoboba-brand-update';

/** версия, с которой накатываем актуальный фирменный стиль yomoyo */
const YOMOYO_STYLE_VERSION = 16;
const HEADLINE_SCALE_VERSION = 18;
const SOFT_HEADING_VERSION = 19;

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
  /** мягкие заголовки (Nunito и т.п.) */
  font_heading_soft: brand_font_id;
  font_logo: brand_font_id;
  display_weight: brand_font_weight;
  display_tracking: number;
  logo_weight: brand_font_weight;
  logo_tracking: number;
  /** масштаб игровых заголовков (1 = 100%) */
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
  return Math.min(4, Math.max(0.6, Math.round(n * 100) / 100));
}

export function get_default_brand_settings(): brand_settings {
  return {
    version: brand_store_version,
    brand_word: BRAND_WORD,
    brand_suffix: BRAND_SUFFIX,
    tagline: BRAND_TAGLINE,
    color_accent: BRAND_COLOR_ACCENT,
    color_accent_pink: BRAND_COLOR_ACCENT_DARK,
    color_background: BRAND_COLOR_PAGE,
    color_foreground: BRAND_COLOR_INK,
    font_sans: DEFAULT_FONT_SANS,
    font_display: DEFAULT_FONT_DISPLAY,
    font_heading_soft: DEFAULT_FONT_HEADING_SOFT,
    font_logo: DEFAULT_FONT_LOGO,
    display_weight: DEFAULT_DISPLAY_WEIGHT as brand_font_weight,
    display_tracking: DEFAULT_DISPLAY_TRACKING,
    logo_weight: DEFAULT_LOGO_WEIGHT as brand_font_weight,
    logo_tracking: DEFAULT_LOGO_TRACKING,
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
  const force_style = !parsed.version || parsed.version < YOMOYO_STYLE_VERSION;
  const force_headline_scale = !parsed.version || parsed.version < HEADLINE_SCALE_VERSION;
  const force_soft_heading = !parsed.version || parsed.version < SOFT_HEADING_VERSION;

  const font_sans =
    !force_style && parsed.font_sans && parsed.font_sans in brand_font_stacks
      ? parsed.font_sans
      : defaults.font_sans;
  const font_display =
    !force_style && parsed.font_display && parsed.font_display in brand_font_stacks
      ? parsed.font_display
      : defaults.font_display;
  const font_heading_soft =
    !force_soft_heading &&
    parsed.font_heading_soft &&
    parsed.font_heading_soft in brand_font_stacks
      ? parsed.font_heading_soft
      : defaults.font_heading_soft;
  const font_logo =
    !force_style && parsed.font_logo && parsed.font_logo in brand_font_stacks
      ? parsed.font_logo
      : defaults.font_logo;

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
    color_accent: force_style
      ? defaults.color_accent
      : normalize_hex(parsed.color_accent ?? '', defaults.color_accent),
    color_accent_pink: force_style
      ? defaults.color_accent_pink
      : normalize_hex(parsed.color_accent_pink ?? '', defaults.color_accent_pink),
    color_background: force_style
      ? defaults.color_background
      : normalize_hex(parsed.color_background ?? '', defaults.color_background),
    color_foreground: force_style
      ? defaults.color_foreground
      : normalize_hex(parsed.color_foreground ?? '', defaults.color_foreground),
    font_sans,
    font_display,
    font_heading_soft,
    font_logo,
    display_weight: clamp_font_weight(
      font_display,
      force_style ? defaults.display_weight : (parsed.display_weight ?? defaults.display_weight)
    ),
    display_tracking: force_style
      ? defaults.display_tracking
      : normalize_tracking(parsed.display_tracking, defaults.display_tracking),
    logo_weight: clamp_font_weight(
      font_logo,
      force_style ? defaults.logo_weight : (parsed.logo_weight ?? defaults.logo_weight)
    ),
    logo_tracking: force_style
      ? defaults.logo_tracking
      : normalize_tracking(parsed.logo_tracking, defaults.logo_tracking),
    display_scale: force_style || force_headline_scale
      ? defaults.display_scale
      : normalize_scale(parsed.display_scale, defaults.display_scale),
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
  load_brand_google_fonts(
    next.font_sans,
    next.font_display,
    next.font_logo,
    next.font_heading_soft
  );
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
  root.style.setProperty('--brand-mute', BRAND_COLOR_MUTE);
  root.style.setProperty('--brand-surface', BRAND_COLOR_SURFACE);
  root.style.setProperty('--brand-pearl', BRAND_PEARL);
  root.style.setProperty('--brand-pearl-dot', BRAND_PEARL_DOT);
  root.style.setProperty('--brand-font-sans', brand_font_stacks[s.font_sans]);
  root.style.setProperty('--brand-font-display', brand_font_stacks[s.font_display]);
  root.style.setProperty('--brand-font-heading-soft', brand_font_stacks[s.font_heading_soft]);
  root.style.setProperty('--brand-font-logo', brand_font_stacks[s.font_logo]);
  root.style.setProperty('--font-sans', brand_font_stacks[s.font_sans]);
  root.style.setProperty('--font-display', brand_font_stacks[s.font_display]);
  root.style.setProperty('--font-heading-soft', brand_font_stacks[s.font_heading_soft]);
  root.style.setProperty('--font-logo', brand_font_stacks[s.font_logo]);
  root.style.setProperty('--brand-font-display-weight', String(s.display_weight));
  root.style.setProperty('--brand-font-display-tracking', `${s.display_tracking}em`);
  root.style.setProperty('--brand-font-logo-weight', String(s.logo_weight));
  root.style.setProperty('--brand-font-logo-tracking', `${s.logo_tracking}em`);
  root.style.setProperty('--brand-font-display-scale', String(s.display_scale));
  root.style.setProperty('--brand-font-body-weight', '700');
}
