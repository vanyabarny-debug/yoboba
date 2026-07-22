/**
 * Иконки PWA yoSquad — тот же стиль, что у yomoyo:
 * Fredoka 600 + coral #FF6B6B на белом.
 * Запуск: node scripts/gen-yosquad-icons.mjs
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

const WORD = 'yoSquad';
const CORAL = '#FF6B6B';
const WHITE = '#FFFFFF';

/** @param {{size:number, pad:number, bg:string, fg:string}} o */
async function render({ size, pad, bg, fg }) {
  const available = size * (1 - pad * 2);
  // yoSquad чуть шире yomoyo — делим на ~4.1
  const font_size = Math.round(available / 4.1);
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
              letterSpacing: font_size * 0.02,
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
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

const targets = [
  { file: 'public/icons/yosquad-192.png', size: 192, pad: 0.06, bg: WHITE, fg: CORAL },
  { file: 'public/icons/yosquad-512.png', size: 512, pad: 0.06, bg: WHITE, fg: CORAL },
  { file: 'public/icons/yosquad-maskable-512.png', size: 512, pad: 0.12, bg: WHITE, fg: CORAL },
];

for (const t of targets) {
  const out = resolve(root, t.file);
  mkdirSync(dirname(out), { recursive: true });
  const png = await render(t);
  writeFileSync(out, png);
  console.log('wrote', t.file, `(${png.length} bytes)`);
}

// компактная mark для шапки админки (тот же вордмарк)
writeFileSync(
  resolve(root, 'public/icons/yosquad-mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${WHITE}"/>
  <text x="256" y="286" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif" font-weight="600" font-size="92" fill="${CORAL}" letter-spacing="2">yoSquad</text>
</svg>
`
);
console.log('wrote public/icons/yosquad-mark.svg');
