import {
  MENU_ACCENT,
  MENU_BLOCK_GAP,
  MENU_CARD,
  MENU_COL_GAP,
  MENU_EXTRA,
  MENU_INK,
  MENU_LOGO,
  MENU_MUTED,
  MENU_NOTE,
  MENU_PAD_L,
  MENU_PAD_R,
  MENU_PAD_T,
  MENU_SUGAR,
  menu_big,
  sugar_key,
  type menu_block,
  type menu_card,
  type menu_group,
  type menu_paint,
  type menu_texts,
} from '@/lib/studio/menu-layout';
import type { studio_format } from '@/lib/studio/model';

export async function download_menu_png(format: studio_format, paint: menu_paint) {
  await document.fonts.load(`600 ${MENU_LOGO.size}px Fredoka`).catch(() => undefined);
  await document.fonts.ready;
  const blocks = [...paint.left, ...paint.right];
  const images = await load_images(blocks.flatMap((block) => (block.kind === 'group' ? [block.group] : [])));
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
  const paint_with = { k: paint.k, images, qr, texts: paint.texts };
  draw_column(ctx, paint.left, MENU_PAD_L, col_w, paint_with);
  draw_column(ctx, paint.right, MENU_PAD_L + col_w + MENU_COL_GAP, col_w, paint_with);
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

type paint_ctx = {
  k: number;
  images: Map<string, HTMLImageElement | null>;
  qr: HTMLImageElement | null;
  texts: menu_texts;
};

function draw_column(ctx: CanvasRenderingContext2D, blocks: menu_block[], x: number, width: number, p: paint_ctx) {
  const { k, images, qr, texts } = p;
  let y = MENU_PAD_T;
  blocks.forEach((block, index) => {
    if (index) y += MENU_BLOCK_GAP * k;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    if (block.kind === 'group') y = draw_group(ctx, block.group, x, y, width, k, images);
    else if (block.kind === 'logo') y = draw_logo(ctx, x, y, k, texts);
    else if (block.kind === 'sugar') y = draw_sugar(ctx, x, y, width, k, texts);
    else if (block.kind === 'extra') y = draw_extra(ctx, x, y, width, k, texts);
    else y = draw_note(ctx, x, y, width, k, qr, texts);
  });
}

function draw_logo(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, texts: menu_texts) {
  const h = MENU_LOGO.h * k;
  ctx.fillStyle = MENU_ACCENT;
  ctx.font = `600 ${MENU_LOGO.size * k}px Fredoka, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(texts.logo, x, y + h / 2);
  ctx.textBaseline = 'top';
  return y + h;
}

function draw_sugar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, k: number, texts: menu_texts) {
  const h = MENU_SUGAR.h * k;
  const border = MENU_CARD.border * k;
  const pad = MENU_CARD.pad * k + border;
  const dot = MENU_SUGAR.dot * k;
  const label = MENU_SUGAR.label * k;
  const extra = MENU_SUGAR.extra * k;
  plate(ctx, x, y, width, h, k);
  ctx.fillStyle = MENU_INK;
  ctx.font = `800 ${MENU_CARD.title * k}px Nunito, sans-serif`;
  ctx.fillText(texts.sugar_title.toUpperCase(), x + pad, y + pad);

  const levels = MENU_SUGAR.levels;
  const top = levels[levels.length - 1];
  const dot_y = y + h - pad - (dot + 10 * k + label + 6 * k + extra);
  const label_y = dot_y + dot + 10 * k;
  const slot = (width - pad * 2) / levels.length;
  levels.forEach((level, index) => {
    const cx = x + pad + slot * (index + 0.5);
    const r = dot / 2;
    const cy = dot_y + r;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const fill = (dot * Math.min(level, 100)) / 100;
    ctx.fillStyle = MENU_INK;
    ctx.fillRect(cx - r, dot_y + dot - fill, dot, fill);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r - border / 2, 0, Math.PI * 2);
    ctx.lineWidth = border;
    ctx.strokeStyle = MENU_INK;
    ctx.stroke();
    ctx.textAlign = 'center';
    if (level > 100) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 ${34 * k}px Nunito, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('+', cx, cy);
      ctx.textBaseline = 'top';
    }
    ctx.fillStyle = MENU_INK;
    ctx.font = `600 ${label}px Nunito, sans-serif`;
    ctx.fillText(texts[sugar_key(level)], cx, label_y);
    if (level === top) {
      ctx.fillStyle = MENU_ACCENT;
      ctx.font = `700 ${extra}px Nunito, sans-serif`;
      ctx.fillText(texts.sugar_150_price, cx, label_y + label + 6 * k);
    }
    ctx.textAlign = 'left';
  });
  return y + h;
}

function draw_extra(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, k: number, texts: menu_texts) {
  const h = MENU_EXTRA.h * k;
  const pad = (MENU_CARD.pad + MENU_CARD.border) * k;
  const note = MENU_EXTRA.note_size * k;
  plate(ctx, x, y, width, h, k);
  ctx.fillStyle = MENU_INK;
  ctx.font = `800 ${MENU_CARD.title * k}px Nunito, sans-serif`;
  ctx.fillText(texts.extra_title.toUpperCase(), x + pad, y + pad);
  ctx.fillStyle = MENU_MUTED;
  ctx.font = `400 ${note}px Nunito, sans-serif`;
  ctx.fillText(texts.extra_note, x + pad, y + h - pad - note);
  ctx.fillStyle = MENU_INK;
  ctx.font = `500 ${MENU_EXTRA.price_size * k}px Nunito, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(texts.extra_price, x + width - pad, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return y + h;
}

function draw_note(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  k: number,
  qr: HTMLImageElement | null,
  texts: menu_texts,
) {
  const h = MENU_NOTE.h * k;
  const size = MENU_NOTE.qr * k;
  if (qr) ctx.drawImage(qr, x + width - size, y + (h - size) / 2, size, size);
  const title = MENU_NOTE.title_size * k;
  const body = MENU_NOTE.body_size * k;
  const site = MENU_NOTE.site_size * k;
  const gap = 7 * k;
  let ty = y + (h - (title + body + site + gap * 2)) / 2;
  ctx.fillStyle = MENU_INK;
  ctx.font = `700 ${title}px Nunito, sans-serif`;
  ctx.fillText(texts.note_title, x, ty);
  ty += title + gap;
  ctx.fillStyle = MENU_MUTED;
  ctx.font = `400 ${body}px Nunito, sans-serif`;
  ctx.fillText(texts.note_body, x, ty);
  ty += body + gap;
  ctx.font = `400 ${site}px Nunito, sans-serif`;
  ctx.fillText(texts.note_site, x, ty);
  return y + h;
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  const border = MENU_CARD.border * k;
  ctx.beginPath();
  ctx.roundRect(x + border / 2, y + border / 2, w - border, h - border, MENU_CARD.radius * k - border / 2);
  ctx.lineWidth = border;
  ctx.strokeStyle = MENU_INK;
  ctx.stroke();
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
