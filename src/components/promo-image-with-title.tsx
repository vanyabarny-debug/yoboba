'use client';

import { createElement } from 'react';
import type { promo_banner } from '@/lib/types';
import { resolve_promo_title_layout } from '@/lib/promo-title-layout';
import promo_title_on_image from '@/components/promo-title-on-image';
import promo_image_vignette_layer from '@/components/promo-image-vignette';
import type { promo_title_layout } from '@/lib/promo-title-layout';
import type { promo_image_vignette } from '@/lib/promo-image-vignette';

type props = {
  promo: promo_banner;
  className?: string;
  interactive?: boolean;
  on_layout_change?: (layout: promo_title_layout) => void;
};

/** картинка акции на весь кадр + опциональный заголовок (без правки файлов) */
export default function promo_image_with_title({
  promo,
  className = '',
  interactive = false,
  on_layout_change,
}: props) {
  const layout = resolve_promo_title_layout(promo.title_layout);

  return (
    <div className={`relative size-full overflow-hidden bg-neutral-950 ${className}`}>
      <img
        src={promo.image_url}
        alt=""
        className="absolute inset-0 size-full object-cover object-center select-none"
        draggable={false}
      />
      {createElement(promo_image_vignette_layer, { vignette: promo.image_vignette })}
      {!promo.title_in_image &&
        createElement(promo_title_on_image, {
          title: promo.title,
          layout,
          interactive,
          on_layout_change,
        })}
    </div>
  );
}
