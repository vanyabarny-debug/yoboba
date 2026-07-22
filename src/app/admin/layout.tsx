import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'yomoyo admin',
  description: 'админка и аналитика',
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'admin',
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
