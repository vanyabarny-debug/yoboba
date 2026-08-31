import type { CSSProperties } from 'react';

export type promo_image_vignette = {
  edge: 'top' | 'bottom';
  /** 0 = выкл, 1–100 сила затемнения */
  strength: number;
};

/** фирменный коралл для верхней виньетки */
export const PROMO_VIGNETTE_CORAL = '#ff6b6b';
export const PROMO_VIGNETTE_CORAL_DARK = '#e85555';
export const PROMO_STANDARD_VIGNETTE_STRENGTH = 30;

/** фоны промо: коралл и розовый */
export const PROMO_BG_CORAL = '#ff6b6b';
export const PROMO_BG_PINK = '#f9bac2';

export function default_promo_image_vignette(
  partial?: Partial<promo_image_vignette>
): promo_image_vignette {
  return {
    edge: 'top',
    strength: 0,
    ...partial,
  };
}

export function standard_promo_vignette(
  partial?: Partial<promo_image_vignette>
): promo_image_vignette {
  return default_promo_image_vignette({
    edge: 'top',
    strength: PROMO_STANDARD_VIGNETTE_STRENGTH,
    ...partial,
  });
}

export function resolve_promo_image_vignette(
  vignette?: promo_image_vignette | null
): promo_image_vignette | null {
  if (!vignette || vignette.strength <= 0) return null;
  return {
    edge: vignette.edge === 'top' ? 'top' : 'bottom',
    strength: clamp(vignette.strength, 1, 100),
  };
}

function coral_rgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function promo_image_vignette_style(vignette: promo_image_vignette): CSSProperties {
  const strength = clamp(vignette.strength, 1, 100);
  const alpha = (strength / 100) * 0.62;
  const height_pct = 16 + (strength / 100) * 44;
  const coral = coral_rgba(PROMO_VIGNETTE_CORAL, alpha);
  const coral_soft = coral_rgba(PROMO_VIGNETTE_CORAL, alpha * 0.38);
  const coral_deep = coral_rgba(PROMO_VIGNETTE_CORAL_DARK, alpha * 0.85);
  const gradient =
    vignette.edge === 'top'
      ? `linear-gradient(to bottom, ${coral_deep} 0%, ${coral} 42%, ${coral_soft} 68%, transparent 100%)`
      : `linear-gradient(to top, ${coral_deep} 0%, ${coral} 42%, ${coral_soft} 68%, transparent 100%)`;

  return {
    position: 'absolute',
    left: 0,
    right: 0,
    [vignette.edge]: 0,
    height: `${height_pct}%`,
    background: gradient,
    pointerEvents: 'none',
    zIndex: 2,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
