import QRCode from 'qrcode';
import {
  canvas_font,
  painted_layers,
  px,
  type studio_doc,
  type studio_format,
  type studio_layer,
} from '@/lib/studio/model';

export async function file_to_image(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return read_file(file);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL('image/jpeg', 0.84);
  } catch {
    return read_file(file);
  }
}

function read_file(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('файл не прочитался'));
    reader.readAsDataURL(file);
  });
}

export async function download_png(doc: studio_doc, format: studio_format) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = format.w;
  canvas.height = format.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('холст недоступен');
  paint_background(ctx, doc, format);
  const items = painted_layers(doc.layers, format);
  for (const item of items) {
    await paint_layer(ctx, item.layer, format);
  }
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

function paint_background(ctx: CanvasRenderingContext2D, doc: studio_doc, format: studio_format) {
  if (doc.bg2 && doc.bg2.toLowerCase() !== doc.bg.toLowerCase()) {
    const gradient = ctx.createLinearGradient(0, 0, 0, format.h);
    gradient.addColorStop(0, doc.bg);
    gradient.addColorStop(1, doc.bg2);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = doc.bg || '#FFFFFF';
  }
  ctx.fillRect(0, 0, format.w, format.h);
}

async function paint_layer(ctx: CanvasRenderingContext2D, layer: studio_layer, format: studio_format) {
  const box = {
    x: layer.x * format.w,
    y: layer.y * format.h,
    w: layer.w * format.w,
    h: layer.h * format.h,
  };
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(-box.w / 2, -box.h / 2);
  if (layer.kind === 'shape') {
    ctx.fillStyle = layer.fill || '#FF6B6B';
    round(ctx, 0, 0, box.w, box.h, px(layer.radius, format.w));
  } else if (layer.kind === 'image' && layer.src) {
    const img = await load_image(layer.src);
    draw_contain(ctx, img, box.w, box.h);
  } else if (layer.kind === 'qr') {
    const url = await QRCode.toDataURL(layer.text || 'https://yomoyo.su', {
      margin: 0,
      width: 512,
      color: { dark: layer.color || '#20181B', light: '#00000000' },
    });
    const img = await load_image(url);
    ctx.drawImage(img, 0, 0, box.w, box.h);
  } else if (layer.kind === 'text') {
    paint_text(ctx, layer, box.w, box.h, format.w);
  }
  ctx.restore();
}

function paint_text(
  ctx: CanvasRenderingContext2D,
  layer: studio_layer,
  width: number,
  height: number,
  format_w: number,
) {
  if (layer.fill) {
    ctx.fillStyle = layer.fill;
    round(ctx, 0, 0, width, height, px(layer.radius, format_w));
  }
  const size = Math.max(8, px(layer.fontSize, format_w));
  ctx.font = `${layer.weight} ${size}px ${canvas_font(layer.font)}`;
  ctx.fillStyle = layer.color || '#20181B';
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, layer.text || '', Math.max(8, width - 8));
  const line_h = size * 1.05;
  const block = lines.length * line_h;
  let y = Math.max(0, (height - block) / 2);
  const align = layer.align;
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const x = align === 'center' ? width / 2 : align === 'right' ? width - 4 : 4;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += line_h;
  }
  if (layer.strike && lines.length) {
    ctx.fillRect(4, (height - Math.max(2, size / 14)) / 2, width - 8, Math.max(2, size / 14));
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max_w: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > max_w) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

function draw_contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function load_image(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('картинка не загрузилась'));
    img.src = src;
  });
}
