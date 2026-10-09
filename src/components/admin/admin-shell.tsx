'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clear_session } from '@/lib/demo-auth';
import { AdminSpotProvider, use_admin_spot } from '@/components/admin/admin-spot-context';

export const admin_tabs = [
  {
    href: '/admin',
    label: 'аналитика',
    match: (p: string) => p === '/admin' || p.startsWith('/admin/shifts'),
  },
  {
    href: '/admin/customers',
    label: 'клиенты',
    match: (p: string) => p.startsWith('/admin/customers') || p.startsWith('/admin/push'),
  },
  {
    href: '/admin/menu',
    label: 'меню',
    match: (p: string) => p.startsWith('/admin/menu') || p.startsWith('/admin/techcards') || p.startsWith('/admin/craft'),
  },
  {
    href: '/admin/sklad',
    label: 'склад',
    match: (p: string) => p.startsWith('/admin/sklad'),
  },
  {
    href: '/admin/edit',
    label: 'редактирование',
    match: (p: string) => p.startsWith('/admin/edit'),
  },
  {
    href: '/admin/spots',
    label: 'инфраструктура',
    match: (p: string) =>
      p.startsWith('/admin/spots') ||
      p.startsWith('/admin/personnel') ||
      p.startsWith('/admin/sellers'),
  },
  { href: '/admin/designer', label: 'дизайн', match: (p: string) => p.startsWith('/admin/designer') },
] as const;

const settings_links = [
  { href: '/admin/account', label: 'аккаунт' },
] as const;

function AdminSpotSwitch() {
  const { spot_id, set_spot_id, spot_options, current_label } = use_admin_spot();
  const [open, set_open] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function on_down(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) set_open(false);
    }
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') set_open(false);
    }
    document.addEventListener('mousedown', on_down);
    document.addEventListener('keydown', on_key);
    return () => {
      document.removeEventListener('mousedown', on_down);
      document.removeEventListener('keydown', on_key);
    };
  }, [open]);

  if (!spot_options.length) return null;

  const all_label = spot_options.length > 1 ? 'все точки · среднее' : 'все точки';
  const options = [{ id: '', label: all_label }, ...spot_options];

  return (
    <div className="relative min-w-0" ref={root}>
      <button
        type="button"
        onClick={() => set_open((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="group flex max-w-[13rem] items-center gap-1.5 rounded-xl py-1 pl-3 sm:max-w-[20rem] sm:pl-4 pr-2 text-left transition-colors hover:bg-surface/70 sm:pr-2.5"
      >
        <span className="min-w-0 truncate text-[13px] font-semibold leading-snug text-neutral-900 sm:text-sm">
          {current_label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-[60] mt-1.5 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-1.5 shadow-soft"
        >
          {options.map((opt) => {
            const active = spot_id === opt.id;
            return (
              <button
                key={opt.id || 'all'}
                type="button"
                role="option"
                aria-selected={active}
                className={`flex w-full items-start rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent/10 font-semibold text-accent'
                    : 'text-neutral-800 hover:bg-neutral-50'
                }`}
                onClick={() => {
                  set_spot_id(opt.id);
                  set_open(false);
                }}
              >
                <span className="min-w-0 flex-1 leading-snug">{opt.label}</span>
                {active ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    className="mt-0.5 shrink-0 text-accent"
                  >
                    <path
                      d="M5 12.5l5 5L19 7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SettingsMenu() {
  const pathname = usePathname() || '/admin';
  const [open, set_open] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const on_account = pathname.startsWith('/admin/account');

  function clear_close() {
    if (close_timer.current) {
      clearTimeout(close_timer.current);
      close_timer.current = null;
    }
  }

  function open_menu() {
    clear_close();
    set_open(true);
  }

  function schedule_close() {
    clear_close();
    close_timer.current = setTimeout(() => set_open(false), 120);
  }

  useEffect(() => {
    if (!open) return;
    function on_down(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) set_open(false);
    }
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') set_open(false);
    }
    document.addEventListener('mousedown', on_down);
    document.addEventListener('keydown', on_key);
    return () => {
      document.removeEventListener('mousedown', on_down);
      document.removeEventListener('keydown', on_key);
    };
  }, [open]);

  useEffect(() => () => clear_close(), []);

  return (
    <div
      className="relative"
      ref={root}
      onMouseEnter={open_menu}
      onMouseLeave={schedule_close}
    >
      <button
        type="button"
        aria-label="настройки"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => set_open((v) => !v)}
        className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
          open || on_account
            ? 'bg-neutral-100 text-neutral-800'
            : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.6.24-1.15.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.48.39 1.03.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.6-.24 1.15-.55 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[60] mt-1.5 w-44 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-1.5 shadow-soft"
        >
          {settings_links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => set_open(false)}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-accent/10 font-semibold text-accent'
                    : 'text-neutral-800 hover:bg-neutral-50'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AdminHeader({ actions, wide = false }: { actions?: React.ReactNode; wide?: boolean }) {
  const pathname = usePathname() || '/admin';
  const router = useRouter();

  async function handle_logout() {
    await clear_session();
    router.push('/admin/login');
  }

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/95 backdrop-blur">
      <div className={`mx-auto px-4 pt-2.5 pb-2 ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}>
        <div className="flex items-center gap-x-3">
          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/admin" className="shrink-0 flex items-center">
              <span
                className="text-sm font-bold tracking-tight text-accent"
                style={{ fontFamily: 'Fredoka, var(--font-sans), system-ui, sans-serif' }}
              >
                yoSquad
              </span>
            </Link>
            <span className="hidden h-5 w-px bg-neutral-200 sm:block" aria-hidden />
            <AdminSpotSwitch />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            {actions}
            <SettingsMenu />
            <button
              type="button"
              onClick={handle_logout}
              className="text-neutral-500 hover:text-neutral-800"
            >
              выйти
            </button>
          </div>
        </div>

        <nav className="mt-1.5 flex min-w-0 gap-0.5 overflow-x-auto stories-scroll -mx-1 px-1">
          {admin_tabs.map((tab) => {
            const active = tab.match(pathname);
            const class_name = `shrink-0 px-2 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'text-accent'
                : 'text-neutral-500 hover:text-neutral-800'
            }`;
            if (tab.href === '/admin/designer') {
              return (
                <a key={tab.href} href={tab.href} className={class_name}>
                  {tab.label}
                </a>
              );
            }
            return (
              <Link key={tab.href} href={tab.href} className={class_name}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
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
    <AdminSpotProvider>
      <div className="min-h-screen bg-page">
        <AdminHeader actions={actions} wide={wide} />
        <main
          className={`mx-auto box-border w-full py-6 ${wide ? 'max-w-7xl' : 'max-w-6xl'} px-[var(--page-gutter)]`}
        >
          {children}
        </main>
      </div>
    </AdminSpotProvider>
  );
}
