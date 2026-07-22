export const BRAND_NAME = 'yomoyo';
export const BRAND_WORD = 'yomoyo';
export const BRAND_SUFFIX = '';
export const BRAND_TAGLINE = 'первая баблтишная в городе';
export const BRAND_LOGO_SRC = '/images/logo/gong-cha-lantern.png';

/** staff / admin PWA brand */
export const SQUAD_NAME = 'yoSquad';
export const SQUAD_SHORT = 'yoSquad';
export const SQUAD_TAGLINE = 'команда точки';
export const SQUAD_ICON_192 = '/icons/yosquad-192.png';
export const SQUAD_ICON_512 = '/icons/yosquad-512.png';

/** coral / energy — основной CTA и акцент */
export const BRAND_COLOR_ACCENT = '#FF6B6B';
export const BRAND_COLOR_ACCENT_DARK = '#002D7A';
export const BRAND_COLOR_INK = '#20181B';
export const BRAND_COLOR_PAGE = '#F4F5F6';
export const BRAND_COLOR_SURFACE = '#FFFFFF';
export const BRAND_COLOR_MUTE = '#8B8689';
/** pearl-паттерн (точки тапиоки) */
export const BRAND_PEARL = '#0039A6';
export const BRAND_PEARL_DOT = '#20181B';

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
  | 'caveat'
  | 'fredoka';

/** body */
export const DEFAULT_FONT_SANS: brand_font_id = 'comfortaa';
/** заголовки игровые / script */
export const DEFAULT_FONT_DISPLAY: brand_font_id = 'caveat';
/** заголовки мягкие (по умолчанию) */
export const DEFAULT_FONT_HEADING_SOFT: brand_font_id = 'nunito';
/** wordmark */
export const DEFAULT_FONT_LOGO: brand_font_id = 'fredoka';
export const DEFAULT_DISPLAY_WEIGHT = 700;
export const DEFAULT_DISPLAY_TRACKING = -0.02;
export const DEFAULT_LOGO_WEIGHT = 600;
export const DEFAULT_LOGO_TRACKING = 0.04;
/** масштаб только для игровых заголовков (1 = 100%) */
export const DEFAULT_DISPLAY_SCALE = 2;
export type heading_style = 'soft' | 'playful';
export const DEFAULT_HEADING_STYLE: heading_style = 'soft';
