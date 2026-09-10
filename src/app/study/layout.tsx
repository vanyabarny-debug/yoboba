import type { Metadata, Viewport } from 'next';
import { STUDY_ICON_192, STUDY_ICON_512, STUDY_NAME, STUDY_SHORT, STUDY_TAGLINE } from '@/lib/brand';

export const metadata: Metadata = {
  title: STUDY_NAME,
  description: STUDY_TAGLINE,
  applicationName: STUDY_SHORT,
  manifest: '/manifest-study.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: STUDY_SHORT,
  },
  icons: {
    icon: [
      { url: STUDY_ICON_192, sizes: '192x192', type: 'image/png' },
      { url: STUDY_ICON_512, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: STUDY_ICON_192, sizes: '192x192', type: 'image/png' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#FF6B6B',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function study_layout({ children }: { children: React.ReactNode }) {
  return <div className="study-app">{children}</div>;
}
