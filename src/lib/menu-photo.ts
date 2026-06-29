/** единый формат фото товара: квадрат 1:1 */
export const MENU_PHOTO_SIZE = 800;
export const MENU_PHOTO_ASPECT = 1;
export const MENU_PHOTO_JPEG_QUALITY = 0.88;

export type menu_photo_crop = {
  scale: number;
  pan_x: number;
  pan_y: number;
};

export const default_menu_photo_crop: menu_photo_crop = {
  scale: 1,
  pan_x: 0,
  pan_y: 0,
};

export function is_custom_menu_photo(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  );
}

export function load_image_from_file(file: File, max_size_mb = 12): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('нужен файл изображения'));
      return;
    }
    if (file.size > max_size_mb * 1024 * 1024) {
      reject(new Error(`файл больше ${max_size_mb} мб`));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('не удалось открыть изображение'));
    };
    img.src = url;
  });
}

export function load_image_from_src(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('не удалось загрузить изображение'));
    img.src = src;
  });
}

/** экспорт видимой области квадратного вьюпорта в jpeg data url */
export function export_menu_photo_crop(
  img: HTMLImageElement,
  viewport_px: number,
  crop: menu_photo_crop
): string {
  const canvas = document.createElement('canvas');
  canvas.width = MENU_PHOTO_SIZE;
  canvas.height = MENU_PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas недоступен');

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cover_scale = Math.max(viewport_px / iw, viewport_px / ih) * crop.scale;
  const draw_w = iw * cover_scale;
  const draw_h = ih * cover_scale;
  const draw_x = (viewport_px - draw_w) / 2 + crop.pan_x;
  const draw_y = (viewport_px - draw_h) / 2 + crop.pan_y;

  const sx = Math.max(0, (0 - draw_x) / cover_scale);
  const sy = Math.max(0, (0 - draw_y) / cover_scale);
  const sw = Math.min(iw - sx, viewport_px / cover_scale);
  const sh = Math.min(ih - sy, viewport_px / cover_scale);

  ctx.fillStyle = '#f1f1f3';
  ctx.fillRect(0, 0, MENU_PHOTO_SIZE, MENU_PHOTO_SIZE);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, MENU_PHOTO_SIZE, MENU_PHOTO_SIZE);

  return canvas.toDataURL('image/jpeg', MENU_PHOTO_JPEG_QUALITY);
}

export function get_menu_photo_layout(
  img: HTMLImageElement,
  viewport_px: number,
  crop: menu_photo_crop
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cover_scale = Math.max(viewport_px / iw, viewport_px / ih) * crop.scale;
  const draw_w = iw * cover_scale;
  const draw_h = ih * cover_scale;
  const draw_x = (viewport_px - draw_w) / 2 + crop.pan_x;
  const draw_y = (viewport_px - draw_h) / 2 + crop.pan_y;
  return { draw_x, draw_y, draw_w, draw_h };
}
