import localFont from 'next/font/local';

/** только базовые шрифты через next/font — остальные грузятся по выбору с Google CDN.
 * Inter лежит в репозитории: сборка на сервере не должна зависеть от доступа к Google Fonts */
export const inter = localFont({
  src: '../assets/fonts/inter/InterVariable.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

export const soyuz_grotesk = localFont({
  src: '../assets/fonts/SoyuzGroteskBold.ttf',
  variable: '--font-soyuz-grotesk',
  weight: '700',
  display: 'swap',
});

export const core_font_variable_classes = `${inter.variable} ${soyuz_grotesk.variable}`;
