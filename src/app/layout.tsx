import type { Metadata, Viewport } from 'next';
import { createElement } from 'react';
import { BRAND_COLOR_ACCENT, BRAND_NAME } from '@/lib/brand';
import { default_brand_fonts_stylesheet_href } from '@/lib/brand-font-catalog';
import { core_font_variable_classes } from '@/lib/brand-fonts-core';
import './globals.css';
import auth_bootstrap from '@/components/auth-bootstrap';
import brand_theme from '@/components/brand-theme';
import pwa_register from '@/components/pwa-register';
import app_splash from '@/components/app-splash';

export const metadata: Metadata = {
  title: `${BRAND_NAME} — bubble tea`,
  description: 'заказ к времени, баллы, сторис',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_COLOR_ACCENT,
  colorScheme: 'light',
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
  const default_fonts_href = default_brand_fonts_stylesheet_href();

  return (
    <html lang="ru" className={`${core_font_variable_classes} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {default_fonts_href ? (
          <link id="yoboba-brand-google-fonts" rel="stylesheet" href={default_fonts_href} />
        ) : null}
      </head>
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
        {createElement(app_splash)}
        {children}
      </body>
    </html>
  );
}
