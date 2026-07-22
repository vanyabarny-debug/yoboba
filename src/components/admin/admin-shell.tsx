'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clear_session } from '@/lib/demo-auth';

export const admin_tabs = [
  { href: '/admin', label: 'аналитика', match: (p: string) => p === '/admin' },
  { href: '/admin/menu', label: 'редактирование', match: (p: string) => p.startsWith('/admin/menu') },
  {
    href: '/admin/personnel',
    label: 'персонал',
    match: (p: string) => p.startsWith('/admin/personnel') || p.startsWith('/admin/sellers'),
  },
  { href: '/admin/spots', label: 'точки', match: (p: string) => p.startsWith('/admin/spots') },
] as const;

export function AdminHeader({ actions }: { actions?: React.ReactNode }) {
  const pathname = usePathname() || '/admin';
  const router = useRouter();

  async function handle_logout() {
    await clear_session();
    router.push('/admin/login');
  }

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/admin" className="shrink-0 flex items-center gap-2">
          <img
            src="/icons/yosquad-192.png"
            alt="yoSquad"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-sm font-bold tracking-tight text-accent" style={{ fontFamily: 'Fredoka, var(--font-sans), system-ui, sans-serif' }}>
            yoSquad
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {admin_tabs.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          {actions}
          <Link href="/" className="text-neutral-400 hover:text-neutral-700">
            на сайт
          </Link>
          <button
            type="button"
            onClick={handle_logout}
            className="text-neutral-500 hover:text-neutral-800"
          >
            выйти
          </button>
        </div>
      </div>
    </header>
  );
}

export default function AdminShell({
  children,
  actions,
  wide = false,
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#f4f5f6]">
      <AdminHeader actions={actions} />
      <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}>{children}</main>
    </div>
  );
}
