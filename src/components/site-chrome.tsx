'use client';

import { createElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import location_modal from '@/components/location-modal';
import SiteHeader from '@/components/site-header';
import TopBar from '@/components/top-bar';
import NewsTicker from '@/components/news-ticker';
import cart_mark from '@/components/cart-mark';
import { get_auth_state, sign_out } from '@/lib/auth';
import { clear_session, get_demo_user, type demo_user } from '@/lib/demo-auth';
import { peek_header_user, remember_header_user } from '@/lib/header-user';
import { get_location, get_selected_spot, set_location, type user_location } from '@/lib/location';
import { subscribe_spot_store } from '@/lib/spot-store';
import type { store_spot } from '@/lib/types';
import { default_categories, get_menu_store, subscribe_menu_store } from '@/lib/menu-store';
import { item_in_category } from '@/lib/menu-item-categories';
import { is_supabase_configured } from '@/lib/supabase/config';

type props = {
  children: React.ReactNode;
};

export default function SiteChrome({ children }: props) {
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
  const [selected_spot, set_selected_spot] = useState<store_spot | null>(null);
  const [location_open, set_location_open] = useState(false);
  const [header_h, set_header_h] = useState(72);
  const [categories, set_categories] = useState(default_categories);
  const header_ref = useRef<HTMLDivElement>(null);

  const is_logged_in = Boolean(user && user.role === 'user' && !user.is_guest);

  /* eslint-disable react-hooks/set-state-in-effect -- до первой отрисовки, иначе мигнёт шапка гостя */
  useLayoutEffect(() => {
    const cached = peek_header_user();
    if (!cached) return;
    set_user(cached);
    set_bonus(cached.bonus_balance);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    function reload_spot() {
      const loc = get_location();
      const spot = get_selected_spot();
      if (loc) set_city(loc.city);
      else if (spot) set_city(spot.city);
      set_selected_spot(spot);
    }
    reload_spot();
    return subscribe_spot_store(reload_spot);
  }, []);

  useEffect(() => {
    function reload_menu() {
      const store = get_menu_store();
      const live = store.items.filter((item) => item.is_available !== false && item.archived !== true);
      set_categories(store.categories.filter((cat) => live.some((item) => item_in_category(item, cat))));
    }
    reload_menu();
    return subscribe_menu_store(reload_menu);
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
          remember_header_user(u);
        } else {
          set_user(null);
          set_bonus(0);
          remember_header_user(null);
        }
        return;
      }

      get_auth_state().then(async (first) => {
        let auth = first;
        for (let attempt = 0; attempt < 5 && !auth.is_permanent; attempt++) {
          await new Promise((r) => setTimeout(r, 120 + attempt * 80));
          auth = await get_auth_state();
        }
        if (auth.is_permanent && auth.user_id) {
          const name = (auth.profile?.name || '').trim();
          const shown =
            name && name !== 'аккаунт' && name !== 'профиль'
              ? name
              : `id${auth.user_id.slice(0, 6)}`;
          const next: demo_user = {
            id: auth.profile?.id || auth.user_id,
            phone: auth.profile?.phone || '',
            name: shown,
            bonus_balance: auth.profile?.bonus_balance || 0,
            avatar_emoji: auth.profile?.avatar_emoji || '',
            avatar_bg: auth.profile?.avatar_bg ?? null,
            avatar_url: auth.profile?.avatar_url || null,
            is_guest: false,
            role: 'user',
          };
          set_user(next);
          set_bonus(next.bonus_balance);
          remember_header_user(next);
        } else {
          set_user(null);
          set_bonus(0);
          remember_header_user(null);
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
    set_selected_spot(get_selected_spot());
  }

  function handle_login() {
    router.push('/login?returnUrl=/');
  }

  async function handle_logout() {
    if (demo_mode) {
      await clear_session();
      remember_header_user(null);
      set_user(null);
      set_bonus(0);
      return;
    }
    await sign_out();
    remember_header_user(null);
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
        {createElement(TopBar)}
      </div>

      <div
        ref={header_ref}
        className="sticky mobile-sticky-top z-40 bg-page"
      >
        {createElement(SiteHeader, {
          city,
          spot_address: selected_spot?.address,
          user_name: user?.name,
          avatar_emoji: user?.avatar_emoji,
          avatar_bg: user?.avatar_bg,
          avatar_url: user?.avatar_url,
          user_id: user?.id,
          bonus,
          is_logged_in,
          show_admin: user?.role === 'admin',
          on_home: () => router.push('/'),
          spot: selected_spot,
          on_city_click: () => set_location_open(true),
          on_login: handle_login,
          on_logout: handle_logout,
          on_admin: () => router.push('/admin'),
        })}
      </div>

      {pathname !== '/profile' && createElement(NewsTicker)}

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
              {categories.map((category) => (
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
            className="flex-shrink-0 flex items-center gap-2 rounded-pill bg-accent text-accent-foreground pl-3.5 pr-4 sm:px-5 py-2.5 hover:opacity-95 transition-opacity"
          >
            {createElement(cart_mark, { size: 22 })}
            <span className="text-[17px] sm:text-lg font-extrabold leading-none">корзина</span>
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
