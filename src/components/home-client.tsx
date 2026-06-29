'use client';

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { create_client } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import menu_grid from '@/components/menu-grid';
import menu_grid_admin from '@/components/admin/menu-grid-admin';
import product_drawer from '@/components/product-drawer';
import product_drawer_admin from '@/components/admin/product-drawer-admin';
import cart_drawer, { type cart_line } from '@/components/cart-drawer';
import top_bar from '@/components/top-bar';
import promo_banners from '@/components/promo-banners';
import promo_edit_sheet from '@/components/admin/promo-edit-sheet';
import category_nav from '@/components/category-nav';
import category_edit_sheet from '@/components/admin/category-edit-sheet';
import sidebar_edit_sheet from '@/components/admin/sidebar-edit-sheet';
import top_bar_edit_sheet from '@/components/admin/top-bar-edit-sheet';
import { admin_sheet } from '@/components/admin/admin-sheet';
import location_modal from '@/components/location-modal';
import order_gate_modal from '@/components/order-gate-modal';
import { add_to_cart, get_cart_items, upsert_cart_item } from '@/lib/cart';
import site_header from '@/components/site-header';
import {
  delete_promo,
  get_promo_store,
  new_promo_id,
  subscribe_promo_store,
  upsert_promo,
  default_promos,
} from '@/lib/promo-store';
import sidebar_ad from '@/components/sidebar-ad';
import {
  default_sidebar_interval_ms,
  default_sidebar_slides,
  delete_sidebar_slide,
  get_sidebar_ad_store,
  new_sidebar_slide_id,
  subscribe_sidebar_ad_store,
  upsert_sidebar_slide,
} from '@/lib/sidebar-ad-store';
import type { menu_item, promo_banner, sidebar_ad_slide, story } from '@/lib/types';
import { get_profile, sign_out } from '@/lib/auth';
import {
  get_demo_user,
  clear_session,
  type demo_user,
} from '@/lib/demo-auth';
import { get_location, is_city_served, set_location, type user_location } from '@/lib/location';
import {
  add_category,
  delete_category,
  delete_menu_item,
  get_menu_store,
  new_item_id,
  rename_category,
  reset_menu_store,
  subscribe_menu_store,
  upsert_menu_item,
  default_categories,
} from '@/lib/menu-store';
import {
  delete_top_bar_link,
  get_site_content_store,
  new_top_bar_link_id,
  set_lang_link,
  subscribe_site_content_store,
  upsert_page,
  upsert_top_bar_link,
  type top_bar_link,
} from '@/lib/site-content-store';
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
  admin_edit_mode = false,
}: {
  initial_menu: menu_item[];
  initial_categories?: string[];
  initial_promos?: promo_banner[];
  initial_sidebar_slides?: sidebar_ad_slide[];
  initial_sidebar_interval_ms?: number;
  initial_stories: story[];
  demo_mode?: boolean;
  admin_edit_mode?: boolean;
}) {
  const router = useRouter();
  const search_params = useSearchParams();
  const [menu, set_menu] = useState(
    admin_edit_mode ? initial_menu : initial_menu.filter((i) => i.is_available)
  );
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
  const [editing_promo, set_editing_promo] = useState<promo_banner | null>(null);
  const [editing_slide, set_editing_slide] = useState<sidebar_ad_slide | null>(null);
  const [editing_link, set_editing_link] = useState<top_bar_link | null>(null);
  const [editing_category, set_editing_category] = useState<string | null>(null);
  const [editing_lang, set_editing_lang] = useState(false);
  const [lang_draft, set_lang_draft] = useState({ label: 'язык', href: '/yazyk' });
  const [order_toast, set_order_toast] = useState(false);
  const header_ref = useRef<HTMLDivElement>(null);
  const nav_ref = useRef<HTMLDivElement>(null);

  const is_admin_edit = admin_edit_mode;
  const is_staff_admin = !admin_edit_mode && user?.role === 'admin';
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
    if (demo_mode) return true;
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
        set_header_h(Math.round(header_ref.current.getBoundingClientRect().height));
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
        set_nav_h(Math.round(nav_ref.current.getBoundingClientRect().height));
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
      if (u?.role === 'admin' || u?.role === 'seller') {
        set_user(u);
        set_bonus(0);
      } else if (u) {
        set_user(u);
        if (u.role === 'user' && !u.is_guest) {
          set_bonus(u.bonus_balance);
        }
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
      set_menu(
        admin_edit_mode
          ? store.items
          : store.items.filter((i) => i.is_available)
      );
    }

    reload_menu();
    return subscribe_menu_store(reload_menu);
  }, [demo_mode, admin_edit_mode]);

  useEffect(() => {
    if (!demo_mode || !is_admin_edit) return;
    set_lang_draft(get_site_content_store().lang_link);
    return subscribe_site_content_store(() => {
      set_lang_draft(get_site_content_store().lang_link);
    });
  }, [demo_mode, is_admin_edit]);

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

  async function handle_checkout() {
    if (demo_mode) {
      if (cart_lines.length === 0) return;
      const items = cart_lines.map((l) => ({
        menu_id: l.item.id,
        name: l.item.name,
        price: l.item.price,
        quantity: l.quantity,
      }));
      const res = await fetch('/api/orders/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        set_cart_lines([]);
        save_guest_cart([]);
        set_cart_open(false);
        set_order_toast(true);
        window.setTimeout(() => set_order_toast(false), 4500);
      }
      return;
    }
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
        if (admin_edit_mode) router.push('/admin/login');
      });
      return;
    }
    sign_out();
    set_user_id(null);
    set_bonus(0);
    set_address_confirmed(false);
    set_cart_lines([]);
  }

  function handle_admin_add_item(category: string) {
    const created: menu_item = {
      id: new_item_id(),
      name: 'новое блюдо',
      price: 0,
      image_url: null,
      category,
      is_available: true,
      recommendations: [],
    };
    upsert_menu_item(created);
    set_selected(created);
    set_drawer_open(true);
  }

  function handle_admin_delete_item(id: string) {
    delete_menu_item(id);
    if (selected?.id === id) {
      set_drawer_open(false);
      set_selected(null);
    }
  }

  function handle_admin_add_category() {
    const name = prompt('название новой категории');
    if (!name?.trim()) return;
    add_category(name.trim());
  }

  return (
    <div
      className="min-h-screen bg-page"
      style={{ '--site-header-h': `${header_h}px` } as React.CSSProperties}
    >
      {is_admin_edit && (
        <div className="bg-accent/10 border-b border-accent/20 sticky top-0 z-50">
          <div className="page-shell py-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-accent">режим редактирования</span>
            <div className="flex items-center gap-3">
              <Link href="/admin/sellers" className="text-neutral-700 hover:text-accent">
                продавцы
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (confirm('сбросить меню к дефолту?')) reset_menu_store();
                }}
                className="text-neutral-400"
              >
                сброс
              </button>
              <button type="button" onClick={handle_logout} className="text-neutral-600">
                выйти
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-page border-b border-surface/70">
        {createElement(top_bar, is_admin_edit ? {
          edit_mode: true,
          on_edit_link: set_editing_link,
          on_add_link: () =>
            set_editing_link({ id: '', label: 'новый раздел', href: '/', is_active: true }),
          on_edit_lang: () => {
            set_lang_draft(get_site_content_store().lang_link);
            set_editing_lang(true);
          },
        } : {})}
      </div>

      <div
        ref={header_ref}
        className="sticky top-0 z-40 bg-page"
      >
        {createElement(site_header, {
          city,
          user_name: is_admin_edit ? 'админ' : user?.role === 'admin' ? null : user?.name,
          bonus,
          is_logged_in: is_admin_edit ? false : is_logged_in,
          show_admin: is_staff_admin,
          on_home: handle_go_home,
          on_city_click: () => set_location_open(true),
          on_login: handle_login,
          on_logout: handle_logout,
          on_admin: () => router.push('/admin/menu'),
        })}
      </div>

      {active_category === null &&
        createElement(promo_banners, is_admin_edit ? {
          promos,
          on_promo_click: () => {},
          edit_mode: true,
          on_edit_promo: set_editing_promo,
          on_add_promo: () =>
            set_editing_promo({ id: '', title: 'новая акция', image_url: '', is_active: true }),
        } : {
          promos,
          on_promo_click: handle_promo_click,
        })}

      <section className="menu-sheet">
        <div ref={nav_ref} className="menu-sheet-head">
          <div className="menu-sheet-nav-box">
            {createElement(category_nav, is_admin_edit ? {
              categories,
              active: active_category,
              cart_count: 0,
              cart_total: 0,
              on_change: set_active_category,
              on_cart_click: () => {},
              edit_mode: true,
              on_edit_category: set_editing_category,
              on_add_category: handle_admin_add_category,
            } : {
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
            {!is_admin_edit && (
              <div className="page-shell min-[1024px]:hidden mb-6">
                {createElement(sidebar_ad, {
                  slides: sidebar_slides,
                  interval_ms: sidebar_interval_ms,
                  on_slide_click: handle_sidebar_click,
                })}
              </div>
            )}
            {is_admin_edit && (
              <div className="page-shell min-[1024px]:hidden mb-6">
                {createElement(sidebar_ad, {
                  slides: sidebar_slides,
                  on_slide_click: () => {},
                  edit_mode: true,
                  on_edit_slide: set_editing_slide,
                  on_add_slide: () =>
                    set_editing_slide({ id: '', title: 'новый баннер', image_url: '', is_active: true }),
                })}
              </div>
            )}
            <div className="page-shell min-[1024px]:flex min-[1024px]:gap-2">
              <div className="min-w-0 min-[1024px]:flex-[4]">
              {is_admin_edit
                ? createElement(menu_grid_admin, {
                    items: menu,
                    categories,
                    active_category: active_category ?? undefined,
                    on_item_click: (item) => {
                      set_selected(item);
                      set_product_from_cart(false);
                      set_drawer_open(true);
                    },
                    on_update_item: upsert_menu_item,
                    on_add_item: handle_admin_add_item,
                    on_delete_item: handle_admin_delete_item,
                  })
                : createElement(menu_grid, {
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
              className="sticky-ad-slide hidden min-[1024px]:block min-w-[220px] min-[1024px]:flex-[1.85] shrink-0 sticky z-10 self-start"
              style={{
                top: header_h + nav_h + sticky_ad_gap,
                marginTop: active_category === null ? desktop_category_heading_offset : 0,
              }}
            >
              {createElement(sidebar_ad, is_admin_edit ? {
                slides: sidebar_slides,
                on_slide_click: () => {},
                edit_mode: true,
                on_edit_slide: set_editing_slide,
                on_add_slide: () =>
                  set_editing_slide({ id: '', title: 'новый баннер', image_url: '', is_active: true }),
              } : {
                slides: sidebar_slides,
                interval_ms: sidebar_interval_ms,
                on_slide_click: handle_sidebar_click,
              })}
            </aside>
            </div>
          </main>
      </section>

      {is_admin_edit
        ? createElement(product_drawer_admin, {
            item: selected,
            open: drawer_open,
            on_close: handle_product_close,
            on_save: upsert_menu_item,
            on_delete: handle_admin_delete_item,
          })
        : createElement(product_drawer, {
            item: selected,
            all_items: menu,
            open: drawer_open,
            on_close: handle_product_close,
            on_add: handle_add,
            return_to_cart: product_from_cart,
            on_return_to_cart: handle_return_to_cart,
          })}

      {!is_admin_edit && createElement(cart_drawer, {
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

      {is_admin_edit && createElement(promo_edit_sheet, {
        promo: editing_promo,
        categories,
        on_close: () => set_editing_promo(null),
        on_save: (promo) => {
          upsert_promo({ ...promo, id: promo.id || new_promo_id() });
        },
        on_delete: delete_promo,
      })}

      {is_admin_edit && createElement(sidebar_edit_sheet, {
        slide: editing_slide,
        categories,
        on_close: () => set_editing_slide(null),
        on_save: (slide) => {
          upsert_sidebar_slide({ ...slide, id: slide.id || new_sidebar_slide_id() });
        },
        on_delete: delete_sidebar_slide,
      })}

      {is_admin_edit && createElement(top_bar_edit_sheet, {
        link: editing_link,
        on_close: () => set_editing_link(null),
        on_save: (link, page) => {
          upsert_top_bar_link({ ...link, id: link.id || new_top_bar_link_id() });
          if (page) upsert_page(page);
        },
        on_delete: delete_top_bar_link,
      })}

      {is_admin_edit && createElement(category_edit_sheet, {
        category: editing_category,
        item_count: editing_category
          ? menu.filter((i) => i.category === editing_category).length
          : 0,
        on_close: () => set_editing_category(null),
        on_rename: (old_name, new_name) => {
          rename_category(old_name, new_name);
          if (active_category === old_name) set_active_category(new_name.trim().toLowerCase());
        },
        on_delete: (name) => {
          delete_category(name);
          if (active_category === name) set_active_category(null);
        },
      })}

      {is_admin_edit && createElement(admin_sheet, {
        open: editing_lang,
        title: 'кнопка «язык»',
        on_close: () => set_editing_lang(false),
        children: (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set_lang_link(lang_draft);
              set_editing_lang(false);
            }}
            className="space-y-3"
          >
            <input
              value={lang_draft.label}
              onChange={(e) => set_lang_draft({ ...lang_draft, label: e.target.value })}
              placeholder="подпись"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              required
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => set_editing_lang(false)}
                className="flex-1 rounded-pill border border-surface py-2.5 text-sm"
              >
                отмена
              </button>
              <button
                type="submit"
                className="flex-1 rounded-pill bg-accent text-white py-2.5 text-sm font-medium"
              >
                сохранить
              </button>
            </div>
          </form>
        ),
      })}

      {!is_admin_edit && createElement(order_gate_modal, {
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

      {!is_admin_edit && createElement(location_modal, {
        open: location_open,
        on_close: () => set_location_open(false),
        on_confirm: handle_location_confirm,
      })}

      {order_toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-2xl bg-neutral-900 text-white text-sm shadow-lg">
          заказ отправлен — заберите через ~12 мин
        </div>
      )}
    </div>
  );
}
