'use client';

import {
  promo_image_vignette_style,
  resolve_promo_image_vignette,
  type promo_image_vignette,
} from '@/lib/promo-image-vignette';

export default function promo_image_vignette_layer({
  vignette,
}: {
  vignette?: promo_image_vignette | null;
}) {
  const resolved = resolve_promo_image_vignette(vignette);
  if (!resolved) return null;
  return <div aria-hidden style={promo_image_vignette_style(resolved)} />;
}
