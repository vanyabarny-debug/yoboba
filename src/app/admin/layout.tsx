import type { Metadata, Viewport } from 'next';
import { SQUAD_NAME, SQUAD_SHORT, SQUAD_TAGLINE } from '@/lib/brand';

export const metadata: Metadata = {
  title: SQUAD_NAME,
  description: SQUAD_TAGLINE,
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: SQUAD_SHORT,
  },
  icons: {
    icon: [
      { url: '/icons/yosquad-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/yosquad-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/yosquad-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#111111',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function admin_layout({ children }: { children: React.ReactNode }) {
  return children;
}
