import type { CSSProperties } from 'react';

/** якорь текста относительно точки x/y на кадре */
export type promo_title_anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type promo_title_layout = {
  /** точка привязки, % от кадра */
  x_pct: number;
  y_pct: number;
  anchor: promo_title_anchor;
  /** px при ширине карточки 180 */
  font_size: number;
  font_weight: 600 | 700 | 800 | 900;
  text_align: 'left' | 'center' | 'right';
  /** hex #rrggbb */
  color?: string;
  /** чёрная обводка букв */
  stroke?: boolean;
  /** мягкая тень для читаемости */
  shadow?: boolean;
};

export const PROMO_TITLE_REF_WIDTH = 180;
export const PROMO_TITLE_EDGE_INSET = 6;

export const PROMO_TITLE_COLOR_PRESETS = [
  '#ffffff',
  '#000000',
  '#ff6b6b',
  '#171717',
  '#fbbf24',
  '#38bdf8',
  '#a855f7',
  '#22c55e',
] as const;

const DEFAULT_TITLE_COLOR = '#ffffff';

const ANCHOR_TRANSFORM: Record<promo_title_anchor, string> = {
  'top-left': 'translate(0, 0)',
  'top-center': 'translate(-50%, 0)',
  'top-right': 'translate(-100%, 0)',
  'center-left': 'translate(0, -50%)',
  center: 'translate(-50%, -50%)',
  'center-right': 'translate(-100%, -50%)',
  'bottom-left': 'translate(0, -100%)',
  'bottom-center': 'translate(-50%, -100%)',
  'bottom-right': 'translate(-100%, -100%)',
};

export const PROMO_TITLE_SNAP_POINTS: {
  id: promo_title_anchor;
  label: string;
  layout: promo_title_layout;
}[] = [
  {
    id: 'top-left',
    label: '↖',
    layout: {
      x_pct: PROMO_TITLE_EDGE_INSET,
      y_pct: PROMO_TITLE_EDGE_INSET,
      anchor: 'top-left',
      font_size: 16,
      font_weight: 800,
      text_align: 'left',
    },
  },
  {
    id: 'top-center',
    label: '↑',
    layout: {
      x_pct: 50,
      y_pct: PROMO_TITLE_EDGE_INSET,
      anchor: 'top-center',
      font_size: 16,
      font_weight: 800,
      text_align: 'center',
    },
  },
  {
    id: 'top-right',
    label: '↗',
    layout: {
      x_pct: 100 - PROMO_TITLE_EDGE_INSET,
      y_pct: PROMO_TITLE_EDGE_INSET,
      anchor: 'top-right',
      font_size: 16,
      font_weight: 800,
      text_align: 'right',
    },
  },
  {
    id: 'center-left',
    label: '←',
    layout: {
      x_pct: PROMO_TITLE_EDGE_INSET,
      y_pct: 50,
      anchor: 'center-left',
      font_size: 16,
      font_weight: 800,
      text_align: 'left',
    },
  },
  {
    id: 'center',
    label: '●',
    layout: {
      x_pct: 50,
      y_pct: 50,
      anchor: 'center',
      font_size: 16,
      font_weight: 800,
      text_align: 'center',
    },
  },
  {
    id: 'center-right',
    label: '→',
    layout: {
      x_pct: 100 - PROMO_TITLE_EDGE_INSET,
      y_pct: 50,
      anchor: 'center-right',
      font_size: 16,
      font_weight: 800,
      text_align: 'right',
    },
  },
  {
    id: 'bottom-left',
    label: '↙',
    layout: {
      x_pct: PROMO_TITLE_EDGE_INSET,
      y_pct: 100 - PROMO_TITLE_EDGE_INSET,
      anchor: 'bottom-left',
      font_size: 16,
      font_weight: 800,
      text_align: 'left',
    },
  },
  {
    id: 'bottom-center',
    label: '↓',
    layout: {
      x_pct: 50,
      y_pct: 100 - PROMO_TITLE_EDGE_INSET,
      anchor: 'bottom-center',
      font_size: 16,
      font_weight: 800,
      text_align: 'center',
    },
  },
  {
    id: 'bottom-right',
    label: '↘',
    layout: {
      x_pct: 100 - PROMO_TITLE_EDGE_INSET,
      y_pct: 100 - PROMO_TITLE_EDGE_INSET,
      anchor: 'bottom-right',
      font_size: 16,
      font_weight: 800,
      text_align: 'right',
    },
  },
];

export function default_promo_title_layout(
  partial?: Partial<promo_title_layout>
): promo_title_layout {
  return {
    x_pct: PROMO_TITLE_EDGE_INSET,
    y_pct: PROMO_TITLE_EDGE_INSET,
    anchor: 'top-left',
    font_size: 16,
    font_weight: 800,
    text_align: 'left',
    color: DEFAULT_TITLE_COLOR,
    stroke: false,
    shadow: true,
    ...partial,
  };
}

/** стандарт промо: сверху слева, белый текст */
export function standard_promo_title_layout(
  partial?: Partial<promo_title_layout>
): promo_title_layout {
  return default_promo_title_layout({
    font_size: 17,
    font_weight: 800,
    color: '#ffffff',
    shadow: true,
    stroke: false,
    ...partial,
  });
}

export function resolve_promo_title_layout(
  layout?: promo_title_layout | null
): promo_title_layout {
  if (!layout) return default_promo_title_layout();
  return {
    ...default_promo_title_layout(),
    ...layout,
    x_pct: clamp_pct(layout.x_pct),
    y_pct: clamp_pct(layout.y_pct),
    font_size: clamp(layout.font_size, 10, 52),
    color: normalize_promo_title_color(layout.color),
    stroke: layout.stroke === true,
    shadow: layout.shadow !== false,
  };
}

export function merge_snap_layout(
  current: promo_title_layout,
  snap: promo_title_layout
): promo_title_layout {
  return {
    ...current,
    x_pct: snap.x_pct,
    y_pct: snap.y_pct,
    anchor: snap.anchor,
    text_align: snap.text_align,
  };
}

export function promo_title_scale(container_width: number) {
  if (!container_width || !Number.isFinite(container_width)) return 1;
  return container_width / PROMO_TITLE_REF_WIDTH;
}

export function promo_title_style(
  layout: promo_title_layout,
  scale = 1
): CSSProperties {
  const resolved = resolve_promo_title_layout(layout);
  return {
    position: 'absolute',
    left: `${resolved.x_pct}%`,
    top: `${resolved.y_pct}%`,
    transform: ANCHOR_TRANSFORM[resolved.anchor],
    fontSize: `${resolved.font_size * scale}px`,
    fontWeight: resolved.font_weight,
    textAlign: resolved.text_align,
    maxWidth: `${100 - PROMO_TITLE_EDGE_INSET * 2}%`,
    width: resolved.text_align === 'center' ? `${100 - PROMO_TITLE_EDGE_INSET * 2}%` : 'max-content',
    lineHeight: 1.12,
    whiteSpace: 'pre-line',
    color: resolved.color,
    ...promo_title_text_effects(resolved, scale),
  };
}

/** мягкая виньетка под текстом — без жёсткого контура букв */
function promo_vignette_text_shadow(font_size: number, scale: number): string {
  const s = font_size * scale;
  const near = Math.max(8, s * 0.42);
  const far = Math.max(18, s * 1.05);
  return `0 ${Math.max(3, s * 0.14)}px ${near}px rgba(0,0,0,0.2), 0 ${Math.max(8, s * 0.32)}px ${far}px rgba(0,0,0,0.12)`;
}

/** обводка и тень поверх цвета текста */
export function promo_title_text_effects(
  layout: promo_title_layout,
  scale = 1
): Pick<CSSProperties, 'textShadow' | 'WebkitTextStroke' | 'paintOrder'> {
  const resolved = resolve_promo_title_layout(layout);
  const stroke_px = Math.max(0.4, resolved.font_size * scale * 0.045);
  const effects: Pick<CSSProperties, 'textShadow' | 'WebkitTextStroke' | 'paintOrder'> = {};

  if (resolved.stroke) {
    effects.WebkitTextStroke = `${stroke_px}px rgba(0,0,0,0.5)`;
    effects.paintOrder = 'stroke fill';
  }

  if (resolved.shadow) {
    effects.textShadow = promo_vignette_text_shadow(resolved.font_size, scale);
  } else {
    effects.textShadow = 'none';
  }

  return effects;
}

export function normalize_promo_title_color(raw?: string | null): string {
  if (!raw) return DEFAULT_TITLE_COLOR;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const h = trimmed.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return DEFAULT_TITLE_COLOR;
}

const SNAP_AXES = [PROMO_TITLE_EDGE_INSET, 50, 100 - PROMO_TITLE_EDGE_INSET] as const;
const SNAP_THRESHOLD = 5;

/** магнит к осям и углам при отпускании перетаскивания */
export function magnet_promo_title_layout(
  layout: promo_title_layout,
  threshold = SNAP_THRESHOLD
): promo_title_layout {
  let { x_pct, y_pct } = layout;

  for (const axis of SNAP_AXES) {
    if (Math.abs(x_pct - axis) <= threshold) x_pct = axis;
    if (Math.abs(y_pct - axis) <= threshold) y_pct = axis;
  }

  x_pct = clamp_pct(x_pct);
  y_pct = clamp_pct(y_pct);

  const anchor = infer_anchor(x_pct, y_pct);

  return {
    ...layout,
    x_pct,
    y_pct,
    anchor,
    text_align: text_align_for_anchor(anchor),
  };
}

function text_align_for_anchor(anchor: promo_title_anchor): promo_title_layout['text_align'] {
  if (anchor.endsWith('right')) return 'right';
  if (anchor.endsWith('left')) return 'left';
  return 'center';
}

function infer_anchor(x: number, y: number): promo_title_anchor {
  const h = x < 33 ? 'left' : x > 66 ? 'right' : 'center';
  const v = y < 33 ? 'top' : y > 66 ? 'bottom' : 'center';
  if (v === 'center' && h === 'center') return 'center';
  if (v === 'top' && h === 'left') return 'top-left';
  if (v === 'top' && h === 'center') return 'top-center';
  if (v === 'top' && h === 'right') return 'top-right';
  if (v === 'center' && h === 'left') return 'center-left';
  if (v === 'center' && h === 'right') return 'center-right';
  if (v === 'bottom' && h === 'left') return 'bottom-left';
  if (v === 'bottom' && h === 'center') return 'bottom-center';
  return 'bottom-right';
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function clamp_pct(n: number) {
  return clamp(n, PROMO_TITLE_EDGE_INSET, 100 - PROMO_TITLE_EDGE_INSET);
}
