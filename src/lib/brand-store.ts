import {
  BRAND_COLOR_BLUE,
  BRAND_COLOR_PINK,
  BRAND_SUFFIX,
  BRAND_TAGLINE,
  BRAND_WORD,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_FONT_SANS,
} from '@/lib/brand';

export const brand_store_version = 1;

const storage_key = 'yoboba_brand_store';
const update_event = 'yoboba-brand-update';

export type brand_font_id = 'inter' | 'montserrat' | 'jetbrains';

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
};

export const brand_font_stacks: Record<brand_font_id, string> = {
  inter: 'var(--font-inter), system-ui, sans-serif',
  montserrat: 'var(--font-montserrat-alt), var(--font-inter), system-ui, sans-serif',
  jetbrains: 'var(--font-jetbrains-mono), ui-monospace, monospace',
};

export const brand_font_labels: Record<brand_font_id, string> = {
  inter: 'Inter',
  montserrat: 'Montserrat Alternates',
  jetbrains: 'JetBrains Mono',
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

export function get_default_brand_settings(): brand_settings {
  return {
    version: brand_store_version,
    brand_word: BRAND_WORD,
    brand_suffix: BRAND_SUFFIX,
    tagline: BRAND_TAGLINE,
    color_accent: BRAND_COLOR_BLUE,
    color_accent_pink: BRAND_COLOR_PINK,
    color_background: '#f4f5f6',
    color_foreground: '#20181b',
    font_sans: DEFAULT_FONT_SANS,
    font_display: DEFAULT_FONT_DISPLAY,
  };
}

const legacy_brand_blues = new Set(['#1A4FA3', '#0D4DB5', '#075AD4']);

function repair_settings(parsed: Partial<brand_settings>): brand_settings {
  const defaults = get_default_brand_settings();
  const accent_upper = parsed.color_accent?.toUpperCase();
  const accent_raw =
    accent_upper && legacy_brand_blues.has(accent_upper)
      ? defaults.color_accent
      : (parsed.color_accent ?? defaults.color_accent);
  return {
    version: brand_store_version,
    brand_word: parsed.brand_word?.trim() || defaults.brand_word,
    brand_suffix: parsed.brand_suffix ?? defaults.brand_suffix,
    tagline: parsed.tagline?.trim() || defaults.tagline,
    color_accent: normalize_hex(accent_raw, defaults.color_accent),
    color_accent_pink: normalize_hex(parsed.color_accent_pink ?? '', defaults.color_accent_pink),
    color_background: normalize_hex(parsed.color_background ?? '', defaults.color_background),
    color_foreground: normalize_hex(parsed.color_foreground ?? '', defaults.color_foreground),
    font_sans: parsed.font_sans && parsed.font_sans in brand_font_stacks ? parsed.font_sans : defaults.font_sans,
    font_display:
      parsed.font_display && parsed.font_display in brand_font_stacks
        ? parsed.font_display
        : defaults.font_display,
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
    const repaired = repair_settings(parsed);
    if (!parsed.version || parsed.version < brand_store_version) {
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
  const next = repair_settings(settings);
  localStorage.setItem(storage_key, JSON.stringify(next));
  emit_update();
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
  root.style.setProperty('--color-accent-pink', s.color_accent_pink);
  root.style.setProperty('--background', s.color_background);
  root.style.setProperty('--color-page', s.color_background);
  root.style.setProperty('--foreground', s.color_foreground);
  root.style.setProperty('--brand-font-sans', brand_font_stacks[s.font_sans]);
  root.style.setProperty('--brand-font-display', brand_font_stacks[s.font_display]);
}
