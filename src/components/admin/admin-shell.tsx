'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND_NAME } from '@/lib/brand';

const tabs = [
  { href: '/admin', label: 'аналитика', match: (p: string) => p === '/admin' },
  { href: '/admin/menu', label: 'редактирование', match: (p: string) => p === '/admin/menu' },
  {
    href: '/admin/personnel',
    label: 'персонал',
    match: (p: string) => p.startsWith('/admin/personnel') || p.startsWith('/admin/sellers'),
  },
  { href: '/admin/spots', label: 'точки', match: (p: string) => p.startsWith('/admin/spots') },
];

export default function admin_shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/admin';

  return (
    <div className="min-h-screen bg-[#f4f5f6]">
      <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h1 className="text-lg font-bold text-neutral-900">{title}</h1>
              {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
            </div>
            <Link href="/" className="text-xs text-neutral-400 hover:text-neutral-700">
              на сайт
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-0.5">
            {tabs.map((tab) => {
              const active = tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`shrink-0 rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      <p className="text-center text-[10px] text-neutral-300 pb-6">{BRAND_NAME} admin</p>
    </div>
  );
}
