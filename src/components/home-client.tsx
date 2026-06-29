'use client';

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { create_client } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import menu_grid from '@/components/menu-grid';
import product_drawer from '@/components/product-drawer';
import cart_drawer, { type cart_line } from '@/components/cart-drawer';
import top_bar from '@/components/top-bar';
import promo_banners from '@/components/promo-banners';
import category_nav from '@/components/category-nav';
import location_modal from '@/components/location-modal';
import order_gate_modal from '@/components/order-gate-modal';
import { add_to_cart, get_cart_items, upsert_cart_item } from '@/lib/cart';
import site_header from '@/components/site-header';
import { get_promo_store, subscribe_promo_store, default_promos } from '@/lib/promo-store';
import sidebar_ad from '@/components/sidebar-ad';
import {
  default_sidebar_interval_ms,
  default_sidebar_slides,
  get_sidebar_ad_store,
  subscribe_sidebar_ad_store,
} from '@/lib/sidebar-ad-store';
import type { menu_item, promo_banner, sidebar_ad_slide, story } from '@/lib/types';
import { get_profile, sign_out } from '@/lib/auth';
import {
  get_demo_user,
  clear_session,
  type demo_user,
} from '@/lib/demo-auth';
import { get_location, is_city_served, set_location, type user_location } from '@/lib/location';
import { get_menu_store, subscribe_menu_store, default_categories } from '@/lib/menu-store';
import { desktop_category_heading_offset } from '@/components/menu-grid';

const guest_cart_key = 'yoboba_guest_cart';
const sticky_ad_gap = 10;

function load_guest_cart(): cart_line[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(guest_cart_key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save_guest_cart(lines: cart_line[]) {
  localStorage.setItem(guest_cart_key, JSON.stringify(lines));
}

function merge_cart_line(lines: cart_line[], item: menu_item, qty: number): cart_line[] {
  const idx = lines.findIndex((l) => l.item.id === item.id);
  if (idx === -1) return [...lines, { item, quantity: qty }];
  const next = [...lines];
  next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
  return next;
}

type pending_order_action =
  | { type: 'add'; item: menu_item; qty: number }
  | { type: 'checkout' };

export default function home_client({
  initial_menu,
  initial_categories = default_categories,
  initial_promos = default_promos,
  initial_sidebar_slides = default_sidebar_slides,
  initial_sidebar_interval_ms = default_sidebar_interval_ms,
  demo_mode = false,
}: {
  initial_menu: menu_item[];
  initial_categories?: string[];
  initial_promos?: promo_banner[];
  initial_sidebar_slides?: sidebar_ad_slide[];
  initial_sidebar_interval_ms?: number;
  initial_stories: story[];
  demo_mode?: boolean;
}) {
  const router = useRouter();
  const search_params = useSearchParams();
  const available = initial_menu.filter((i) => i.is_available);
  const [menu, set_menu] = useState(available);
  const [categories, set_categories] = useState(initial_categories);
  const [selected, set_selected] = useState<menu_item | null>(null);
  const [drawer_open, set_drawer_open] = useState(false);
  const [product_from_cart, set_product_from_cart] = useState(false);
  const [cart_open, set_cart_open] = useState(false);
  const [cart_lines, set_cart_lines] = useState<cart_line[]>([]);
  const [user, set_user] = useState<demo_user | null>(null);
  const [user_id, set_user_id] = useState<string | null>(null);
  const [bonus, set_bonus] = useState(0);
  const [city, set_city] = useState('москва');
  const [location_open, set_location_open] = useState(false);
  const [order_gate_open, set_order_gate_open] = useState(false);
  const [pending_action, set_pending_action] = useState<pending_order_action | null>(null);
  const [saved_location, set_saved_location] = useState<user_location | null>(null);
  const [address_confirmed, set_address_confirmed] = useState(false);
  const [active_category, set_active_category] = useState<string | null>(null);
  const [promos, set_promos] = useState(initial_promos);
  const [sidebar_slides, set_sidebar_slides] = useState(initial_sidebar_slides);
  const [sidebar_interval_ms, set_sidebar_interval_ms] = useState(initial_sidebar_interval_ms);
  const [header_h, set_header_h] = useState(72);
  const [nav_h, set_nav_h] = useState(56);
  const header_ref = useRef<HTMLDivElement>(null);
  const nav_ref = useRef<HTMLDivElement>(null);

  const is_logged_in = Boolean(user && user.role === 'user' && !user.is_guest);
  const has_account = demo_mode ? is_logged_in : Boolean(user_id);
  const cart_count = cart_lines.reduce((s, l) => s + l.quantity, 0);
  const cart_total = cart_lines.reduce((s, l) => s + l.item.price * l.quantity, 0);

  useEffect(() => {
    const category = search_params.get('category');
    const cart = search_params.get('cart');

    if (category) {
      set_active_category(category);
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (cart === '1') {
      set_cart_open(true);
    }
  }, [search_params]);

  function can_order_without_gate() {
    if (has_account) return true;
    const loc = get_location();
    return Boolean(loc && is_city_served(loc.city));
  }

  function open_order_gate(action: pending_order_action) {
    set_pending_action(action);
    set_order_gate_open(true);
  }

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
    const el = nav_ref.current;
    if (!el) return;

    function measure() {
      if (nav_ref.current) {
        set_nav_h(nav_ref.current.getBoundingClientRect().height);
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
    const loc = get_location();
    if (loc) {
      set_city(loc.city);
      set_saved_location(loc);
    }

    function refresh_user() {
      if (!demo_mode) return;
      const u = get_demo_user();
      if (u && u.role === 'user' && !u.is_guest) {
        set_user(u);
        set_bonus(u.bonus_balance);
      } else {
        set_user(null);
      }
      set_cart_lines(load_guest_cart());
    }

    refresh_user();
    window.addEventListener('focus', refresh_user);
    return () => window.removeEventListener('focus', refresh_user);
  }, [demo_mode]);

  useEffect(() => {
    if (!demo_mode) return;

    function reload_sidebar() {
      const store = get_sidebar_ad_store();
      set_sidebar_slides(store.slides);
      set_sidebar_interval_ms(store.interval_ms);
    }

    reload_sidebar();
    return subscribe_sidebar_ad_store(reload_sidebar);
  }, [demo_mode]);

  useEffect(() => {
    if (!demo_mode) return;

    function reload_promos() {
      set_promos(get_promo_store().promos);
    }

    reload_promos();
    return subscribe_promo_store(reload_promos);
  }, [demo_mode]);

  useEffect(() => {
    if (!demo_mode) return;

    function reload_menu() {
      const store = get_menu_store();
      set_categories(store.categories);
      set_menu(store.items.filter((i) => i.is_available));
    }

    reload_menu();
    return subscribe_menu_store(reload_menu);
  }, [demo_mode]);

  useEffect(() => {
    if (demo_mode) return;
    set_categories([...new Set(initial_menu.map((i) => i.category))]);
    set_menu(initial_menu.filter((i) => i.is_available));
  }, [demo_mode, initial_menu]);

  useEffect(() => {
    if (demo_mode && !user_id) {
      save_guest_cart(cart_lines);
    }
  }, [cart_lines, demo_mode, user_id]);

  const load_prod_cart = useCallback(async (uid: string) => {
    const { data } = await get_cart_items(uid);
    const lines: cart_line[] = (data || [])
      .filter((row) => row.menu)
      .map((row) => ({
        item: row.menu as unknown as menu_item,
        quantity: row.quantity,
      }));
    set_cart_lines(lines);
  }, []);

  useEffect(() => {
    if (demo_mode) return;

    async function load_user() {
      const profile = await get_profile();
      if (profile) {
        set_user_id(profile.id);
        set_bonus(profile.bonus_balance);
        await load_prod_cart(profile.id);
      }
    }
    load_user();
  }, [demo_mode, load_prod_cart]);

  useEffect(() => {
    if (demo_mode || !user_id) return;
    const supabase = create_client();
    const channel = supabase
      .channel(`cart-${user_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${user_id}` },
        () => load_prod_cart(user_id)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [demo_mode, user_id, load_prod_cart]);

  async function execute_add(item: menu_item, qty: number) {
    if (demo_mode && !user_id) {
      set_cart_lines((prev) => merge_cart_line(prev, item, qty));
      return;
    }
    if (user_id) {
      await add_to_cart(user_id, item, qty);
      await load_prod_cart(user_id);
    }
  }

  async function handle_add(item: menu_item, qty: number) {
    if (!can_order_without_gate()) {
      open_order_gate({ type: 'add', item, qty });
      return;
    }
    await execute_add(item, qty);
  }

  async function handle_update_qty(menu_id: string, quantity: number) {
    if (demo_mode && !user_id) {
      set_cart_lines((prev) =>
        prev.map((l) => (l.item.id === menu_id ? { ...l, quantity } : l))
      );
      return;
    }
    if (user_id) {
      await upsert_cart_item(user_id, menu_id, quantity);
      await load_prod_cart(user_id);
    }
  }

  async function handle_remove(menu_id: string) {
    if (demo_mode && !user_id) {
      set_cart_lines((prev) => prev.filter((l) => l.item.id !== menu_id));
      return;
    }
    if (user_id) {
      await upsert_cart_item(user_id, menu_id, 0);
      await load_prod_cart(user_id);
    }
  }

  function handle_location_confirm(loc: user_location) {
    set_location(loc);
    set_city(loc.city);
    set_saved_location(loc);
  }

  async function handle_gate_location_confirmed(loc: user_location) {
    handle_location_confirm(loc);
    set_address_confirmed(true);
    set_order_gate_open(false);
    const action = pending_action;
    set_pending_action(null);
    if (!action) return;

    if (action.type === 'add') {
      await execute_add(action.item, action.qty);
      set_drawer_open(false);
      return;
    }

    set_cart_open(true);
  }

  function handle_edit_line(item: menu_item) {
    set_cart_open(false);
    set_selected(item);
    set_product_from_cart(true);
    set_drawer_open(true);
  }

  function handle_open_from_cart(item: menu_item) {
    set_cart_open(false);
    set_selected(item);
    set_product_from_cart(true);
    set_drawer_open(true);
  }

  function handle_product_close() {
    set_drawer_open(false);
    set_product_from_cart(false);
    set_selected(null);
  }

  function handle_return_to_cart() {
    set_drawer_open(false);
    set_product_from_cart(false);
    set_selected(null);
    set_cart_open(true);
  }

  function handle_checkout() {
    if (!has_account && !address_confirmed) {
      set_cart_open(false);
      open_order_gate({ type: 'checkout' });
      return;
    }
  }

  function handle_order_gate_login() {
    set_order_gate_open(false);
    set_pending_action(null);
    router.push('/login?returnUrl=/');
  }

  function handle_go_home() {
    set_active_category(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function scroll_to_promos() {
    set_active_category(null);
    requestAnimationFrame(() => {
      const el = document.getElementById('promos');
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  function handle_sidebar_click(slide: sidebar_ad_slide) {
    if (slide.menu_id) {
      const item = menu.find((i) => i.id === slide.menu_id);
      if (item) {
        set_selected(item);
        set_product_from_cart(false);
        set_drawer_open(true);
        return;
      }
    }
    if (slide.category) {
      set_active_category(slide.category);
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return;
    }
    if (slide.link_url && slide.link_url !== '/') {
      router.push(slide.link_url);
    }
  }

  function handle_promo_click(promo: promo_banner) {
    if (promo.menu_id) {
      const item = menu.find((i) => i.id === promo.menu_id);
      if (item) {
        set_selected(item);
        set_product_from_cart(false);
        set_drawer_open(true);
        return;
      }
    }
    if (promo.category) {
      set_active_category(promo.category);
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return;
    }
    if (promo.link_url && promo.link_url !== '/') {
      router.push(promo.link_url);
    }
  }

  function handle_login() {
    router.push('/login?returnUrl=/');
  }

  function handle_logout() {
    if (demo_mode) {
      clear_session().then(() => {
        set_user(null);
        set_user_id(null);
        set_bonus(0);
        set_address_confirmed(false);
        set_cart_lines(load_guest_cart());
      });
      return;
    }
    sign_out();
    set_user_id(null);
    set_bonus(0);
    set_address_confirmed(false);
    set_cart_lines([]);
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
        className="sticky top-0 z-40 bg-page"
      >
        {createElement(site_header, {
          city,
          user_name: user?.name,
          bonus,
          is_logged_in,
          show_admin: user?.role === 'admin',
          on_home: handle_go_home,
          on_city_click: () => set_location_open(true),
          on_login: handle_login,
          on_logout: handle_logout,
          on_admin: () => router.push('/admin/menu'),
        })}
      </div>

      {active_category === null &&
        createElement(promo_banners, {
          promos,
          on_promo_click: handle_promo_click,
        })}

      <section className="menu-sheet">
        <div ref={nav_ref} className="menu-sheet-head">
          <div className="menu-sheet-nav-box">
            {createElement(category_nav, {
              categories,
              active: active_category,
              cart_count,
              cart_total,
              on_change: set_active_category,
              on_cart_click: () => set_cart_open(true),
            })}
          </div>
        </div>

        <main className="menu-sheet-main py-5 sm:py-6 pb-24 sm:pb-28">
            <div className="page-shell min-[1024px]:flex min-[1024px]:gap-2">
              <div className="min-w-0 min-[1024px]:flex-[4]">
              {createElement(menu_grid, {
                items: menu,
                categories,
                active_category: active_category ?? undefined,
                on_item_click: (item: menu_item) => {
                  set_selected(item);
                  set_product_from_cart(false);
                  set_drawer_open(true);
                },
              })}
            </div>
            <aside
              className="sticky-ad-slide hidden min-[1024px]:block min-w-0 min-[1024px]:flex-[1.85] shrink-0 sticky z-10 self-start"
              style={{
                top: header_h + nav_h + sticky_ad_gap,
                marginTop: active_category === null ? desktop_category_heading_offset : 0,
              }}
            >
              {createElement(sidebar_ad, {
                slides: sidebar_slides,
                interval_ms: sidebar_interval_ms,
                on_slide_click: handle_sidebar_click,
              })}
            </aside>
            </div>
          </main>
      </section>

      {createElement(product_drawer, {
        item: selected,
        all_items: menu,
        open: drawer_open,
        on_close: handle_product_close,
        on_add: handle_add,
        return_to_cart: product_from_cart,
        on_return_to_cart: handle_return_to_cart,
      })}

      {createElement(cart_drawer, {
        open: cart_open,
        lines: cart_lines,
        all_items: menu,
        on_close: () => set_cart_open(false),
        on_update_qty: handle_update_qty,
        on_remove: handle_remove,
        on_add: handle_add,
        on_open_item: handle_open_from_cart,
        on_edit: handle_edit_line,
        on_checkout: handle_checkout,
      })}

      {createElement(order_gate_modal, {
        open: order_gate_open,
        store_city: city,
        saved_location,
        on_close: () => {
          set_order_gate_open(false);
          set_pending_action(null);
        },
        on_location_confirmed: handle_gate_location_confirmed,
        on_login: handle_order_gate_login,
      })}

      {createElement(location_modal, {
        open: location_open,
        on_close: () => set_location_open(false),
        on_confirm: handle_location_confirm,
      })}
    </div>
  );
}
