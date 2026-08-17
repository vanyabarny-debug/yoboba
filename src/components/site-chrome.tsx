'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import location_modal from '@/components/location-modal';
import site_header from '@/components/site-header';
import top_bar from '@/components/top-bar';
import { get_auth_state, sign_out } from '@/lib/auth';
import { clear_session, get_demo_user, type demo_user } from '@/lib/demo-auth';
import { get_location, set_location, type user_location } from '@/lib/location';
import { default_categories } from '@/lib/menu-store';
import { is_supabase_configured } from '@/lib/supabase/config';

type props = {
  children: React.ReactNode;
};

export default function site_chrome({ children }: props) {
  const router = useRouter();
  const pathname = usePathname();
  const search_params = useSearchParams();
  const demo_mode = !is_supabase_configured();

  const is_home = pathname === '/';
  const active_category = search_params.get('category');
  const is_all_active = is_home && !active_category;

  const [user, set_user] = useState<demo_user | null>(null);
  const [bonus, set_bonus] = useState(0);
  const [city, set_city] = useState('москва');
  const [location_open, set_location_open] = useState(false);
  const [header_h, set_header_h] = useState(72);
  const header_ref = useRef<HTMLDivElement>(null);

  const is_logged_in = Boolean(user && user.role === 'user' && !user.is_guest);

  useEffect(() => {
    const loc = get_location();
    if (loc) {
      set_city(loc.city);
    }
  }, []);

  useEffect(() => {
    const el = header_ref.current;
    if (!el) return;

    function measure() {
      if (header_ref.current) {
        set_header_h(header_ref.current.getBoundingClientRect().height);
      }
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    function refresh_user() {
      if (demo_mode) {
        const u = get_demo_user();
        if (u && u.role === 'user' && !u.is_guest) {
          set_user(u);
          set_bonus(u.bonus_balance);
        } else {
          set_user(null);
          set_bonus(0);
        }
        return;
      }

      get_auth_state().then((auth) => {
        if (auth.is_permanent && auth.user_id) {
          const name = (auth.profile?.name || '').trim();
          const shown =
            name && name !== 'аккаунт' && name !== 'профиль'
              ? name
              : `id${auth.user_id.slice(0, 6)}`;
          set_user({
            id: auth.profile?.id || auth.user_id,
            phone: auth.profile?.phone || '',
            name: shown,
            bonus_balance: auth.profile?.bonus_balance || 0,
            avatar_emoji: auth.profile?.avatar_emoji || '',
            avatar_bg: auth.profile?.avatar_bg ?? null,
            is_guest: false,
            role: 'user',
          });
          set_bonus(auth.profile?.bonus_balance || 0);
        } else {
          set_user(null);
          set_bonus(0);
        }
      });
    }

    refresh_user();
    window.addEventListener('focus', refresh_user);
    return () => window.removeEventListener('focus', refresh_user);
  }, [demo_mode]);

  function handle_location_confirm(loc: user_location) {
    set_location(loc);
    set_city(loc.city);
  }

  function handle_login() {
    router.push('/login?returnUrl=/');
  }

  async function handle_logout() {
    if (demo_mode) {
      await clear_session();
      set_user(null);
      set_bonus(0);
      return;
    }
    await sign_out();
    set_user(null);
    set_bonus(0);
  }

  function go_to_category(category: string | null) {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    router.push(`/${params}`);
  }

  function go_to_cart() {
    router.push('/?cart=1');
  }

  return (
    <div
      className="min-h-screen bg-page"
      style={{ '--site-header-h': `${header_h}px` } as React.CSSProperties}
    >
      <div className="bg-page border-b border-surface/70">
        {createElement(top_bar)}
      </div>

      <div
        ref={header_ref}
        className="sticky mobile-sticky-top z-40 bg-page"
      >
        {createElement(site_header, {
          city,
          user_name: user?.name,
          avatar_emoji: user?.avatar_emoji,
          avatar_bg: user?.avatar_bg,
          user_id: user?.id,
          bonus,
          is_logged_in,
          show_admin: user?.role === 'admin',
          on_home: () => router.push('/'),
          on_city_click: () => set_location_open(true),
          on_login: handle_login,
          on_logout: handle_logout,
          on_admin: () => router.push('/admin'),
        })}
      </div>

      <section className="menu-sheet">
        <div className="menu-sheet-head">
          <div className="menu-sheet-nav-box">
            <nav className="page-shell flex items-center gap-1.5 sm:gap-2 pt-5 pb-3 sm:pt-6 sm:pb-4">
          <div className="min-w-0 flex-1 overflow-x-auto stories-scroll">
            <div className="flex w-max shrink-0 gap-0.5">
              <button
                type="button"
                onClick={() => go_to_category(null)}
                className={`flex-shrink-0 pl-0 pr-2.5 sm:pr-3 py-2 text-sm whitespace-nowrap transition-colors ${
                  is_all_active ? 'font-bold text-accent' : 'text-neutral-900 hover:text-accent'
                }`}
              >
                все
              </button>
              {default_categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => go_to_category(category)}
                  className={`flex-shrink-0 px-2.5 sm:px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                    is_home && active_category === category
                      ? 'font-bold text-accent'
                      : 'text-neutral-900 hover:text-accent'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={go_to_cart}
            className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2 rounded-pill bg-accent text-accent-foreground pl-3 pr-3.5 sm:px-5 py-2.5 text-base sm:text-[17px] font-bold hover:opacity-95 transition-opacity"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M3 6h18" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            корзина
          </button>
            </nav>
          </div>
        </div>

        <main className="menu-sheet-main">
          {children}
        </main>
      </section>

      {createElement(location_modal, {
        open: location_open,
        on_close: () => set_location_open(false),
        on_confirm: handle_location_confirm,
      })}
    </div>
  );
}
