'use client';

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { create_client } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import menu_grid from '@/components/menu-grid';
import menu_grid_admin from '@/components/admin/menu-grid-admin';
import product_drawer from '@/components/product-drawer';
import product_drawer_admin from '@/components/admin/product-drawer-admin';
import cart_drawer, {
  cart_line_key,
  cart_line_unit_price,
  type cart_line,
} from '@/components/cart-drawer';
import cart_fab from '@/components/cart-fab';
import top_bar from '@/components/top-bar';
import promo_banners from '@/components/promo-banners';
import promo_story_viewer from '@/components/promo-story-viewer';
import promo_edit_sheet from '@/components/admin/promo-edit-sheet';
import category_nav from '@/components/category-nav';
import category_edit_sheet from '@/components/admin/category-edit-sheet';
import sidebar_edit_sheet from '@/components/admin/sidebar-edit-sheet';
import top_bar_edit_sheet from '@/components/admin/top-bar-edit-sheet';
import brand_edit_sheet from '@/components/admin/brand-edit-sheet';
import { admin_sheet } from '@/components/admin/admin-sheet';
import { AdminHeader } from '@/components/admin/admin-shell';
import location_modal from '@/components/location-modal';
import order_gate_modal from '@/components/order-gate-modal';
import phone_gate_modal from '@/components/phone-gate-modal';
import pickup_slot_picker from '@/components/pickup-slot-picker';
import { add_to_cart, get_cart_items, upsert_cart_item } from '@/lib/cart';
import site_header from '@/components/site-header';
import { resolve_menu_categories } from '@/lib/menu-from-db';
import {
  delete_promo,
  get_promo_store,
  new_promo_id,
  subscribe_promo_store,
  upsert_promo,
  default_promos,
} from '@/lib/promo-store';
import {
  get_viewed_promos,
  mark_promo_viewed,
  subscribe_viewed_promos,
} from '@/lib/viewed-promos';
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
import { get_auth_state, sign_out } from '@/lib/auth';
import { create_order } from '@/lib/orders';
import { format_order_number } from '@/lib/order-number';
import { normalize_phone } from '@/lib/phone';
import { get_topping_portion_price_value } from '@/lib/product-details';
import {
  get_demo_user,
  set_demo_user,
  clear_session,
  type demo_user,
} from '@/lib/demo-auth';
import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { get_location, is_city_served, resolve_spot, set_location, get_selected_spot, type user_location } from '@/lib/location';
import { subscribe_spot_store } from '@/lib/spot-store';
import type { store_spot } from '@/lib/types';
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
import { save_brand_settings } from '@/lib/brand-store';
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

function merge_cart_line(
  lines: cart_line[],
  item: menu_item,
  qty: number,
  options?: { volume?: '450' | '650'; topping?: number; replace_key?: string }
): cart_line[] {
  const volume = options?.volume ?? '450';
  const topping = options?.topping ?? 0;
  const next_qty = Math.max(1, qty);

  // правка из корзины: жёстко заменить позицию (qty абсолютный, не +=)
  if (options?.replace_key) {
    const key = options.replace_key;
    let removed = false;
    let base = lines.filter((l, i) => {
      if (removed) return true;
      const k = l.key || cart_line_key(l, i);
      if (k === key || l.key === key) {
        removed = true;
        return false;
      }
      return true;
    });

    // ключ не совпал (гонка setState) — убираем первую позицию этого товара
    if (!removed) {
      let done = false;
      base = lines.filter((l) => {
        if (done) return true;
        if (l.item.id === item.id && !l.item.id.startsWith('topping-')) {
          done = true;
          return false;
        }
        return true;
      });
    }

    const topping_prefix = `topping-${item.category}-`;
    base = base.filter((l) => !l.item.id.startsWith(topping_prefix));

    return [
      ...base,
      {
        key,
        item,
        quantity: next_qty,
        volume,
        topping,
      },
    ];
  }

  // та же конфигурация уже в корзине — увеличить qty
  const same = lines.findIndex(
    (l) =>
      l.item.id === item.id &&
      (l.volume ?? '450') === volume &&
      (l.topping ?? 0) === topping &&
      !l.item.id.startsWith('topping-')
  );
  if (same >= 0) {
    const next = [...lines];
    next[same] = {
      ...next[same],
      key: next[same].key || `line-${item.id}-${same}`,
      quantity: next[same].quantity + next_qty,
    };
    return next;
  }

  return [
    ...lines,
    {
      key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      item,
      quantity: next_qty,
      volume,
      topping,
    },
  ];
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
  const [editing_line_key, set_editing_line_key] = useState<string | null>(null);
  const editing_line_key_ref = useRef<string | null>(null);
  const [edit_initial, set_edit_initial] = useState<{
    qty: number;
    volume: '450' | '650';
    topping: number;
  }>({ qty: 1, volume: '450', topping: 0 });
  const [cart_open, set_cart_open] = useState(false);
  const [cart_lines, set_cart_lines] = useState<cart_line[]>([]);
  const [user, set_user] = useState<demo_user | null>(null);
  const [user_id, set_user_id] = useState<string | null>(null);
  const [is_anonymous, set_is_anonymous] = useState(false);
  const [bonus, set_bonus] = useState(0);
  const [redeem_bonus, set_redeem_bonus] = useState(false);
  const [city, set_city] = useState('москва');
  const [selected_spot, set_selected_spot] = useState<store_spot | null>(null);
  const [location_open, set_location_open] = useState(false);
  const [order_gate_open, set_order_gate_open] = useState(false);
  const [phone_gate_open, set_phone_gate_open] = useState(false);
  const [pickup_picker_open, set_pickup_picker_open] = useState(false);
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
  const [story_index, set_story_index] = useState<number | null>(null);
  const [viewed_promos, set_viewed_promos] = useState<Set<string>>(() => new Set());
  const [editing_slide, set_editing_slide] = useState<sidebar_ad_slide | null>(null);
  const [editing_link, set_editing_link] = useState<top_bar_link | null>(null);
  const [editing_category, set_editing_category] = useState<string | null>(null);
  const [editing_lang, set_editing_lang] = useState(false);
  const [editing_brand, set_editing_brand] = useState<false | 'logo' | 'tagline'>(false);
  const [lang_draft, set_lang_draft] = useState({ label: 'язык', href: '/yazyk' });
  const [order_toast, set_order_toast] = useState('');
  const [order_error, set_order_error] = useState('');
  const header_ref = useRef<HTMLDivElement>(null);
  const nav_ref = useRef<HTMLDivElement>(null);
  const skip_cart_reload_until_ref = useRef(0);

  const is_admin_edit = admin_edit_mode;
  const is_staff_admin = !admin_edit_mode && user?.role === 'admin';
  const is_logged_in = demo_mode
    ? Boolean(user && user.role === 'user' && !user.is_guest)
    : Boolean(
        user_id &&
          !is_anonymous &&
          user &&
          user.role === 'user' &&
          !user.is_guest
      );
  const cart_count = cart_lines.reduce((s, l) => s + l.quantity, 0);
  const cart_total = cart_lines.reduce((s, l) => s + cart_line_unit_price(l) * l.quantity, 0);
  const active_promos = promos.filter((p) => p.is_active);

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

  function has_profile_phone() {
    return Boolean(normalize_phone(user?.phone));
  }

  function open_pickup_picker() {
    if (cart_lines.length === 0) return;
    set_pickup_picker_open(true);
  }

  async function handle_pickup_confirm(pickup_at: string, label: string) {
    set_pickup_picker_open(false);
    await proceed_checkout(pickup_at, label);
  }

  const proceed_checkout = useCallback(async (pickup_time: string, pickup_label?: string) => {
    if (cart_lines.length === 0) return;

    const uid = user_id;
    if (!uid) {
      set_order_error('войдите, чтобы оформить заказ');
      redirect_to_login();
      return;
    }

    const items = cart_lines.map((l) => ({
      menu_id: l.item.id,
      name: l.item.name,
      price: cart_line_unit_price(l),
      quantity: l.quantity,
    }));
    const total_price = cart_lines.reduce((s, l) => s + cart_line_unit_price(l) * l.quantity, 0);
    const want_redeem = redeem_bonus && bonus >= FREE_DRINK_BONUS_THRESHOLD;

    if (demo_mode) {
      const res = await fetch('/api/orders/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items,
          pickup_time,
          customer_name: user?.name || 'гость',
          customer_phone: user?.phone || null,
          redeem_bonus: want_redeem,
          client_bonus: bonus,
        }),
      });
      const body = (await res.json()) as {
        order?: import('@/lib/types').order;
        error?: string;
        bonus_balance?: number;
        bonus_redeemed?: number;
      };
      if (!res.ok) {
        set_order_error(body.error || 'не удалось оформить заказ');
        return;
      }
      if (typeof body.bonus_balance === 'number') {
        set_bonus(body.bonus_balance);
        const u = get_demo_user();
        if (u) set_demo_user({ ...u, bonus_balance: body.bonus_balance });
      } else if (want_redeem) {
        const next = Math.max(0, bonus - FREE_DRINK_BONUS_THRESHOLD);
        set_bonus(next);
        const u = get_demo_user();
        if (u) set_demo_user({ ...u, bonus_balance: next });
      }
      set_redeem_bonus(false);
      set_order_error('');
      set_cart_lines([]);
      save_guest_cart([]);
      set_cart_open(false);
      const num = body.order ? format_order_number(body.order) : '';
      const label = pickup_label || new Date(pickup_time).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      set_order_toast(
        want_redeem
          ? num
            ? `заказ № ${num} бесплатно за тапикоины — заберите в ${label}`
            : `заказ бесплатно за тапикоины — заберите в ${label}`
          : num
            ? `заказ № ${num} — заберите в ${label}`
            : `заказ отправлен — заберите в ${label}`
      );
      window.setTimeout(() => set_order_toast(''), 4500);
      if (body.order?.id) {
        const { set_active_order_id } = await import('@/lib/active-order-store');
        set_active_order_id(body.order.id);
        void (async () => {
          const { ensure_order_notify_permission, notify_order_status } = await import(
            '@/lib/order-notify'
          );
          const ok = await ensure_order_notify_permission();
          if (ok && body.order) await notify_order_status(body.order);
        })();
        router.push(`/orders/${body.order.id}`);
      }
      return;
    }

    const { data, error, meta } = await create_order({
      user_id: uid,
      items,
      total_price,
      payment_type: want_redeem ? 'bonus' : 'cash',
      pickup_time,
      redeem_bonus: want_redeem,
    });

    if (error) {
      set_order_error(error.message);
      return;
    }

    if (typeof meta?.bonus_balance === 'number') {
      set_bonus(meta.bonus_balance);
    } else if (want_redeem) {
      set_bonus((b) => Math.max(0, b - FREE_DRINK_BONUS_THRESHOLD));
    } else if (meta?.bonus_earned) {
      set_bonus((b) => b + meta.bonus_earned);
    }

    set_redeem_bonus(false);
    set_order_error('');
    set_cart_lines([]);
    set_cart_open(false);
    const num = data ? format_order_number(data) : '';
    const label = pickup_label || new Date(pickup_time).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    set_order_toast(
      want_redeem
        ? num
          ? `заказ № ${num} бесплатно за тапикоины — заберите в ${label}`
          : `заказ бесплатно за тапикоины — заберите в ${label}`
        : num
          ? `заказ № ${num} — заберите в ${label}`
          : `заказ отправлен — заберите в ${label}`
    );
    window.setTimeout(() => set_order_toast(''), 4500);
    if (data?.id) {
      const { set_active_order_id } = await import('@/lib/active-order-store');
      set_active_order_id(data.id);
      void (async () => {
        const { ensure_order_notify_permission, notify_order_status } = await import(
          '@/lib/order-notify'
        );
        const { subscribe_to_push } = await import('@/components/pwa-register');
        const ok = await ensure_order_notify_permission();
        if (ok) {
          try {
            await subscribe_to_push(uid);
          } catch {
            /* ignore */
          }
          await notify_order_status(data);
        }
      })();
      router.push(`/orders/${data.id}`);
    }
  }, [cart_lines, user_id, demo_mode, user?.name, user?.phone, redeem_bonus, bonus, router]);

  function needs_checkout_gate() {
    if (demo_mode) return false;
    const loc = get_location();
    return !(loc && is_city_served(loc.city));
  }

  function redirect_to_login() {
    const return_url = cart_lines.length > 0 ? '/?cart=1' : '/';
    router.push(`/login?returnUrl=${encodeURIComponent(return_url)}`);
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
    set_selected_spot(get_selected_spot());

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
    function reload_spot() {
      set_selected_spot(get_selected_spot());
    }
    reload_spot();
    return subscribe_spot_store(reload_spot);
  }, []);

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
    function reload_viewed() {
      set_viewed_promos(get_viewed_promos());
    }
    reload_viewed();
    return subscribe_viewed_promos(reload_viewed);
  }, []);

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
    set_categories(resolve_menu_categories(initial_menu));
    set_menu(admin_edit_mode ? initial_menu : initial_menu.filter((i) => i.is_available));
  }, [demo_mode, initial_menu, admin_edit_mode]);

  useEffect(() => {
    if (user_id) return;
    save_guest_cart(cart_lines);
  }, [cart_lines, user_id]);

  function add_to_local_cart(
    item: menu_item,
    qty: number,
    options?: { volume?: '450' | '650'; topping?: number; replace_key?: string }
  ) {
    set_cart_lines((prev) => merge_cart_line(prev, item, qty, options));
  }

  const load_prod_cart = useCallback(async (uid: string) => {
    const { data, error } = await get_cart_items(uid);
    if (error) {
      console.warn('cart load:', error.message);
      return;
    }
    set_cart_lines((prev) => {
      const by_id = new Map(prev.map((l) => [l.item.id, l]));
      const lines: cart_line[] = (data || [])
        .filter((row) => row.menu)
        .map((row, index) => {
          const item = row.menu as unknown as menu_item;
          const prev_line = by_id.get(item.id);
          return {
            item,
            quantity: row.quantity,
            // сервер не хранит volume/topping/key — сохраняем локальные
            key: prev_line?.key || `srv-${item.id}-${index}`,
            volume: prev_line?.volume ?? '450',
            topping: prev_line?.topping ?? 0,
          };
        });
      return lines;
    });
  }, []);

  const sync_guest_cart_to_server = useCallback(async (uid: string) => {
    const local = load_guest_cart();
    if (!local.length) return;

    for (const line of local) {
      await add_to_cart(uid, line.item, line.quantity);
    }
    save_guest_cart([]);
  }, []);

  useEffect(() => {
    if (demo_mode) return;

    async function load_user() {
      const auth = await get_auth_state();

      if (auth.is_permanent && auth.user_id) {
        const name = (auth.profile?.name || '').trim();
        const shown =
          name && name !== 'аккаунт' && name !== 'профиль'
            ? name
            : `id${auth.user_id.slice(0, 6)}`;

        set_user_id(auth.user_id);
        set_is_anonymous(false);
        set_bonus(auth.profile?.bonus_balance || 0);
        set_user({
          id: auth.profile?.id || auth.user_id,
          phone: auth.profile?.phone || '',
          name: shown,
          bonus_balance: auth.profile?.bonus_balance || 0,
          avatar_emoji: auth.profile?.avatar_emoji || '',
          avatar_bg: auth.profile?.avatar_bg ?? null,
          avatar_url: auth.profile?.avatar_url || null,
          is_guest: false,
          role: 'user',
        });

        await sync_guest_cart_to_server(auth.user_id);
        await load_prod_cart(auth.user_id);
        return;
      }

      set_user_id(null);
      set_is_anonymous(false);
      set_user(null);
      set_bonus(0);
      set_cart_lines(load_guest_cart());
    }

    load_user();

    const supabase = create_client();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      load_user();
    });

    window.addEventListener('focus', load_user);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', load_user);
    };
  }, [demo_mode, load_prod_cart, sync_guest_cart_to_server]);

  useEffect(() => {
    if (demo_mode || !user_id) return;
    const supabase = create_client();
    const channel = supabase
      .channel(`cart-${user_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${user_id}` },
        () => {
          if (Date.now() < skip_cart_reload_until_ref.current) return;
          void load_prod_cart(user_id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [demo_mode, user_id, load_prod_cart]);

  async function execute_add(
    item: menu_item,
    qty: number,
    options?: { volume?: '450' | '650'; topping?: number; replace_key?: string }
  ) {
    add_to_local_cart(item, qty, options);

    if (demo_mode && !user_id) return;
    if (!user_id) return;

    // при правке не делаем delta-add и не перезагружаем серверную корзину —
    // иначе затираются volume/topping и появляется «вторая» позиция
    if (options?.replace_key) {
      skip_cart_reload_until_ref.current = Date.now() + 2000;
      await upsert_cart_item(user_id, item.id, qty);
      return;
    }

    const volume_add = options?.volume === '650' ? 50 : 0;
    const topping = options?.topping ?? 0;
    const server_item: menu_item = {
      ...item,
      price: Math.max(0, item.price + volume_add + topping * get_topping_portion_price_value()),
    };

    const { error } = await add_to_cart(user_id, server_item, qty);
    if (error) {
      console.warn('cart:', error.message);
      return;
    }
    await load_prod_cart(user_id);
  }

  async function handle_add(
    item: menu_item,
    qty: number,
    options?: { volume?: '450' | '650'; topping?: number; replace_key?: string }
  ) {
    // replace_key только явно из drawer при «Изменить» — иначе upsell/quick-add
    // накладывается на редактируемую строку и удваивает qty
    const replace_key = options?.replace_key || undefined;
    await execute_add(item, qty, {
      volume: options?.volume,
      topping: options?.topping,
      replace_key,
    });
    if (replace_key) {
      editing_line_key_ref.current = null;
      set_editing_line_key(null);
      set_product_from_cart(false);
    }
  }

  async function handle_update_qty(line_key: string, quantity: number) {
    set_cart_lines((prev) =>
      prev.map((l, i) => (cart_line_key(l, i) === line_key ? { ...l, quantity } : l))
    );

    if (demo_mode && !user_id) return;
    if (!user_id) return;

    const line = cart_lines.find((l, i) => cart_line_key(l, i) === line_key);
    if (!line) return;
    const { error } = await upsert_cart_item(user_id, line.item.id, quantity);
    // не перезагружаем с сервера — иначе сотрём volume/topping
    if (error) console.warn('cart qty:', error.message);
  }

  async function handle_remove(line_key: string) {
    const line = cart_lines.find((l, i) => cart_line_key(l, i) === line_key);
    set_cart_lines((prev) => prev.filter((l, i) => cart_line_key(l, i) !== line_key));

    if (demo_mode && !user_id) return;
    if (!user_id || !line) return;
    const { error } = await upsert_cart_item(user_id, line.item.id, 0);
    if (!error) await load_prod_cart(user_id);
  }

  async function handle_clear_cart() {
    if (demo_mode && !user_id) {
      set_cart_lines([]);
      save_guest_cart([]);
      return;
    }
    if (!user_id) {
      set_cart_lines([]);
      save_guest_cart([]);
      return;
    }
    await Promise.all(cart_lines.map((line) => upsert_cart_item(user_id, line.item.id, 0)));
    await load_prod_cart(user_id);
  }

  function handle_location_confirm(loc: user_location) {
    set_location(loc);
    set_city(loc.city);
    set_saved_location(loc);
    set_selected_spot(resolve_spot(loc));
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

    if (!has_profile_phone()) {
      set_phone_gate_open(true);
      return;
    }

    open_pickup_picker();
  }

  function handle_phone_saved(phone: string) {
    set_phone_gate_open(false);
    set_user((prev) => (prev ? { ...prev, phone } : prev));
    open_pickup_picker();
  }

  function handle_edit_line(line: cart_line, line_key?: string) {
    const key =
      line_key ||
      line.key ||
      `line-${line.item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    set_cart_lines((prev) => {
      let assigned = false;
      return prev.map((l, i) => {
        const k = cart_line_key(l, i);
        if (line.key && (l.key === line.key || k === line.key)) {
          return { ...l, key };
        }
        if (line_key && (k === line_key || l.key === line_key)) {
          return { ...l, key };
        }
        if (
          !line.key &&
          !line_key &&
          !assigned &&
          l.item.id === line.item.id &&
          (l.volume ?? '450') === (line.volume ?? '450') &&
          (l.topping ?? 0) === (line.topping ?? 0)
        ) {
          assigned = true;
          return { ...l, key };
        }
        return l;
      });
    });

    set_cart_open(false);
    set_selected(line.item);
    set_product_from_cart(true);
    editing_line_key_ref.current = key;
    set_editing_line_key(key);
    set_edit_initial({
      qty: line.quantity,
      volume: line.volume ?? '450',
      topping: line.topping ?? 0,
    });
    set_drawer_open(true);
  }

  function handle_open_from_cart(item: menu_item) {
    set_cart_open(false);
    set_selected(item);
    set_product_from_cart(false);
    editing_line_key_ref.current = null;
    set_editing_line_key(null);
    set_edit_initial({ qty: 1, volume: '450', topping: 0 });
    set_drawer_open(true);
  }

  function handle_product_close() {
    set_drawer_open(false);
    set_product_from_cart(false);
    editing_line_key_ref.current = null;
    set_editing_line_key(null);
    set_selected(null);
  }

  function handle_return_to_cart() {
    set_drawer_open(false);
    set_product_from_cart(false);
    editing_line_key_ref.current = null;
    set_editing_line_key(null);
    set_selected(null);
    set_cart_open(true);
  }

  async function handle_checkout() {
    if (cart_lines.length === 0) return;

    if (demo_mode) {
      if (!is_logged_in && !user_id) {
        set_cart_open(false);
        redirect_to_login();
        return;
      }
      if (needs_checkout_gate()) {
        set_cart_open(false);
        open_order_gate({ type: 'checkout' });
        return;
      }
      open_pickup_picker();
      return;
    }

    if (!is_logged_in) {
      set_cart_open(false);
      redirect_to_login();
      return;
    }

    if (needs_checkout_gate()) {
      set_cart_open(false);
      open_order_gate({ type: 'checkout' });
      return;
    }

    if (!has_profile_phone()) {
      set_cart_open(false);
      set_phone_gate_open(true);
      return;
    }

    set_cart_open(false);
    open_pickup_picker();
  }

  function handle_order_gate_login() {
    set_order_gate_open(false);
    set_pending_action({ type: 'checkout' });
    redirect_to_login();
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
    const idx = active_promos.findIndex((p) => p.id === promo.id);
    set_story_index(idx >= 0 ? idx : 0);
  }

  function perform_promo_action(promo: promo_banner) {
    set_story_index(null);
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
      if (promo.link_url.startsWith('/')) {
        router.push(promo.link_url);
      } else {
        window.open(promo.link_url, '_blank', 'noopener,noreferrer');
      }
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
    set_is_anonymous(false);
    set_user(null);
    set_bonus(0);
    set_address_confirmed(false);
    set_cart_lines(load_guest_cart());
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
      prep_minutes: 2,
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
      {is_admin_edit &&
        createElement(AdminHeader, {
          actions: createElement(
            'button',
            {
              type: 'button',
              onClick: () => {
                if (confirm('сбросить меню к дефолту?')) reset_menu_store();
              },
              className: 'text-neutral-400 hover:text-neutral-700',
            },
            'сброс'
          ),
        })}

      <div className="hidden min-[1024px]:block bg-page border-b border-surface/70">
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
        className="sticky mobile-sticky-top z-40 bg-page"
      >
        {createElement(site_header, {
          city,
          spot_address: selected_spot?.address,
          user_name: is_admin_edit ? 'админ' : user?.role === 'admin' ? null : user?.name,
          avatar_emoji: is_admin_edit ? '🛠️' : user?.avatar_emoji,
          avatar_bg: is_admin_edit ? null : user?.avatar_bg,
          avatar_url: is_admin_edit ? null : user?.avatar_url,
          user_id: user?.id,
          bonus,
          is_logged_in: is_admin_edit ? false : is_logged_in,
          show_admin: is_staff_admin,
          edit_mode: is_admin_edit,
          on_edit_logo: is_admin_edit ? () => set_editing_brand('logo') : undefined,
          on_edit_tagline: is_admin_edit ? () => set_editing_brand('tagline') : undefined,
          on_home: handle_go_home,
          on_city_click: () => set_location_open(true),
          on_login: handle_login,
          on_logout: handle_logout,
          on_admin: () => router.push('/admin'),
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
          viewed_ids: viewed_promos,
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
              items: menu,
              on_change: set_active_category,
              on_cart_click: () => set_cart_open(true),
              on_item_click: (item: menu_item) => {
                set_selected(item);
                set_product_from_cart(false);
                editing_line_key_ref.current = null;
                set_editing_line_key(null);
                set_edit_initial({ qty: 1, volume: '450', topping: 0 });
                set_drawer_open(true);
              },
            })}
          </div>
        </div>

        <main className={`menu-sheet-main py-5 sm:py-6 ${cart_count > 0 ? 'pb-[calc(7rem+var(--safe-bottom))]' : 'pb-[calc(6rem+var(--safe-bottom))]'} sm:pb-28`}>
            <div className="page-shell min-[1024px]:flex min-[1024px]:gap-6 min-[1024px]:pr-1">
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
                    promos,
                    inline_promos: true,
                    on_promo_click: handle_promo_click,
                    viewed_promo_ids: viewed_promos,
                    on_item_click: (item: menu_item) => {
                      set_selected(item);
                      set_product_from_cart(false);
                      set_drawer_open(true);
                    },
                    on_quick_add: (item: menu_item) => {
                      void handle_add(item, 1);
                    },
                  })}
            </div>
            <aside
              className="sticky-ad-slide hidden min-[1024px]:block min-w-[200px] max-w-[280px] min-[1024px]:flex-[1.2] shrink-0 sticky z-10 self-start"
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
            edit_mode: product_from_cart,
            editing_line_key: editing_line_key,
            initial_qty: edit_initial.qty,
            initial_volume: edit_initial.volume,
            initial_topping: edit_initial.topping,
            return_to_cart: product_from_cart,
            on_return_to_cart: handle_return_to_cart,
          })}

      {!is_admin_edit && createElement(cart_drawer, {
        open: cart_open,
        lines: cart_lines,
        all_items: menu,
        bonus,
        redeem_bonus,
        on_redeem_bonus_change: set_redeem_bonus,
        on_close: () => set_cart_open(false),
        on_update_qty: handle_update_qty,
        on_remove: handle_remove,
        on_add: handle_add,
        on_open_item: handle_open_from_cart,
        on_edit: handle_edit_line,
        on_checkout: handle_checkout,
        on_clear: handle_clear_cart,
      })}

      {!is_admin_edit &&
        createElement(cart_fab, {
          count: cart_count,
          total: cart_total,
          on_click: () => set_cart_open(true),
        })}

      {!is_admin_edit && story_index !== null &&
        createElement(promo_story_viewer, {
          promos: active_promos,
          start_index: story_index,
          open: true,
          on_close: () => set_story_index(null),
          on_action: perform_promo_action,
          on_view: (promo: promo_banner) => mark_promo_viewed(promo.id),
        })}

      {is_admin_edit && createElement(promo_edit_sheet, {
        promo: editing_promo,
        categories,
        on_close: () => set_editing_promo(null),
        on_save: (promo, page) => {
          upsert_promo({ ...promo, id: promo.id || new_promo_id() });
          if (page) upsert_page(page);
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

      {is_admin_edit && createElement(brand_edit_sheet, {
        open: editing_brand !== false,
        focus: editing_brand === false ? 'all' : editing_brand,
        on_close: () => set_editing_brand(false),
        on_save: save_brand_settings,
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
                className="flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium"
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

      {!is_admin_edit && createElement(phone_gate_modal, {
        open: phone_gate_open,
        on_close: () => set_phone_gate_open(false),
        on_saved: handle_phone_saved,
      })}

      {!is_admin_edit && createElement(pickup_slot_picker, {
        open: pickup_picker_open,
        cart_lines: cart_lines.map((l) => ({
          menu_id: l.item.id,
          name: l.item.name,
          quantity: l.quantity,
        })),
        on_close: () => set_pickup_picker_open(false),
        on_confirm: handle_pickup_confirm,
      })}

      {!is_admin_edit && createElement(location_modal, {
        open: location_open,
        on_close: () => set_location_open(false),
        on_confirm: handle_location_confirm,
      })}

      {order_toast && (
        <div className="fixed bottom-[calc(1.5rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-2xl bg-neutral-900 text-white text-sm shadow-lg min-[1024px]:bottom-6">
          {order_toast}
        </div>
      )}

      {order_error && (
        <div className="fixed bottom-[calc(1.5rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-2xl bg-red-600 text-white text-sm shadow-lg min-[1024px]:bottom-6 max-w-[90vw] text-center">
          {order_error}
        </div>
      )}
    </div>
  );
}
