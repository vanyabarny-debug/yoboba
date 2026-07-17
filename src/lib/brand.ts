export const BRAND_NAME = 'yomoyo';
export const BRAND_WORD = 'yomoyo';
export const BRAND_SUFFIX = '';
export const BRAND_TAGLINE = 'первая баблтишная в городе';
export const BRAND_LOGO_SRC = '/images/logo/gong-cha-lantern.png';

/** глубокий насыщенный синий — белый текст читается (~7:1) */
export const BRAND_COLOR_ACCENT = '#0039A6';
export const BRAND_COLOR_ACCENT_DARK = '#002D7A';

/** @deprecated используй BRAND_COLOR_ACCENT */
export const BRAND_COLOR_BLUE = BRAND_COLOR_ACCENT;
/** @deprecated используй BRAND_COLOR_ACCENT */
export const BRAND_COLOR_PINK = BRAND_COLOR_ACCENT;

export type brand_font_id =
  | 'inter'
  | 'onest'
  | 'manrope'
  | 'golos'
  | 'commissioner'
  | 'unbounded'
  | 'geologica'
  | 'tektur'
  | 'wix_madefor'
  | 'wix_text'
  | 'rubik'
  | 'jost'
  | 'exo2'
  | 'oswald'
  | 'comfortaa'
  | 'nunito'
  | 'montserrat'
  | 'montserrat_classic'
  | 'raleway'
  | 'fira'
  | 'ibm_plex'
  | 'source_sans'
  | 'yanone'
  | 'mulish'
  | 'overpass'
  | 'sofia'
  | 'russo'
  | 'prosto'
  | 'shantell'
  | 'handjet'
  | 'bellota'
  | 'murecho'
  | 'inter_tight'
  | 'geist'
  | 'pt_sans'
  | 'scada'
  | 'alumni'
  | 'jetbrains'
  | 'soyuz'
  | 'lato'
  | 'helvetica_neue'
  | 'playfair'
  | 'heading_now'
  | 'druk'
  | 'bebas'
  | 'coolvetica'
  | 'dexa'
  | 'heathergreen'
  | 'sa_marino'
  | 'benzin'
  | 'moniqa'
  | 'cy_grotesk'
  | 'ruberoid'
  | 'sa_vredina'
  | 'tiktok_sans'
  | 'dela_gothic'
  | 'sofia_condensed'
  | 'sofia_xcondensed'
  | 'alumni_collegiate'
  | 'alumni_pinstripe'
  | 'cuprum'
  | 'tenor'
  | 'poiret'
  | 'pixelify'
  | 'literata'
  | 'prata'
  | 'oranienbaum'
  | 'spectral'
  | 'ysabeau'
  | 'ubuntu_sans'
  | 'roboto_flex'
  | 'noto_display'
  | 'philosopher'
  | 'jura'
  | 'days_one'
  | 'fira_condensed'
  | 'nunito_sans'
  | 'zen_maru'
  | 'caveat';

export const DEFAULT_FONT_SANS: brand_font_id = 'inter';
export const DEFAULT_FONT_DISPLAY: brand_font_id = 'geologica';
export const DEFAULT_DISPLAY_WEIGHT = 700;
export const DEFAULT_DISPLAY_TRACKING = -0.02;
/** масштаб заголовков/акцентов (1 = 100%) */
export const DEFAULT_DISPLAY_SCALE = 1;
