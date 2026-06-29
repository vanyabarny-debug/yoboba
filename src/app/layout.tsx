import type { Metadata, Viewport } from 'next';
import { createElement } from 'react';
import { Inter, JetBrains_Mono, Montserrat_Alternates } from 'next/font/google';
import './globals.css';
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
  title: 'yoboba — кофейный киоск',
  description: 'заказ к времени, баллы, сторис',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'yoboba',
  },
};

export const viewport: Viewport = {
  themeColor: '#ff3d6e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
        {children}
      </body>
    </html>
  );
}
