/** один холст вместо отдельных макетов дизайна */

export type studio_font = 'logo' | 'heading' | 'display' | 'sans';
export type studio_align = 'left' | 'center' | 'right';
export type studio_kind = 'text' | 'image' | 'shape' | 'qr';

export type studio_layer = {
  id: string;
  kind: studio_kind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  text: string;
  font: studio_font;
  weight: number;
  fontSize: number;
  color: string;
  align: studio_align;
  fill: string;
  radius: number;
  src: string;
  strike: boolean;
};

export type studio_format = {
  id: string;
  group: string;
  label: string;
  w: number;
  h: number;
  panels?: number;
  gutter?: number;
  panel_w?: number;
};

export type studio_doc = {
  formatId: string;
  bg: string;
  bg2: string;
  layers: studio_layer[];
};

export type painted_layer = {
  layer: studio_layer;
  key: string;
  live: boolean;
};

export const REF_W = 1080;
export const STORE_KEY = 'yomoyo_studio_v1';

export const FONTS: { id: studio_font; label: string; family: string; canvas: string }[] = [
  { id: 'logo', label: 'лого', family: 'Fredoka, system-ui, sans-serif', canvas: 'Fredoka' },
  { id: 'heading', label: 'заголовок', family: 'Nunito, system-ui, sans-serif', canvas: 'Nunito' },
  { id: 'display', label: 'акцент', family: 'Caveat, cursive', canvas: 'Caveat' },
  { id: 'sans', label: 'текст', family: 'Comfortaa, system-ui, sans-serif', canvas: 'Comfortaa' },
];

export const SWATCHES = ['#FF6B6B', '#F04E45', '#0039A6', '#20181B', '#FFFFFF', '#FFF7EC'];

export const FORMATS: studio_format[] = [
  { id: 'promo', group: 'промо', label: 'промо', w: 1080, h: 1920 },
  { id: 'combo', group: 'комбо', label: 'комбо', w: 1080, h: 1440 },
  { id: 'booklet', group: 'буклет', label: 'буклет', w: 1754, h: 1240, panels: 3, gutter: 104, panel_w: 550 },
  { id: 'poster', group: 'постер', label: 'постер', w: 1240, h: 1754 },
  { id: 'flyer', group: 'флаер', label: 'флаер', w: 1080, h: 1520 },
  { id: 'card', group: 'карточка', label: 'карточка', w: 1080, h: 1350 },
  { id: 'menu', group: 'меню', label: 'вертикальное', w: 1684, h: 2384 },
  { id: 'menu-wide', group: 'меню', label: 'горизонтальное', w: 2384, h: 1684 },
  { id: 'banner-story', group: 'баннер', label: 'сторис', w: 1080, h: 1920 },
  { id: 'banner-square', group: 'баннер', label: 'квадрат', w: 1080, h: 1080 },
  { id: 'banner-wide', group: 'баннер', label: 'широкий', w: 1920, h: 1080 },
  { id: 'banner-poster', group: 'баннер', label: 'постер', w: 1080, h: 1350 },
];

export const FORMAT_GROUPS = [
  { id: 'promo', label: 'промо', format: 'promo' },
  { id: 'combo', label: 'комбо', format: 'combo' },
  { id: 'booklet', label: 'буклет', format: 'booklet' },
  { id: 'poster', label: 'постер', format: 'poster' },
  { id: 'flyer', label: 'флаер', format: 'flyer' },
  { id: 'card', label: 'карточка', format: 'card' },
  { id: 'menu', label: 'меню', format: 'menu' },
  { id: 'banner', label: 'баннер', format: 'banner-story' },
] as const;

const BLIN = '/admin/designer/assets/blin-DVI69KYa.png';
const TARO = '/admin/designer/assets/taro-BdmOiRJ7.png';

let seq = 0;

export function uid() {
  seq += 1;
  return `l${Date.now().toString(36)}${seq}`;
}

export function format_by_id(id: string | null | undefined): studio_format {
  return FORMATS.find((item) => item.id === id) ?? FORMATS[0];
}

export function storage_key(format_id: string) {
  return format_id.startsWith('banner-') ? 'banner' : format_id;
}

export function font_family(id: studio_font) {
  return FONTS.find((item) => item.id === id)?.family ?? FONTS[1].family;
}

export function canvas_font(id: studio_font) {
  return FONTS.find((item) => item.id === id)?.canvas ?? 'Nunito';
}

export function px(font_size: number, format_w: number) {
  return font_size * (format_w / REF_W);
}

export function make_layer(partial: Partial<studio_layer> & Pick<studio_layer, 'kind'>): studio_layer {
  return {
    id: uid(),
    name: '',
    x: 0.1,
    y: 0.1,
    w: 0.4,
    h: 0.12,
    rotation: 0,
    z: 1,
    text: '',
    font: 'heading',
    weight: 800,
    fontSize: 64,
    color: '#20181B',
    align: 'left',
    fill: '',
    radius: 0,
    src: '',
    strike: false,
    ...partial,
  };
}

function text_layer(
  partial: Partial<studio_layer> & Pick<studio_layer, 'text' | 'x' | 'y' | 'w' | 'h'>,
): studio_layer {
  return make_layer({ kind: 'text', font: 'heading', weight: 800, color: '#FFFFFF', ...partial });
}

function menu_doc(format_id: string): studio_doc {
  return { formatId: format_id, bg: '#FFFFFF', bg2: '#FFFFFF', layers: [] };
}

export function preset(format_id: string): studio_doc {
  const format = format_by_id(format_id);
  if (format.group === 'меню') return menu_doc(format.id);
  if (format.id === 'combo') return combo_doc();
  if (format.id === 'booklet') return booklet_doc();
  if (format.id === 'poster') return poster_doc();
  if (format.id === 'flyer') return flyer_doc();
  if (format.id === 'card') return card_doc();
  if (format.group === 'баннер') return banner_doc(format.id);
  return promo_doc();
}

function promo_doc(): studio_doc {
  return {
    formatId: 'promo',
    bg: '#FF6B6B',
    bg2: '#0039A6',
    layers: [
      text_layer({
        name: 'лого',
        text: 'yomoyo',
        x: 0.08,
        y: 0.05,
        w: 0.6,
        h: 0.07,
        font: 'logo',
        weight: 600,
        fontSize: 64,
      }),
      text_layer({
        name: 'заголовок',
        text: 'открой.\nосвежись.',
        x: 0.08,
        y: 0.16,
        w: 0.84,
        h: 0.28,
        fontSize: 120,
        weight: 800,
      }),
      text_layer({
        name: 'слоган',
        text: 'первая баблтишная в городе',
        x: 0.08,
        y: 0.46,
        w: 0.8,
        h: 0.1,
        font: 'sans',
        weight: 700,
        fontSize: 32,
      }),
      text_layer({
        name: 'цена',
        text: 'от 169 ₽',
        x: 0.08,
        y: 0.6,
        w: 0.46,
        h: 0.07,
        fontSize: 40,
        color: '#FF6B6B',
        fill: '#FFFFFF',
        align: 'center',
        radius: 999,
      }),
    ],
  };
}

function combo_doc(): studio_doc {
  return {
    formatId: 'combo',
    bg: '#F04E45',
    bg2: '#FFFFFF',
    layers: [
      text_layer({
        name: 'скидка',
        text: '−20%',
        x: 0.07,
        y: 0.05,
        w: 0.86,
        h: 0.18,
        fontSize: 150,
      }),
      text_layer({
        name: 'условие',
        text: 'бери блин —\nскидка на бабл-ти',
        x: 0.07,
        y: 0.24,
        w: 0.7,
        h: 0.12,
        fontSize: 40,
      }),
      text_layer({
        name: 'новая цена',
        text: '360 ₽',
        x: 0.07,
        y: 0.39,
        w: 0.36,
        h: 0.07,
        fontSize: 36,
        fill: '#FF6B6B',
        align: 'center',
        radius: 999,
      }),
      text_layer({
        name: 'старая цена',
        text: '450 ₽',
        x: 0.46,
        y: 0.4,
        w: 0.28,
        h: 0.06,
        fontSize: 32,
        color: '#8B8689',
        strike: true,
        weight: 600,
      }),
      make_layer({
        kind: 'image',
        name: 'напиток',
        src: TARO,
        x: 0.02,
        y: 0.52,
        w: 0.42,
        h: 0.36,
      }),
      make_layer({
        kind: 'image',
        name: 'блин',
        src: BLIN,
        x: 0.5,
        y: 0.5,
        w: 0.46,
        h: 0.36,
      }),
      text_layer({
        name: 'подпись напитка',
        text: 'бабл-ти',
        x: 0.06,
        y: 0.88,
        w: 0.34,
        h: 0.05,
        font: 'sans',
        fontSize: 28,
        color: '#20181B',
      }),
      text_layer({
        name: 'подпись блина',
        text: 'блин',
        x: 0.55,
        y: 0.88,
        w: 0.38,
        h: 0.05,
        font: 'sans',
        fontSize: 28,
        color: '#20181B',
        align: 'right',
      }),
      text_layer({
        name: 'лого',
        text: 'yomoyo',
        x: 0.55,
        y: 0.92,
        w: 0.38,
        h: 0.06,
        font: 'logo',
        weight: 600,
        fontSize: 42,
        color: '#F04E45',
        align: 'right',
      }),
    ],
  };
}

function booklet_doc(): studio_doc {
  return {
    formatId: 'booklet',
    bg: '#F04E45',
    bg2: '#FFFFFF',
    layers: [
      text_layer({
        name: 'скидка',
        text: '−20%',
        x: 0.075,
        y: 0.06,
        w: 0.26,
        h: 0.16,
        fontSize: 72,
      }),
      text_layer({
        name: 'условие',
        text: 'блин +\nбабл-ти',
        x: 0.075,
        y: 0.23,
        w: 0.26,
        h: 0.12,
        fontSize: 28,
      }),
      text_layer({
        name: 'цена',
        text: '360 ₽',
        x: 0.075,
        y: 0.38,
        w: 0.16,
        h: 0.06,
        fontSize: 22,
        fill: '#FFFFFF',
        color: '#F04E45',
        align: 'center',
        radius: 999,
      }),
      text_layer({
        name: 'было',
        text: '450 ₽',
        x: 0.24,
        y: 0.39,
        w: 0.1,
        h: 0.05,
        fontSize: 16,
        color: '#8B8689',
        strike: true,
        weight: 600,
      }),
      make_layer({
        kind: 'image',
        name: 'блин',
        src: BLIN,
        x: 0.07,
        y: 0.5,
        w: 0.14,
        h: 0.28,
      }),
      make_layer({
        kind: 'image',
        name: 'напиток',
        src: TARO,
        x: 0.2,
        y: 0.48,
        w: 0.14,
        h: 0.3,
      }),
      text_layer({
        name: 'лого',
        text: 'yomoyo',
        x: 0.075,
        y: 0.86,
        w: 0.26,
        h: 0.07,
        font: 'logo',
        weight: 600,
        fontSize: 28,
        color: '#F04E45',
      }),
    ],
  };
}

function poster_doc(): studio_doc {
  return {
    formatId: 'poster',
    bg: '#0039A6',
    bg2: '#001A4D',
    layers: [
      text_layer({
        name: 'лого',
        text: 'yomoyo',
        x: 0.08,
        y: 0.05,
        w: 0.7,
        h: 0.06,
        font: 'logo',
        weight: 600,
        fontSize: 56,
      }),
      text_layer({
        name: 'заголовок',
        text: 'летний\nбабл-ти',
        x: 0.08,
        y: 0.16,
        w: 0.84,
        h: 0.28,
        fontSize: 110,
      }),
      text_layer({
        name: 'подзаголовок',
        text: 'манго · малина · личи',
        x: 0.08,
        y: 0.46,
        w: 0.8,
        h: 0.08,
        font: 'sans',
        fontSize: 32,
        weight: 700,
      }),
      text_layer({
        name: 'плашка',
        text: 'уже в меню',
        x: 0.08,
        y: 0.58,
        w: 0.42,
        h: 0.06,
        fontSize: 28,
        fill: '#FF6B6B',
        align: 'center',
        radius: 999,
      }),
      make_layer({
        kind: 'qr',
        name: 'qr',
        text: 'https://yomoyo.su',
        x: 0.68,
        y: 0.78,
        w: 0.22,
        h: 0.16,
        color: '#FFFFFF',
      }),
    ],
  };
}

function flyer_doc(): studio_doc {
  return {
    formatId: 'flyer',
    bg: '#FFF7EC',
    bg2: '#FFF7EC',
    layers: [
      text_layer({
        name: 'лого',
        text: 'yomoyo',
        x: 0.08,
        y: 0.06,
        w: 0.7,
        h: 0.07,
        font: 'logo',
        weight: 600,
        fontSize: 56,
        color: '#FF6B6B',
      }),
      text_layer({
        name: 'заголовок',
        text: '6-й\nбесплатно',
        x: 0.08,
        y: 0.18,
        w: 0.84,
        h: 0.24,
        fontSize: 96,
        color: '#20181B',
      }),
      text_layer({
        name: 'условие',
        text: 'собери пять напитков в приложении',
        x: 0.08,
        y: 0.46,
        w: 0.84,
        h: 0.1,
        font: 'sans',
        fontSize: 28,
        color: '#20181B',
        weight: 700,
      }),
      text_layer({
        name: 'цена',
        text: 'сканируй',
        x: 0.08,
        y: 0.6,
        w: 0.4,
        h: 0.06,
        fontSize: 28,
        color: '#FFFFFF',
        fill: '#0039A6',
        align: 'center',
        radius: 999,
      }),
      make_layer({
        kind: 'qr',
        name: 'qr',
        text: 'https://yomoyo.su',
        x: 0.62,
        y: 0.72,
        w: 0.26,
        h: 0.18,
        color: '#20181B',
      }),
    ],
  };
}

function card_doc(): studio_doc {
  return {
    formatId: 'card',
    bg: '#FFFFFF',
    bg2: '#FFFFFF',
    layers: [
      make_layer({
        kind: 'shape',
        name: 'плашка',
        x: 0,
        y: 0,
        w: 1,
        h: 0.08,
        fill: '#FF6B6B',
      }),
      text_layer({
        name: 'бейдж',
        text: 'в меню',
        x: 0.08,
        y: 0.015,
        w: 0.4,
        h: 0.05,
        fontSize: 28,
        align: 'left',
      }),
      text_layer({
        name: 'название',
        text: 'таро',
        x: 0.08,
        y: 0.14,
        w: 0.84,
        h: 0.12,
        fontSize: 84,
        color: '#20181B',
      }),
      text_layer({
        name: 'состав',
        text: 'молоко, тапиока, таро',
        x: 0.08,
        y: 0.28,
        w: 0.84,
        h: 0.08,
        font: 'sans',
        fontSize: 28,
        color: '#8B8689',
        weight: 700,
      }),
      text_layer({
        name: 'цена',
        text: '360 ₽',
        x: 0.08,
        y: 0.38,
        w: 0.4,
        h: 0.08,
        fontSize: 48,
        color: '#FFFFFF',
        fill: '#0039A6',
        align: 'center',
        radius: 999,
      }),
      make_layer({
        kind: 'image',
        name: 'фото',
        src: TARO,
        x: 0.18,
        y: 0.52,
        w: 0.64,
        h: 0.4,
      }),
    ],
  };
}

function banner_doc(format_id: string): studio_doc {
  return {
    formatId: format_id,
    bg: '#FF6B6B',
    bg2: '#0039A6',
    layers: [
      text_layer({
        name: 'лого',
        text: 'yomoyo',
        x: 0.06,
        y: 0.06,
        w: 0.5,
        h: 0.08,
        font: 'logo',
        weight: 600,
        fontSize: 48,
      }),
      text_layer({
        name: 'заголовок',
        text: '−20%\nна бабл-ти',
        x: 0.06,
        y: 0.2,
        w: 0.88,
        h: 0.34,
        fontSize: 92,
      }),
      text_layer({
        name: 'условие',
        text: 'с блином',
        x: 0.06,
        y: 0.58,
        w: 0.5,
        h: 0.1,
        font: 'sans',
        fontSize: 32,
      }),
      make_layer({
        kind: 'qr',
        name: 'qr',
        text: 'https://yomoyo.su',
        x: 0.7,
        y: 0.7,
        w: 0.22,
        h: 0.18,
        color: '#FFFFFF',
      }),
    ],
  };
}

export function painted_layers(layers: studio_layer[], format: studio_format): painted_layer[] {
  const sorted = [...layers].sort((a, b) => a.z - b.z);
  if (!format.panels || !format.panel_w || format.gutter == null) {
    return sorted.map((layer) => ({ layer, key: layer.id, live: true }));
  }
  const panel = format.panel_w / format.w;
  const edge = format.gutter / format.w + panel;
  const out: painted_layer[] = [];
  for (const layer of sorted) {
    const center = layer.x + layer.w / 2;
    if (center >= edge) {
      out.push({ layer, key: layer.id, live: true });
      continue;
    }
    for (let i = 0; i < format.panels; i += 1) {
      out.push({
        layer: { ...layer, x: layer.x + i * panel },
        key: `${layer.id}:${i}`,
        live: i === 0,
      });
    }
  }
  return out;
}

export function snap_move(
  layer: studio_layer,
  others: studio_layer[],
  alt: boolean,
): { layer: studio_layer; v: number | null; h: number | null } {
  if (alt) return { layer, v: null, h: null };
  const xs = [0, 0.5, 1];
  const ys = [0, 0.5, 1];
  for (const other of others) {
    if (other.id === layer.id) continue;
    xs.push(other.x, other.x + other.w / 2, other.x + other.w);
    ys.push(other.y, other.y + other.h / 2, other.y + other.h);
  }
  const x = snap_axis(layer.x, layer.w, xs);
  const y = snap_axis(layer.y, layer.h, ys);
  return {
    layer: { ...layer, x: x.value, y: y.value },
    v: x.guide,
    h: y.guide,
  };
}

function snap_axis(pos: number, size: number, guides: number[]) {
  const threshold = 0.012;
  let best = { value: pos, guide: null as number | null, dist: threshold };
  const edges = [0, size / 2, size];
  for (const edge of edges) {
    for (const guide of guides) {
      const dist = Math.abs(pos + edge - guide);
      if (dist < best.dist) best = { value: guide - edge, guide, dist };
    }
  }
  return best;
}

export function load_doc(format_id: string): studio_doc {
  const format = format_by_id(format_id);
  if (typeof localStorage === 'undefined') return preset(format.id);
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return preset(format.id);
    const all = JSON.parse(raw) as Record<string, studio_doc>;
    const saved = all[storage_key(format.id)];
    if (!saved || !Array.isArray(saved.layers)) return preset(format.id);
    return {
      formatId: format.id,
      bg: typeof saved.bg === 'string' ? saved.bg : '#FFFFFF',
      bg2: typeof saved.bg2 === 'string' ? saved.bg2 : saved.bg,
      layers: saved.layers.filter((layer) => layer && typeof layer.id === 'string' && layer.kind),
    };
  } catch {
    return preset(format.id);
  }
}

export function save_doc(doc: studio_doc) {
  const raw = localStorage.getItem(STORE_KEY);
  const all = raw ? (JSON.parse(raw) as Record<string, studio_doc>) : {};
  all[storage_key(doc.formatId)] = doc;
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}
