/**
 * Генерация иконок PWA/favicon из фирменного вордмарка «yomoyo».
 * Шрифт — Fredoka 600 (как логотип на сайте): коралловый фон, белый текст.
 * Запуск: node scripts/gen-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const font_data = readFileSync(
  resolve(root, 'node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff')
);

const WORD = 'yomoyo';
const CORAL = '#FF6B6B';
const WHITE = '#FFFFFF';

/** @param {{size:number, pad:number, bg:string, fg:string}} o */
async function render({ size, pad, bg, fg }) {
  const available = size * (1 - pad * 2);
  // ~3.6em суммарная ширина слова «yomoyo» в Fredoka 600 с трекингом
  const font_size = Math.round(available / 3.6);
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bg,
        },
        children: {
          type: 'div',
          props: {
            style: {
              fontFamily: 'Fredoka',
              fontWeight: 600,
              fontSize: font_size,
              color: fg,
              letterSpacing: font_size * 0.04,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            },
            children: WORD,
          },
        },
      },
    },
    {
      width: size,
      height: size,
      fonts: [{ name: 'Fredoka', data: font_data, weight: 600, style: 'normal' }],
    }
  );
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    .render()
    .asPng();
  return png;
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, pad: 0.06, bg: CORAL, fg: WHITE },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0.06, bg: CORAL, fg: WHITE },
  // maskable: контент в центральной safe-zone (~80% ширины)
  { file: 'public/icons/icon-maskable-512.png', size: 512, pad: 0.12, bg: CORAL, fg: WHITE },
  { file: 'src/app/icon.png', size: 512, pad: 0.06, bg: CORAL, fg: WHITE },
  { file: 'src/app/apple-icon.png', size: 180, pad: 0.07, bg: CORAL, fg: WHITE },
];

for (const t of targets) {
  const out = resolve(root, t.file);
  mkdirSync(dirname(out), { recursive: true });
  const png = await render(t);
  writeFileSync(out, png);
  console.log('wrote', t.file, `(${png.length} bytes)`);
}
