'use client';

import { createElement, useEffect, useState } from 'react';
import type { menu_item, promo_banner, sidebar_ad_slide } from '@/lib/types';
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
} from '@/lib/menu-store';
import {
  delete_promo,
  get_promo_store,
  new_promo_id,
  subscribe_promo_store,
  upsert_promo,
} from '@/lib/promo-store';
import {
  delete_sidebar_slide,
  get_sidebar_ad_store,
  new_sidebar_slide_id,
  subscribe_sidebar_ad_store,
  upsert_sidebar_slide,
} from '@/lib/sidebar-ad-store';
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
import top_bar from '@/components/top-bar';
import promo_banners from '@/components/promo-banners';
import category_nav from '@/components/category-nav';
import sidebar_ad from '@/components/sidebar-ad';
import menu_grid_admin, { desktop_category_heading_offset } from '@/components/admin/menu-grid-admin';
import product_drawer_admin from '@/components/admin/product-drawer-admin';
import promo_edit_sheet from '@/components/admin/promo-edit-sheet';
import sidebar_edit_sheet from '@/components/admin/sidebar-edit-sheet';
import top_bar_edit_sheet from '@/components/admin/top-bar-edit-sheet';
import category_edit_sheet from '@/components/admin/category-edit-sheet';
import { admin_sheet } from '@/components/admin/admin-sheet';
import AdminShell from '@/components/admin/admin-shell';

const sticky_ad_gap = 10;

export default function menu_manage() {
  const [categories, set_categories] = useState<string[]>([]);
  const [items, set_items] = useState<menu_item[]>([]);
  const [promos, set_promos] = useState<promo_banner[]>([]);
  const [sidebar_slides, set_sidebar_slides] = useState<sidebar_ad_slide[]>([]);
  const [active_category, set_active_category] = useState<string | null>(null);
  const [selected, set_selected] = useState<menu_item | null>(null);
  const [drawer_open, set_drawer_open] = useState(false);
  const [editing_promo, set_editing_promo] = useState<promo_banner | null>(null);
  const [editing_slide, set_editing_slide] = useState<sidebar_ad_slide | null>(null);
  const [editing_link, set_editing_link] = useState<top_bar_link | null>(null);
  const [editing_category, set_editing_category] = useState<string | null>(null);
  const [editing_lang, set_editing_lang] = useState(false);
  const [lang_draft, set_lang_draft] = useState({ label: 'язык', href: '/yazyk' });

  function reload_menu() {
    const store = get_menu_store();
    set_categories(store.categories);
    set_items(store.items);
  }

  function reload_promos() {
    set_promos(get_promo_store().promos);
  }

  function reload_sidebar() {
    set_sidebar_slides(get_sidebar_ad_store().slides);
  }

  function reload_lang() {
    set_lang_draft(get_site_content_store().lang_link);
  }

  useEffect(() => {
    reload_menu();
    reload_promos();
    reload_sidebar();
    reload_lang();
    const unsubs = [
      subscribe_menu_store(reload_menu),
      subscribe_promo_store(reload_promos),
      subscribe_sidebar_ad_store(reload_sidebar),
      subscribe_site_content_store(reload_lang),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  function handle_update_item(item: menu_item) {
    upsert_menu_item(item);
    reload_menu();
  }

  function handle_add_item(category: string) {
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
    reload_menu();
    set_selected(created);
    set_drawer_open(true);
  }

  function handle_delete_item(id: string) {
    delete_menu_item(id);
    if (selected?.id === id) {
      set_drawer_open(false);
      set_selected(null);
    }
    reload_menu();
  }

  function handle_add_category() {
    const name = prompt('название новой категории');
    if (!name?.trim()) return;
    add_category(name.trim());
    reload_menu();
  }

  function handle_reset_menu() {
    if (confirm('сбросить меню к дефолту?')) {
      reset_menu_store();
      reload_menu();
    }
  }

  return (
    <AdminShell
      wide
      actions={
        <button
          type="button"
          onClick={handle_reset_menu}
          className="rounded-pill border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          сброс меню
        </button>
      }
    >
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-neutral-900">настройка меню</h1>
        <p className="text-xs text-neutral-500">названия, объём, состав, похожие, топпинги и фото</p>
      </div>

      <div className="bg-page border-b border-surface/70">
        {createElement(top_bar, {
          edit_mode: true,
          on_edit_link: set_editing_link,
          on_add_link: () =>
            set_editing_link({
              id: '',
              label: 'новый раздел',
              href: '/',
              is_active: true,
            }),
          on_edit_lang: () => {
            reload_lang();
            set_editing_lang(true);
          },
        })}
      </div>

      {active_category === null &&
        createElement(promo_banners, {
          promos,
          on_promo_click: () => {},
          edit_mode: true,
          on_edit_promo: set_editing_promo,
          on_add_promo: () =>
            set_editing_promo({
              id: '',
              title: 'новая акция',
              image_url: '',
              is_active: true,
            }),
        })}

      <section className="menu-sheet">
        <div className="menu-sheet-head">
          <div className="menu-sheet-nav-box">
            {createElement(category_nav, {
              categories,
              active: active_category,
              cart_count: 0,
              cart_total: 0,
              on_change: set_active_category,
              on_cart_click: () => {},
              edit_mode: true,
              on_edit_category: set_editing_category,
              on_add_category: handle_add_category,
            })}
          </div>
        </div>

        <main className="menu-sheet-main py-5 sm:py-6 pb-24 sm:pb-28">
          <div className="page-shell min-[1024px]:hidden mb-6">
            <p className="text-xs text-neutral-500 mb-2">рекламный баннер (на десктопе справа)</p>
            {createElement(sidebar_ad, {
              slides: sidebar_slides,
              on_slide_click: () => {},
              edit_mode: true,
              on_edit_slide: set_editing_slide,
              on_add_slide: () =>
                set_editing_slide({
                  id: '',
                  title: 'новый баннер',
                  image_url: '',
                  is_active: true,
                }),
            })}
          </div>
          <div className="page-shell min-[1024px]:flex min-[1024px]:gap-2">
            <div className="min-w-0 min-[1024px]:flex-[4]">
              {createElement(menu_grid_admin, {
                items,
                categories,
                active_category: active_category ?? undefined,
                on_item_click: (item) => {
                  set_selected(item);
                  set_drawer_open(true);
                },
                on_update_item: handle_update_item,
                on_add_item: handle_add_item,
                on_delete_item: handle_delete_item,
              })}
            </div>
            <aside
              className="hidden min-[1024px]:block min-w-0 min-[1024px]:flex-[1.85] shrink-0 sticky z-10 self-start"
              style={{
                top: sticky_ad_gap + 120,
                marginTop: active_category === null ? desktop_category_heading_offset : 0,
              }}
            >
              {createElement(sidebar_ad, {
                slides: sidebar_slides,
                on_slide_click: () => {},
                edit_mode: true,
                on_edit_slide: set_editing_slide,
                on_add_slide: () =>
                  set_editing_slide({
                    id: '',
                    title: 'новый баннер',
                    image_url: '',
                    is_active: true,
                  }),
              })}
            </aside>
          </div>
        </main>
      </section>

      {createElement(product_drawer_admin, {
        item: selected,
        open: drawer_open,
        on_close: () => {
          set_drawer_open(false);
          set_selected(null);
        },
        on_save: (item) => {
          upsert_menu_item(item);
          reload_menu();
        },
        on_delete: handle_delete_item,
      })}

      {createElement(promo_edit_sheet, {
        promo: editing_promo,
        categories,
        on_close: () => set_editing_promo(null),
        on_save: (promo) => {
          upsert_promo({ ...promo, id: promo.id || new_promo_id() });
          reload_promos();
        },
        on_delete: (id) => {
          delete_promo(id);
          reload_promos();
        },
      })}

      {createElement(sidebar_edit_sheet, {
        slide: editing_slide,
        categories,
        on_close: () => set_editing_slide(null),
        on_save: (slide) => {
          upsert_sidebar_slide({ ...slide, id: slide.id || new_sidebar_slide_id() });
          reload_sidebar();
        },
        on_delete: (id) => {
          delete_sidebar_slide(id);
          reload_sidebar();
        },
      })}

      {createElement(top_bar_edit_sheet, {
        link: editing_link,
        on_close: () => set_editing_link(null),
        on_save: (link, page) => {
          upsert_top_bar_link({ ...link, id: link.id || new_top_bar_link_id() });
          if (page) upsert_page(page);
        },
        on_delete: (id) => delete_top_bar_link(id),
      })}

      {createElement(category_edit_sheet, {
        category: editing_category,
        item_count: editing_category
          ? items.filter((i) => i.category === editing_category).length
          : 0,
        on_close: () => set_editing_category(null),
        on_rename: (old_name, new_name) => {
          rename_category(old_name, new_name);
          if (active_category === old_name) set_active_category(new_name.trim().toLowerCase());
          reload_menu();
        },
        on_delete: (name) => {
          delete_category(name);
          if (active_category === name) set_active_category(null);
          reload_menu();
        },
      })}

      {createElement(admin_sheet, {
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
    </AdminShell>
  );
}
