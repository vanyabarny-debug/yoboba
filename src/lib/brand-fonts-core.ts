import localFont from 'next/font/local';
import { Inter } from 'next/font/google';

/** только базовые шрифты через next/font — остальные грузятся по выбору с Google CDN */
export const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
});

export const soyuz_grotesk = localFont({
  src: '../assets/fonts/SoyuzGroteskBold.ttf',
  variable: '--font-soyuz-grotesk',
  weight: '700',
  display: 'swap',
});

export const core_font_variable_classes = `${inter.variable} ${soyuz_grotesk.variable}`;
