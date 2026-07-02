import type { Metadata, Viewport } from 'next';
import { createElement } from 'react';
import { Inter, JetBrains_Mono, Montserrat_Alternates } from 'next/font/google';
import { BRAND_COLOR_BLUE, BRAND_NAME } from '@/lib/brand';
import './globals.css';
import auth_bootstrap from '@/components/auth-bootstrap';
import brand_theme from '@/components/brand-theme';
import pwa_register from '@/components/pwa-register';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
});

const jetbrains_mono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
});

const montserrat_alternates = Montserrat_Alternates({
  variable: '--font-montserrat-alt',
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — кофейный киоск`,
  description: 'заказ к времени, баллы, сторис',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_COLOR_BLUE,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function root_layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${jetbrains_mono.variable} ${montserrat_alternates.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-page text-foreground font-sans">
        {process.env.NODE_ENV === 'development' ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})})}`,
            }}
          />
        ) : null}
        {createElement(pwa_register)}
        {createElement(brand_theme)}
        {createElement(auth_bootstrap)}
        {children}
      </body>
    </html>
  );
}
