/** единый формат картинок акций: как у «дружбы» */
export const PROMO_IMAGE_WIDTH = 1024;
export const PROMO_IMAGE_HEIGHT = 1536;
/** CSS aspect-ratio */
export const PROMO_ASPECT_RATIO = '2 / 3';
/** Tailwind class */
export const PROMO_ASPECT_CLASS = 'aspect-[2/3]';

/** ширина карточки в полоске */
export const PROMO_CARD_W_MOBILE = 152;
export const PROMO_CARD_W_DESKTOP = 180;

/**
 * Картинка — только визуал на весь кадр 2:3.
 * Заголовок можно наложить белым текстом; кнопка в сторис — отдельным блоком под фото.
 */
export const PROMO_SIZE_HINT =
  `${PROMO_IMAGE_WIDTH}×${PROMO_IMAGE_HEIGHT} px · 2:3 · как акция «дружба»`;
