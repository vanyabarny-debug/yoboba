import {
  DEFAULT_DISPLAY_WEIGHT,
  DEFAULT_FONT_DISPLAY,
  DEFAULT_FONT_SANS,
  type brand_font_id,
} from '@/lib/brand';

export type brand_font_weight = 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type brand_font_def = {
  label: string;
  stack: string;
  /** имя для Google Fonts CSS2 API (без family=) */
  google_family?: string;
  category: 'sans' | 'display' | 'mono' | 'local' | 'system';
  /** реальные начертания (synthetic bold выключен) */
  weights: brand_font_weight[];
};

const WEIGHT_LABELS: Record<brand_font_weight, string> = {
  300: 'Light 300',
  400: 'Regular 400',
  500: 'Medium 500',
  600: 'SemiBold 600',
  700: 'Bold 700',
  800: 'ExtraBold 800',
  900: 'Black 900',
};

function def(
  label: string,
  stack: string,
  weights: brand_font_weight[],
  opts?: { google_family?: string; category?: brand_font_def['category'] }
): brand_font_def {
  return {
    label,
    stack,
    weights,
    google_family: opts?.google_family,
    category: opts?.category ?? (opts?.google_family ? 'display' : 'local'),
  };
}

export const brand_font_catalog: Record<brand_font_id, brand_font_def> = {
  inter: def('Inter — нейтральный UI', 'var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    category: 'sans',
  }),
  onest: def('Onest — русский trendy', '"Onest", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Onest',
  }),
  manrope: def('Manrope — геометрический', '"Manrope", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Manrope',
  }),
  golos: def('Golos Text — русский neo', '"Golos Text", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Golos Text',
    category: 'sans',
  }),
  commissioner: def('★ Commissioner — характерный', '"Commissioner", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Commissioner',
  }),
  unbounded: def('★ Unbounded — уличный display', '"Unbounded", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Unbounded',
  }),
  geologica: def('★ Geologica — мягкий trendy', '"Geologica", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Geologica',
  }),
  tektur: def('★ Tektur — tech / street', '"Tektur", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Tektur',
  }),
  wix_madefor: def('★ Wix Madefor Display', '"Wix Madefor Display", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Wix Madefor Display',
  }),
  wix_text: def('Wix Madefor Text — современный', '"Wix Madefor Text", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    google_family: 'Wix Madefor Text',
    category: 'sans',
  }),
  rubik: def('★ Rubik — округлый pop', '"Rubik", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Rubik',
  }),
  jost: def('★ Jost — fashion geometric', '"Jost", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Jost',
  }),
  exo2: def('★ Exo 2 — sport / future', '"Exo 2", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Exo 2',
  }),
  oswald: def('★ Oswald — condensed poster', '"Oswald", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Oswald',
  }),
  comfortaa: def('★ Comfortaa — bubble / soft', '"Comfortaa", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    google_family: 'Comfortaa',
  }),
  nunito: def('Nunito', '"Nunito", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Nunito',
  }),
  montserrat: def('★ Montserrat Alternates', '"Montserrat Alternates", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Montserrat Alternates',
  }),
  montserrat_classic: def('★ Montserrat', '"Montserrat", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Montserrat',
  }),
  raleway: def('★ Raleway — elegant geometric', '"Raleway", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800, 900], {
    google_family: 'Raleway',
  }),
  fira: def('Fira Sans — чистый', '"Fira Sans", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Fira Sans',
    category: 'sans',
  }),
  ibm_plex: def('IBM Plex Sans — editorial', '"IBM Plex Sans", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'IBM Plex Sans',
    category: 'sans',
  }),
  source_sans: def('Source Sans 3 — классика UI', '"Source Sans 3", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800], {
    google_family: 'Source Sans 3',
    category: 'sans',
  }),
  yanone: def('★ Yanone Kaffeesatz — узкий display', '"Yanone Kaffeesatz", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Yanone Kaffeesatz',
  }),
  mulish: def('Mulish — лёгкий geometric', '"Mulish", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Mulish',
    category: 'sans',
  }),
  overpass: def('Overpass — open / street', '"Overpass", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800], {
    google_family: 'Overpass',
    category: 'sans',
  }),
  sofia: def('★ Sofia Sans — variable trendy', '"Sofia Sans", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800, 900], {
    google_family: 'Sofia Sans',
  }),
  russo: def('★ Russo One — poster / bold', '"Russo One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Russo One',
  }),
  prosto: def('★ Prosto One — русский display', '"Prosto One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Prosto One',
  }),
  shantell: def('★ Shantell Sans — живой / fun', '"Shantell Sans", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Shantell Sans',
  }),
  handjet: def('★ Handjet — variable glitch', '"Handjet", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Handjet',
  }),
  bellota: def('★ Bellota — мягкий bubble', '"Bellota", var(--font-inter), system-ui, sans-serif', [300, 400, 700], {
    google_family: 'Bellota',
  }),
  murecho: def('★ Murecho — японский geometric', '"Murecho", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Murecho',
  }),
  inter_tight: def('Inter Tight — плотный UI', '"Inter Tight", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800], {
    google_family: 'Inter Tight',
    category: 'sans',
  }),
  geist: def('Geist — vercel / tech', '"Geist", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Geist',
    category: 'sans',
  }),
  pt_sans: def('PT Sans — русская классика', '"PT Sans", var(--font-inter), system-ui, sans-serif', [400, 700], {
    google_family: 'PT Sans',
    category: 'sans',
  }),
  scada: def('Scada — чистый русский', '"Scada", var(--font-inter), system-ui, sans-serif', [400, 700], {
    google_family: 'Scada',
    category: 'sans',
  }),
  alumni: def('★ Alumni Sans — condensed fashion', '"Alumni Sans", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800, 900], {
    google_family: 'Alumni Sans',
  }),
  jetbrains: def('JetBrains Mono — моно', '"JetBrains Mono", ui-monospace, monospace', [400, 500, 600, 700], {
    google_family: 'JetBrains Mono',
    category: 'mono',
  }),
  soyuz: def('★ Союз Гротеск (local)', 'var(--font-soyuz-grotesk), var(--font-inter), system-ui, sans-serif', [700], {
    category: 'local',
  }),

  /* ── 15 с картинки: бесплатные / системные аналоги (OFL / system) ── */
  lato: def('Lato', '"Lato", var(--font-inter), system-ui, sans-serif', [300, 400, 700, 900], {
    google_family: 'Lato',
    category: 'sans',
  }),
  helvetica_neue: def(
    'Helvetica Neue Cyr (system)',
    '"Helvetica Neue", Helvetica, Arial, sans-serif',
    [300, 400, 500, 700],
    { category: 'system' }
  ),
  playfair: def('Playfair Display — контрастный display', '"Playfair Display", Georgia, serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Playfair Display',
  }),
  heading_now: def('≈ Heading Now — Unbounded', '"Unbounded", var(--font-inter), system-ui, sans-serif', [600, 700, 800, 900], {
    google_family: 'Unbounded',
  }),
  druk: def('≈ Druk — Russo One', '"Russo One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Russo One',
  }),
  bebas: def('≈ Bebas Neue — Oswald', '"Oswald", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Oswald',
  }),
  coolvetica: def('≈ Coolvetica — Comfortaa', '"Comfortaa", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    google_family: 'Comfortaa',
  }),
  dexa: def('≈ Dexa Pro — Inter Tight', '"Inter Tight", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Inter Tight',
  }),
  heathergreen: def('≈ Heathergreen — Alumni Sans', '"Alumni Sans", var(--font-inter), system-ui, sans-serif', [500, 600, 700, 800, 900], {
    google_family: 'Alumni Sans',
  }),
  sa_marino: def('≈ SA Marino — Raleway', '"Raleway", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Raleway',
  }),
  benzin: def('≈ Benzin — Jost', '"Jost", var(--font-inter), system-ui, sans-serif', [500, 600, 700, 800, 900], {
    google_family: 'Jost',
  }),
  moniqa: def('≈ Moniqa — Playfair Display', '"Playfair Display", Georgia, serif', [600, 700, 800, 900], {
    google_family: 'Playfair Display',
  }),
  cy_grotesk: def('≈ Cy Grotesk — Golos Text', '"Golos Text", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    google_family: 'Golos Text',
  }),
  ruberoid: def('≈ Ruberoid — Sofia Sans', '"Sofia Sans", var(--font-inter), system-ui, sans-serif', [600, 700, 800, 900], {
    google_family: 'Sofia Sans',
  }),
  sa_vredina: def('≈ SA VREDINA — Yanone', '"Yanone Kaffeesatz", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Yanone Kaffeesatz',
  }),

  /* ── топы 2025–2026, все с кириллицей (Google Fonts / OFL) ── */
  tiktok_sans: def('★ TikTok Sans — viral 2025', '"TikTok Sans", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'TikTok Sans',
  }),
  dela_gothic: def('★ Dela Gothic One — bold JP vibe', '"Dela Gothic One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Dela Gothic One',
  }),
  sofia_condensed: def('★ Sofia Sans Condensed — fashion', '"Sofia Sans Condensed", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Sofia Sans Condensed',
  }),
  sofia_xcondensed: def('★ Sofia Extra Condensed — poster', '"Sofia Sans Extra Condensed", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Sofia Sans Extra Condensed',
  }),
  alumni_collegiate: def('★ Alumni Collegiate — varsity', '"Alumni Sans Collegiate One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Alumni Sans Collegiate One',
  }),
  alumni_pinstripe: def('★ Alumni Pinstripe — fashion thin', '"Alumni Sans Pinstripe", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Alumni Sans Pinstripe',
  }),
  cuprum: def('★ Cuprum — tech / clean RU', '"Cuprum", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    google_family: 'Cuprum',
  }),
  tenor: def('★ Tenor Sans — elegant narrow', '"Tenor Sans", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Tenor Sans',
  }),
  poiret: def('★ Poiret One — art deco fashion', '"Poiret One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Poiret One',
  }),
  pixelify: def('★ Pixelify Sans — retro pixel', '"Pixelify Sans", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700], {
    google_family: 'Pixelify Sans',
  }),
  literata: def('★ Literata — editorial serif', '"Literata", Georgia, serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Literata',
  }),
  prata: def('★ Prata — luxury display', '"Prata", Georgia, serif', [400], {
    google_family: 'Prata',
  }),
  oranienbaum: def('★ Oranienbaum — classic RU display', '"Oranienbaum", Georgia, serif', [400], {
    google_family: 'Oranienbaum',
  }),
  spectral: def('★ Spectral — soft editorial', '"Spectral", Georgia, serif', [300, 400, 500, 600, 700, 800], {
    google_family: 'Spectral',
  }),
  ysabeau: def('★ Ysabeau — soft trendy serif', '"Ysabeau", Georgia, serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Ysabeau',
  }),
  ubuntu_sans: def('★ Ubuntu Sans — friendly modern', '"Ubuntu Sans", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800], {
    google_family: 'Ubuntu Sans',
    category: 'sans',
  }),
  roboto_flex: def('★ Roboto Flex — variable mega', '"Roboto Flex", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800, 900], {
    google_family: 'Roboto Flex',
  }),
  noto_display: def('★ Noto Sans Display — clean XL', '"Noto Sans Display", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Noto Sans Display',
  }),
  philosopher: def('★ Philosopher — soft humanist', '"Philosopher", var(--font-inter), system-ui, sans-serif', [400, 700], {
    google_family: 'Philosopher',
  }),
  jura: def('★ Jura — geometric tech', '"Jura", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700], {
    google_family: 'Jura',
  }),
  days_one: def('★ Days One — bold poster', '"Days One", var(--font-inter), system-ui, sans-serif', [400], {
    google_family: 'Days One',
  }),
  fira_condensed: def('★ Fira Condensed — tight UI', '"Fira Sans Condensed", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 600, 700, 800], {
    google_family: 'Fira Sans Condensed',
  }),
  nunito_sans: def('★ Nunito Sans — soft geometric', '"Nunito Sans", var(--font-inter), system-ui, sans-serif', [400, 500, 600, 700, 800, 900], {
    google_family: 'Nunito Sans',
    category: 'sans',
  }),
  zen_maru: def('★ Zen Maru Gothic — soft JP', '"Zen Maru Gothic", var(--font-inter), system-ui, sans-serif', [300, 400, 500, 700, 900], {
    google_family: 'Zen Maru Gothic',
  }),
  caveat: def('★ Caveat — handwritten fun', '"Caveat", cursive', [400, 500, 600, 700], {
    google_family: 'Caveat',
  }),
};

export const brand_font_stacks = Object.fromEntries(
  Object.entries(brand_font_catalog).map(([id, font]) => [id, font.stack])
) as Record<brand_font_id, string>;

export const brand_font_labels = Object.fromEntries(
  Object.entries(brand_font_catalog).map(([id, font]) => [id, font.label])
) as Record<brand_font_id, string>;

export const brand_font_sans_options: brand_font_id[] = [
  'inter',
  'tiktok_sans',
  'ubuntu_sans',
  'nunito_sans',
  'roboto_flex',
  'noto_display',
  'lato',
  'helvetica_neue',
  'inter_tight',
  'geist',
  'golos',
  'cuprum',
  'pt_sans',
  'scada',
  'manrope',
  'nunito',
  'fira',
  'fira_condensed',
  'ibm_plex',
  'source_sans',
  'wix_text',
  'mulish',
  'overpass',
  'onest',
  'sofia',
  'jura',
];

/** топы 2025–26 с кириллицей → референсы → остальные */
export const brand_font_display_options: brand_font_id[] = [
  'tiktok_sans',
  'dela_gothic',
  'sofia_condensed',
  'sofia_xcondensed',
  'alumni_collegiate',
  'alumni_pinstripe',
  'roboto_flex',
  'noto_display',
  'cuprum',
  'tenor',
  'poiret',
  'pixelify',
  'days_one',
  'jura',
  'philosopher',
  'zen_maru',
  'ysabeau',
  'prata',
  'oranienbaum',
  'literata',
  'spectral',
  'caveat',
  'ubuntu_sans',
  'nunito_sans',
  'fira_condensed',
  'heading_now',
  'helvetica_neue',
  'druk',
  'bebas',
  'coolvetica',
  'dexa',
  'heathergreen',
  'sa_marino',
  'benzin',
  'moniqa',
  'cy_grotesk',
  'ruberoid',
  'sa_vredina',
  'lato',
  'nunito',
  'unbounded',
  'geologica',
  'tektur',
  'sofia',
  'shantell',
  'bellota',
  'comfortaa',
  'rubik',
  'russo',
  'prosto',
  'handjet',
  'murecho',
  'alumni',
  'jost',
  'exo2',
  'wix_madefor',
  'oswald',
  'raleway',
  'yanone',
  'playfair',
  'montserrat',
  'montserrat_classic',
  'commissioner',
  'onest',
  'manrope',
  'golos',
  'soyuz',
];

export function brand_font_weight_options(font_id: brand_font_id) {
  return brand_font_catalog[font_id]?.weights ?? [DEFAULT_DISPLAY_WEIGHT as brand_font_weight];
}

export function brand_font_weight_label(weight: brand_font_weight) {
  return WEIGHT_LABELS[weight];
}

export function clamp_font_weight(font_id: brand_font_id, weight: number): brand_font_weight {
  const weights = brand_font_weight_options(font_id);
  if (weights.includes(weight as brand_font_weight)) return weight as brand_font_weight;
  return weights.reduce((closest, current) =>
    Math.abs(current - weight) < Math.abs(closest - weight) ? current : closest
  );
}

function google_css_spec(font_id: brand_font_id) {
  const font = brand_font_catalog[font_id];
  if (!font?.google_family) return null;
  const family = encodeURIComponent(font.google_family).replace(/%20/g, '+');
  const weights = [...font.weights].sort((a, b) => a - b).join(';');
  return `family=${family}:wght@${weights}`;
}

const GOOGLE_FONTS_LINK_ID = 'yoboba-brand-google-fonts';

export function brand_fonts_stylesheet_href(font_sans: brand_font_id, font_display: brand_font_id) {
  const specs = new Set<string>();
  for (const id of [font_sans, font_display]) {
    const spec = google_css_spec(id);
    if (spec) specs.add(spec);
  }
  if (specs.size === 0) return null;
  return `https://fonts.googleapis.com/css2?${[...specs].join('&')}&display=swap`;
}

export function load_brand_google_fonts(font_sans: brand_font_id, font_display: brand_font_id) {
  if (typeof document === 'undefined') return;
  const href = brand_fonts_stylesheet_href(font_sans, font_display);
  document.getElementById(GOOGLE_FONTS_LINK_ID)?.remove();
  if (!href) return;

  const link = document.createElement('link');
  link.id = GOOGLE_FONTS_LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function default_brand_fonts_stylesheet_href() {
  return brand_fonts_stylesheet_href(DEFAULT_FONT_SANS, DEFAULT_FONT_DISPLAY);
}
