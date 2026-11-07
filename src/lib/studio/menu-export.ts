import {
  MENU_COL_GAP,
  MENU_PAD_L,
  MENU_PAD_R,
  MENU_PAD_T,
  MENU_QR,
  MENU_TOPPING,
  menu_big,
  type menu_card,
  type menu_group,
  type menu_paint,
} from '@/lib/studio/menu-layout';
import type { studio_format } from '@/lib/studio/model';

export async function download_menu_png(format: studio_format, paint: menu_paint) {
  await document.fonts.ready;
  const images = await load_images([...paint.left, ...paint.right]);
  const qr = paint.qr ? await load_image(paint.qr) : null;
  const canvas = document.createElement('canvas');
  canvas.width = format.w;
  canvas.height = format.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('холст недоступен');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, format.w, format.h);
  const inner = format.w - MENU_PAD_L - MENU_PAD_R - MENU_COL_GAP;
  const col_w = inner / 2;
  draw_column(ctx, paint.left, MENU_PAD_L, col_w, paint.k, images);
  draw_column(ctx, paint.right, MENU_PAD_L + col_w + MENU_COL_GAP, col_w, paint.k, images);
  draw_footer(ctx, format, qr);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('пустой png');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `yomoyo-${format.id}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function draw_column(
  ctx: CanvasRenderingContext2D,
  groups: menu_group[],
  x: number,
  width: number,
  k: number,
  images: Map<string, HTMLImageElement | null>,
) {
  let y = MENU_PAD_T;
  groups.forEach((group, index) => {
    if (index) y += px(32, k);
    y = draw_group(ctx, group, x, y, width, k, images);
  });
}

function draw_group(
  ctx: CanvasRenderingContext2D,
  group: menu_group,
  x: number,
  y: number,
  width: number,
  k: number,
  images: Map<string, HTMLImageElement | null>,
) {
  const big = menu_big(group);
  ctx.fillStyle = '#20181B';
  ctx.font = `700 ${px(Math.round(36 * 1.4), k)}px Nunito, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const title = group.title.toUpperCase();
  const title_lines = wrap(ctx, title, width);
  for (const line of title_lines) {
    ctx.fillText(line, x, y);
    y += px(Math.round(36 * 1.4), k) * 1.05;
  }
  y += px(big ? 28 : 20, k);
  group.items.forEach((item, index) => {
    if (index) y += px(big ? 36 : 40, k);
    y = draw_item(ctx, item, x, y, width, big, k, images.get(item.image) ?? null);
  });
  return y;
}

function draw_item(
  ctx: CanvasRenderingContext2D,
  item: menu_card,
  x: number,
  y: number,
  width: number,
  big: boolean,
  k: number,
  image: HTMLImageElement | null,
) {
  const photo = px(big ? 260 : 164, k);
  const gap = px(big ? 16 : 14, k);
  const row_gap = px(big ? 12 : 16, k);
  const name_size = px(big ? 52 : 36, k);
  const desc_size = px(big ? 24 : 18, k);
  const price_size = px(big ? 48 : 36, k);
  const weight_size = px(big ? 20 : 17, k);
  const text_x = big ? x : x + photo + row_gap;
  const text_w = big ? width : width - photo - row_gap;
  let text_y = big ? y + photo + row_gap : y;
  if (image) draw_contain(ctx, image, x, y, photo);

  if (item.limited) {
    const badge = 'LIMITED';
    ctx.font = `800 ${px(21, k)}px Nunito, sans-serif`;
    const bw = ctx.measureText(badge).width + 24;
    ctx.fillStyle = '#20181B';
    ctx.fillRect(text_x, text_y, bw, px(21, k) + 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badge, text_x + 12, text_y + 6);
    text_y += px(21, k) + 24;
  }

  const price_w = price_width(ctx, item, big, k);
  const name_w = Math.max(40, text_w - price_w - gap);
  ctx.fillStyle = '#20181B';
  ctx.font = `400 ${name_size}px Nunito, sans-serif`;
  const name_lines = wrap(ctx, item.name.toUpperCase(), name_w).slice(0, 3);
  name_lines.forEach((line, index) => {
    ctx.fillText(line, text_x, text_y + index * name_size * 1.08);
  });
  const name_h = Math.max(name_size, name_lines.length * name_size * 1.08);

  ctx.font = `500 ${price_size}px Nunito, sans-serif`;
  const price_x = text_x + text_w;
  ctx.textAlign = 'right';
  if (item.combo) {
    ctx.fillText(item.price, price_x, text_y);
    ctx.font = `400 ${weight_size}px Nunito, sans-serif`;
    ctx.globalAlpha = 0.55;
    ctx.fillText(item.weight, price_x, text_y + price_size + 2);
    ctx.globalAlpha = 1;
  } else {
    let py = text_y;
    for (const line of volume_lines(item)) {
      ctx.font = `500 ${price_size}px Nunito, sans-serif`;
      ctx.globalAlpha = 1;
      ctx.fillText(line.price, price_x, py);
      ctx.font = `400 ${weight_size}px Nunito, sans-serif`;
      ctx.globalAlpha = 0.5;
      ctx.fillText(line.weight, price_x, py + price_size + 2);
      py += price_size + weight_size + px(8, k);
    }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';

  let bottom = text_y + name_h;
  if (item.desc) {
    ctx.fillStyle = '#20181B';
    ctx.globalAlpha = 0.6;
    ctx.font = `400 ${desc_size}px Nunito, sans-serif`;
    const desc_lines = wrap(ctx, item.desc, name_w).slice(0, 2);
    desc_lines.forEach((line, index) => {
      ctx.fillText(line, text_x, text_y + name_h + 6 + index * desc_size * 1.25);
    });
    ctx.globalAlpha = 1;
    bottom = text_y + name_h + 6 + desc_lines.length * desc_size * 1.25;
  }
  const prices_h = item.combo ? price_size + weight_size : volume_lines(item).length * (price_size + weight_size + px(8, k));
  const block = Math.max(photo, bottom - (big ? y + photo + row_gap : y), prices_h);
  return (big ? y + photo + row_gap : y) + block;
}

function volume_lines(item: menu_card) {
  const lines = [{ price: item.price, weight: item.weight }];
  if (item.price2) lines.push({ price: item.price2, weight: item.weight2 || '650 мл' });
  return lines;
}

function price_width(ctx: CanvasRenderingContext2D, item: menu_card, big: boolean, k: number) {
  const price_size = px(big ? 48 : 36, k);
  ctx.font = `500 ${price_size}px Nunito, sans-serif`;
  return Math.max(...volume_lines(item).map((line) => ctx.measureText(line.price).width), ctx.measureText(item.weight).width) + 8;
}

function draw_footer(ctx: CanvasRenderingContext2D, format: studio_format, qr: HTMLImageElement | null) {
  const y = format.h - 28 - MENU_QR;
  ctx.fillStyle = '#20181B';
  ctx.font = '500 22px Nunito, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(MENU_TOPPING, MENU_PAD_L, format.h - 36);
  ctx.fillStyle = '#8B8689';
  ctx.font = '400 13px Nunito, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('yomoyo.su', format.w - MENU_PAD_R - MENU_QR - 12, format.h - 40);
  if (qr) ctx.drawImage(qr, format.w - MENU_PAD_R - MENU_QR, y, MENU_QR, MENU_QR);
}

function draw_contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number) {
  const scale = Math.min(size / image.width, size / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function px(base: number, k: number) {
  return Math.round(base * k);
}

function load_images(groups: menu_group[]) {
  const srcs = [...new Set(groups.flatMap((group) => group.items.map((item) => item.image).filter(Boolean)))];
  return Promise.all(srcs.map(async (src) => [src, await load_image(src)] as const)).then((pairs) => new Map(pairs));
}

function load_image(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
