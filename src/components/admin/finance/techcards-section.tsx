'use client';

import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { menu_item } from '@/lib/types';
import {
  base_unit_label,
  format_rub,
  material_cost,
  material_is_infinite,
  derive_size_from_base,
  effective_card_size,
  size_label,
  sync_tech_cards_with_menu,
  tech_card_cost,
  tech_card_removed_keys,
  type material,
  type tech_card,
  type tech_card_size,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import PrepStepsEditor from '@/components/admin/finance/prep-steps-editor';
import ComboSection from '@/components/admin/finance/combo-section';
import MenuItemFields from '@/components/admin/finance/menu-item-fields';
import { default_combo, normalize_combo } from '@/lib/combo';
import {
  drink_temp_label,
  drink_temps,
  menu_temp_switches,
  type drink_temp,
} from '@/components/menu-temp-marks';
import { item_categories, item_in_category } from '@/lib/menu-item-categories';
import {
  apply_steps_to_card,
  card_steps_base_ml,
  resolved_card_prep_steps,
} from '@/lib/finance/prep-steps';
import {
  default_drink_volumes,
  get_composition_text,
  get_item_volumes,
  normalize_volumes,
  volumes_from_size_keys,
} from '@/lib/product-details';
import {
  add_category,
  apply_published_menu_store,
  delete_category,
  get_menu_store,
  new_item_id,
  settle_menu_publish,
  upsert_menu_item,
} from '@/lib/menu-store';
import DrinkCraft from '@/components/seller/drink-craft';
import { product_photo_button } from '@/components/admin/product-photo-picker';
import {
  Card,
  DrinkThumb,
  EmptyState,
  NumInput,
  btn_ghost_danger,
  btn_secondary,
  chip_active,
  chip_idle,
  field_class,
} from '@/components/admin/finance/ui';

const skip_categories = new Set(['комбо', 'закуски', 'добавки']);

function is_combo(item: menu_item) {
  return item_in_category(item, 'комбо') || item.category === 'комбо';
}

function is_drink(item: menu_item) {
  return !skip_categories.has(item.category) && !is_combo(item);
}

function visibility_eye({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9.5 5.6A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.4 4.1M6.2 6.3C3.5 8 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.4 4-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function visibility_button({ item, on_toggle }: { item: menu_item; on_toggle: () => void }) {
  const open = item.is_available !== false;
  return (
    <button
      type="button"
      aria-label={open ? `скрыть «${item.name}» с сайта` : `показать «${item.name}» на сайте`}
      aria-pressed={open}
      onClick={(e) => {
        e.stopPropagation();
        on_toggle();
      }}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        open ? 'bg-neutral-100 text-neutral-800' : 'bg-neutral-900 text-white'
      }`}
    >
      {visibility_eye({ open })}
    </button>
  );
}

function PricePill({
  label,
  value,
  cost,
  on_change,
}: {
  label?: string;
  value: number;
  cost?: number;
  on_change: (next: number) => void;
}) {
  const [editing, set_editing] = useState(false);
  const [draft, set_draft] = useState(String(value));

  function commit() {
    const next = Math.max(0, Math.round(Number(draft) || 0));
    on_change(next);
    set_draft(String(next));
    set_editing(false);
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {label ? <span className="text-xs font-normal text-neutral-400">{label}</span> : null}
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          value={draft}
          aria-label={label ? `цена ${label}` : 'цена'}
          onChange={(e) => set_draft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              set_draft(String(value));
              set_editing(false);
            }
          }}
          className="w-20 rounded-full border border-accent/30 bg-white px-3 py-1.5 text-center text-sm font-medium text-neutral-900 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            set_draft(String(value));
            set_editing(true);
          }}
          className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-200/80"
        >
          {value} ₽
        </button>
      )}
      {cost != null && cost > 0 ? (
        <span className="text-xs font-normal text-neutral-400">себест. {format_rub(cost, 1)}</span>
      ) : null}
    </span>
  );
}

function menu_row({
  item,
  selected,
  card,
  on_pick,
  on_visible,
  on_archive,
}: {
  item: menu_item;
  selected: boolean;
  card: tech_card | null | undefined;
  on_pick: () => void;
  on_visible: () => void;
  on_archive: () => void;
}) {
  const drink = is_drink(item);
  const empty =
    drink &&
    (!card || !Object.values(card.sizes).some((size) => Object.keys(size.ingredients).length > 0));
  const subtitle = is_combo(item)
    ? 'комбо'
    : drink
      ? empty
        ? 'рецепт не заполнен'
        : 'рецепт'
      : item.category;
  return (
    <div
      className={`flex items-center rounded-2xl bg-white shadow-soft ring-1 transition-colors ${
        selected ? 'ring-accent/50 bg-accent/5' : 'ring-neutral-200/80 hover:ring-accent/30'
      }`}
    >
      <button
        type="button"
        onClick={on_pick}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
      >
        <DrinkThumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-neutral-900">{item.name}</span>
          <span className="text-[11px] font-normal text-neutral-400">
            {subtitle}
            {` · ${item.price} ₽`}
          </span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1 pr-2">
        {visibility_button({ item, on_toggle: on_visible })}
        {archive_button({ item, on_toggle: on_archive })}
      </span>
    </div>
  );
}

function archive_button({ item, on_toggle }: { item: menu_item; on_toggle: () => void }) {
  const archived = item.archived === true;
  return (
    <button
      type="button"
      aria-label={archived ? `вернуть «${item.name}» из архива` : `в архив «${item.name}»`}
      aria-pressed={archived}
      onClick={(e) => {
        e.stopPropagation();
        on_toggle();
      }}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        archived ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-800'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.4 7.4l.7 11.4A1.6 1.6 0 0 0 8.7 20.4h6.6a1.6 1.6 0 0 0 1.6-1.6l.7-11.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M10 11v5.5M14 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function pack_item(draft: menu_item): menu_item {
  const nutrition = draft.nutrition ?? { kcal: 0, protein: 0, fat: 0, carb: 0 };
  const combo = is_combo(draft)
    ? normalize_combo(draft.combo) ?? default_combo()
    : undefined;
  return {
    ...draft,
    name: draft.name.trim() || 'без названия',
    price: Math.max(0, Math.round(draft.price)),
    composition: (draft.composition ?? '').trim(),
    nutrition: {
      kcal: Math.max(0, Math.round(Number(nutrition.kcal) || 0)),
      protein: Math.max(0, Number(nutrition.protein) || 0),
      fat: Math.max(0, Number(nutrition.fat) || 0),
      carb: Math.max(0, Number(nutrition.carb) || 0),
    },
    volumes: is_combo(draft) ? [] : normalize_volumes(draft.volumes),
    ...(combo ? { combo, has_toppings: false } : {}),
  };
}

function link_card(card: tech_card, item: menu_item): tech_card {
  return {
    ...card,
    name: item.name,
    cold: item.cold,
    hot: item.hot,
    menu_item_id: is_drink(item) ? item.id : card.menu_item_id,
  };
}

function item_with_card_volumes(item: menu_item, card: tech_card): menu_item {
  const volumes = volumes_from_size_keys(Object.keys(card.sizes), item.volumes);
  return { ...item, volumes };
}

export default function TechcardsSection({
  state,
  set_state,
  menu,
  set_menu,
  flush,
  reload,
  start_craft = false,
}: section_props & { start_craft?: boolean }) {
  const router = useRouter();
  const drinks = useMemo(
    () => [...menu].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [menu]
  );
  const active = useMemo(() => drinks.filter((item) => item.archived !== true), [drinks]);
  const archived = useMemo(() => drinks.filter((item) => item.archived === true), [drinks]);
  const [selected_id, set_selected_id] = useState<string | null>(null);
  const [query, set_query] = useState('');
  const [folder, set_folder] = useState<'cards' | 'archive'>('cards');
  const [category, set_category] = useState('все');
  const [store_categories, set_store_categories] = useState<string[]>([]);
  const [purge_error, set_purge_error] = useState('');
  const [craft_open, set_craft_open] = useState(start_craft);
  const [draft, set_draft] = useState<menu_item | null>(null);
  const [recipe_size_key, set_recipe_size_key] = useState('');
  const [recipe_temp, set_recipe_temp] = useState<drink_temp>('cold');
  const catalog_ready = useRef(false);
  const pending_item = useRef<menu_item | null>(null);
  const item_timer = useRef<number | undefined>(undefined);
  const flush_item_ref = useRef<() => void>(() => {});

  const menu_by_id = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const card_by_menu = useMemo(() => {
    const map = new Map<string, tech_card>();
    for (const card of state.techCards) {
      if (card.menu_item_id) map.set(card.menu_item_id, card);
    }
    return map;
  }, [state.techCards]);

  const derived_categories = useMemo(() => {
    const found = new Set<string>();
    for (const item of menu) {
      for (const name of item_categories(item)) found.add(name);
    }
    return [...found];
  }, [menu]);
  const categories = store_categories.length ? store_categories : derived_categories;

  useEffect(() => {
    let stop = false;
    fetch('/api/menu', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { store?: { items?: menu_item[]; categories?: string[] } } | null) => {
        if (stop || !body?.store?.items?.length) {
          catalog_ready.current = true;
          return;
        }
        const applied = apply_published_menu_store(body.store as Parameters<typeof apply_published_menu_store>[0]);
        set_store_categories(applied?.categories ?? body.store.categories ?? []);
        catalog_ready.current = true;
        flush_item_ref.current();
      })
      .catch(() => {
        catalog_ready.current = true;
      });
    return () => {
      stop = true;
    };
  }, []);

  const pool = folder === 'archive' ? archived : active;
  const visible = pool.filter((item) => {
    if (category !== 'все' && !item_in_category(item, category)) return false;
    if (query && !item.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const recipe_items = visible.filter((item) => is_drink(item));
  const combo_items = visible.filter((item) => is_combo(item));
  const other_items = visible.filter((item) => !is_drink(item) && !is_combo(item));
  const selected_drink = selected_id ? menu_by_id.get(selected_id) ?? drinks.find((item) => item.id === selected_id) : null;
  const card = selected_id ? card_by_menu.get(selected_id) ?? null : null;

  useEffect(() => {
    if (!selected_drink) {
      set_draft(null);
      return;
    }
    set_draft((prev) => (prev?.id === selected_drink.id ? prev : selected_drink));
  }, [selected_drink]);

  useEffect(() => {
    if (!draft || !card || draft.id !== card.menu_item_id) return;
    const synced = item_with_card_volumes(draft, card);
    if (
      JSON.stringify(normalize_volumes(synced.volumes)) ===
      JSON.stringify(normalize_volumes(draft.volumes))
    ) {
      return;
    }
    edit_item(synced);
  }, [draft?.id, card?.id, card ? Object.keys(card.sizes).sort().join(',') : '']);

  function flush_item() {
    window.clearTimeout(item_timer.current);
    const next = pending_item.current;
    if (!next) return;
    if (!catalog_ready.current) {
      item_timer.current = window.setTimeout(() => flush_item_ref.current(), 300);
      return;
    }
    pending_item.current = null;
    const packed = pack_item(next);
    upsert_menu_item(packed);
    if (!is_drink(packed)) {
      set_state((prev) => ({
        ...prev,
        techCards: prev.techCards.map((row) =>
          row.menu_item_id === packed.id ? { ...row, name: packed.name, cold: packed.cold, hot: packed.hot } : row
        ),
      }));
      return;
    }
    set_state((prev) => {
      const existing = prev.techCards.find((row) => row.menu_item_id === packed.id);
      if (!existing) return sync_tech_cards_with_menu(prev, [packed]);
      return {
        ...prev,
        techCards: prev.techCards.map((row) => (row.menu_item_id === packed.id ? link_card(row, packed) : row)),
      };
    });
  }

  flush_item_ref.current = flush_item;
  useEffect(() => () => flush_item_ref.current(), []);

  function edit_item(next: menu_item) {
    set_draft(next);
    set_menu?.((prev) => prev.map((row) => (row.id === next.id ? next : row)));
    pending_item.current = next;
    window.clearTimeout(item_timer.current);
    item_timer.current = window.setTimeout(flush_item, 400);
  }

  function commit_item(next: menu_item) {
    if (draft?.id === next.id) {
      edit_item(next);
      return;
    }
    set_menu?.((prev) => prev.map((row) => (row.id === next.id ? next : row)));
    pending_item.current = next;
    window.clearTimeout(item_timer.current);
    item_timer.current = window.setTimeout(flush_item, 400);
  }

  function toggle_visible(item: menu_item) {
    commit_item({ ...item, is_available: item.is_available === false });
  }

  function toggle_archive(item: menu_item) {
    const next_archived = item.archived !== true;
    commit_item({
      ...item,
      archived: next_archived,
      is_available: next_archived ? false : item.is_available,
    });
    if (next_archived && selected_id === item.id) set_selected_id(null);
  }

  function pick(item: menu_item) {
    flush_item();
    set_selected_id(item.id);
    set_recipe_size_key('');
    set_recipe_temp('cold');
  }

  useEffect(() => {
    if (!selected_id) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [selected_id]);

  function ensure_card(item: menu_item) {
    set_state((prev) => {
      const drop = new Set([item.id, `tc_${item.id}`, `name:${item.name.trim().toLowerCase()}`]);
      const removedTechCardIds = (prev.removedTechCardIds ?? []).filter((id) => !drop.has(id));
      const next = sync_tech_cards_with_menu({ ...prev, removedTechCardIds }, [item]);
      const created = next.techCards.find((row) => row.menu_item_id === item.id);
      if (created) {
        const synced = item_with_card_volumes(item, created);
        if (JSON.stringify(normalize_volumes(synced.volumes)) !== JSON.stringify(normalize_volumes(item.volumes))) {
          queueMicrotask(() => edit_item(synced));
        }
      }
      return next;
    });
  }

  function remove_card(card: tech_card) {
    if (!window.confirm(`убрать рецепт «${card.name}»? из базы он тоже пропадёт`)) return;
    set_state((prev) => ({
      ...prev,
      techCards: prev.techCards.filter((row) => row.id !== card.id),
      removedTechCardIds: [...new Set([...(prev.removedTechCardIds ?? []), ...tech_card_removed_keys(card)])],
    }));
    if (card.menu_item_id) {
      const base =
        (draft?.id === card.menu_item_id ? draft : null) ?? menu_by_id.get(card.menu_item_id) ?? null;
      if (base) edit_item({ ...base, volumes: [] });
    }
  }

  async function purge_item(item: menu_item) {
    if (!window.confirm(`удалить «${item.name}» навсегда? позиция и рецепт пропадут из базы`)) return;
    set_purge_error('');
    const loaded = await fetch('/api/admin/menu', { credentials: 'same-origin' });
    const body = (await loaded.json()) as { store?: { items?: menu_item[]; removed_item_ids?: string[]; categories?: string[] } };
    const store = body.store;
    if (!loaded.ok || !store?.items?.length || !store.categories) {
      set_purge_error('не удалось открыть меню');
      return;
    }
    const removed_item_ids = [...new Set([...(store.removed_item_ids ?? []), item.id])];
    const next_store = {
      ...store,
      items: store.items.filter((row) => row.id !== item.id),
      removed_item_ids,
    };
    const saved = await fetch('/api/admin/menu', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next_store),
    });
    if (!saved.ok) {
      set_purge_error('не удалось удалить из базы');
      return;
    }
    apply_published_menu_store(next_store as Parameters<typeof apply_published_menu_store>[0]);
    const existing = card_by_menu.get(item.id);
    const tombstone = existing ?? { id: `tc_${item.id}`, name: item.name, menu_item_id: item.id, sizes: {} };
    set_state((prev) => ({
      ...prev,
      techCards: prev.techCards.filter((row) => row.id !== tombstone.id && row.menu_item_id !== item.id),
      removedTechCardIds: [...new Set([...(prev.removedTechCardIds ?? []), ...tech_card_removed_keys(tombstone)])],
    }));
    set_menu?.((prev) => prev.filter((row) => row.id !== item.id));
    set_selected_id(null);
    set_draft(null);
  }

  function set_card_temp(card: tech_card, drink: menu_item, patch: { cold?: boolean; hot?: boolean }) {
    const cold = patch.cold ?? card.cold ?? Boolean(drink.cold);
    const hot = patch.hot ?? card.hot ?? Boolean(drink.hot);
    update_card(card.id, (row) => ({ ...row, cold, hot }));
    edit_item({ ...(draft ?? drink), cold, hot });
  }

  function sync_menu_volumes_from_card(card: tech_card) {
    if (!card.menu_item_id) return;
    const base =
      (draft?.id === card.menu_item_id ? draft : null) ?? menu_by_id.get(card.menu_item_id) ?? null;
    if (!base) return;
    const synced = item_with_card_volumes(base, card);
    if (
      JSON.stringify(normalize_volumes(synced.volumes)) ===
      JSON.stringify(normalize_volumes(base.volumes))
    ) {
      return;
    }
    edit_item(synced);
  }

  function update_card(id: string, fn: (c: tech_card) => tech_card) {
    set_state((prev) => {
      const before = prev.techCards.find((c) => c.id === id);
      const next_cards = prev.techCards.map((c) => (c.id === id ? fn(c) : c));
      const card = next_cards.find((c) => c.id === id);
      if (
        card &&
        before &&
        Object.keys(before.sizes).sort().join(',') !== Object.keys(card.sizes).sort().join(',')
      ) {
        queueMicrotask(() => sync_menu_volumes_from_card(card));
      }
      return { ...prev, techCards: next_cards };
    });
  }

  function update_size(id: string, key: string, fn: (s: tech_card_size) => tech_card_size) {
    update_card(id, (c) => {
      const next = fn(c.sizes[key] ?? { volume: 0, ingredients: {}, packaging: {} });
      const sizes = { ...c.sizes, [key]: next };
      if (key === '500' && sizes['650'] && !sizes['650'].manual) {
        sizes['650'] = derive_size_from_base(next, 650, state.materials);
      }
      return { ...c, sizes };
    });
  }

  function refresh_categories() {
    set_store_categories(get_menu_store().categories);
  }

  function add_position() {
    flush_item();
    const cat = category === 'все' ? categories[0] : category;
    if (!cat) return;
    const as_combo = cat === 'комбо';
    const as_drink = is_drink({ category: cat } as menu_item);
    const combo = as_combo ? default_combo(2, 500) : undefined;
    const created: menu_item = {
      id: new_item_id(),
      name: as_combo ? 'новое комбо' : 'новая позиция',
      price: 0,
      image_url: null,
      category: cat,
      categories: [cat],
      is_available: true,
      recommendations: [],
      prep_minutes: 2,
      has_toppings: as_combo ? false : true,
      volumes: as_drink ? default_drink_volumes.map((row) => ({ ...row })) : [],
      composition: as_combo ? '2 напитка 500 мл на выбор' : '',
      nutrition: { kcal: 0, protein: 0, fat: 0, carb: 0 },
      ...(combo ? { combo } : {}),
    };
    upsert_menu_item(created);
    set_menu?.((prev) => [...prev, created]);
    if (as_drink) ensure_card(created);
    set_folder('cards');
    set_selected_id(created.id);
    set_draft(created);
  }

  async function open_craft() {
    flush_item();
    settle_menu_publish();
    await flush?.();
    set_craft_open(true);
  }

  function close_craft() {
    set_craft_open(false);
    if (start_craft) router.replace('/admin/menu');
  }

  async function after_craft(item_id?: string) {
    const menu_res = await fetch('/api/menu', { cache: 'no-store' });
    const body = (await menu_res.json().catch(() => null)) as {
      store?: { items?: menu_item[]; categories?: string[] };
    } | null;
    if (body?.store?.items?.length) {
      const applied = apply_published_menu_store(body.store as Parameters<typeof apply_published_menu_store>[0]);
      set_store_categories(applied?.categories ?? body.store.categories ?? []);
      set_menu?.(() => body.store?.items ?? []);
    }
    await reload?.();
    if (item_id) {
      set_folder('cards');
      set_selected_id(item_id);
    }
  }

  const raw_materials = state.materials.filter((m) => m.category !== 'packaging' && !material_is_infinite(m));
  const pack_materials = state.materials.filter((m) => m.category === 'packaging' && !material_is_infinite(m));
  const show_detail = Boolean(selected_drink && draft);
  const drink_selected = Boolean(draft && is_drink(draft));

  const can_back = show_detail || folder === 'archive';

  function go_back() {
    if (show_detail) {
      set_selected_id(null);
      return;
    }
    if (folder === 'archive') {
      set_folder('cards');
      set_selected_id(null);
      set_query('');
    }
  }

  return (
    <>
      <div className="mb-5">
        {can_back ? (
          <button
            type="button"
            onClick={go_back}
            className="font-heading-soft text-2xl tracking-tight text-neutral-900"
          >
            меню
            <span className="menu-back-arrow" aria-hidden>
              {'<'}
            </span>
          </button>
        ) : (
          <h1 className="font-heading-soft text-2xl tracking-tight text-neutral-900">меню</h1>
        )}
      </div>
    <div className="relative lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-4">
      <div className={show_detail ? 'hidden lg:block' : ''}>
        {folder === 'archive' ? (
          <button
            type="button"
            className="mb-3 text-sm text-accent"
            onClick={() => {
              set_folder('cards');
              set_selected_id(null);
              set_query('');
            }}
          >
            ← к меню
          </button>
        ) : null}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {['все', ...categories].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => set_category(name)}
              className={`shrink-0 capitalize ${category === name ? chip_active : `${chip_idle} border border-neutral-200 bg-white`}`}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('название категории');
              if (!name?.trim() || !catalog_ready.current) return;
              add_category(name.trim());
              refresh_categories();
              set_category(name.trim().toLowerCase());
            }}
            className="shrink-0 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-400"
          >
            + категория
          </button>
        </div>
        {category !== 'все' ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`удалить категорию «${category}» и её позиции?`)) return;
              delete_category(category);
              const store = get_menu_store();
              set_store_categories(store.categories);
              set_menu?.(() => store.items);
              set_category('все');
              set_selected_id(null);
            }}
            className="mb-2 text-xs text-neutral-400 hover:text-red-500"
          >
            удалить эту категорию
          </button>
        ) : null}
        <div className="mb-3 flex items-center gap-2">
          <input
            className={field_class}
            placeholder={folder === 'archive' ? 'найти в архиве…' : 'найти позицию…'}
            value={query}
            onChange={(e) => set_query(e.target.value)}
          />
          <button
            type="button"
            aria-label="крафт"
            onClick={() => void open_craft()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-900 text-2xl leading-none text-white"
          >
            +
          </button>
        </div>
        {folder === 'archive' ? (
          <p className="mb-2 text-[11px] font-normal text-neutral-400">архив хранится в базе, пока позицию не удалить навсегда</p>
        ) : null}
        {purge_error ? <p className="mb-2 text-sm text-red-500">{purge_error}</p> : null}
        {visible.length ? (
          <div className="space-y-4">
            {recipe_items.length || other_items.length ? (
              <ul className="space-y-1">
                {[...recipe_items, ...other_items].map((item) => (
                  <li key={item.id}>
                    {menu_row({
                      item,
                      selected: selected_id === item.id,
                      card: card_by_menu.get(item.id),
                      on_pick: () => pick(item),
                      on_visible: () => toggle_visible(item),
                      on_archive: () => toggle_archive(item),
                    })}
                  </li>
                ))}
              </ul>
            ) : null}
            {combo_items.length ? (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-900">комбо</p>
                <p className="mb-2 text-[11px] text-neutral-400">не рецепты — наборы для сайта</p>
                <ul className="space-y-1">
                  {combo_items.map((item) => (
                    <li key={item.id}>
                      {menu_row({
                        item,
                        selected: selected_id === item.id,
                        card: null,
                        on_pick: () => pick(item),
                        on_visible: () => toggle_visible(item),
                        on_archive: () => toggle_archive(item),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState>{folder === 'archive' ? 'в архиве пусто' : 'в этом разделе пусто'}</EmptyState>
        )}
        {folder === 'cards' ? (
          <button
            type="button"
            onClick={add_position}
            className="mt-3 text-xs text-neutral-400 hover:text-neutral-700"
          >
            новая позиция
          </button>
        ) : null}
        {folder === 'cards' ? (
          <button
            type="button"
            onClick={() => {
              set_folder('archive');
              set_selected_id(null);
              set_query('');
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-neutral-100 px-3 py-2.5 text-left ring-1 ring-neutral-200/80 transition-colors hover:bg-neutral-200/60"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-neutral-500 ring-1 ring-black/5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M6.4 7.4l.7 11.4A1.6 1.6 0 0 0 8.7 20.4h6.6a1.6 1.6 0 0 0 1.6-1.6l.7-11.4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M10 11v5.5M14 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-neutral-900">архив {archived.length}</span>
              <span className="text-[11px] font-normal text-neutral-400">позиции, убранные корзиной</span>
            </span>
          </button>
        ) : null}
      </div>

      {show_detail && draft && selected_drink ? (
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="relative">
            <Card>
            <div className="mb-4 flex items-start gap-3">
              {createElement(product_photo_button, {
                on_save: (url: string) => edit_item({ ...draft, image_url: url }),
                className: 'shrink-0 rounded-3xl',
                title: 'фото',
                children: <DrinkThumb item={draft} size="xl" />,
              })}
              <div className="min-w-0 max-w-[16rem] sm:max-w-[20rem]">
                <input
                  value={draft.name}
                  aria-label="название"
                  onChange={(e) => edit_item({ ...draft, name: e.target.value })}
                  className="w-full bg-transparent font-heading-soft text-lg font-bold uppercase leading-tight tracking-wide text-neutral-900 outline-none placeholder:normal-case placeholder:text-neutral-300"
                  placeholder="название"
                />
                <textarea
                  value={get_composition_text(draft)}
                  aria-label="состав"
                  rows={4}
                  placeholder="состав"
                  onChange={(e) => edit_item({ ...draft, composition: e.target.value })}
                  className="mt-1.5 w-full resize-none bg-transparent text-[13px] leading-relaxed text-neutral-500 outline-none placeholder:text-neutral-300"
                />
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-2 pt-0.5">
                {(() => {
                  const vols = card
                    ? volumes_from_size_keys(Object.keys(card.sizes), draft.volumes)
                    : get_item_volumes(draft);
                  if (!vols.length) {
                    return (
                      <PricePill
                        value={draft.price}
                        cost={card ? tech_card_cost(state, card, '1') : 0}
                        on_change={(next) => edit_item({ ...draft, price: next })}
                      />
                    );
                  }
                  return vols.map((v, index) => {
                    const key = String(Math.round(Number(v.ml) || 0));
                    const price = draft.price + (Number(v.add) || 0);
                    return (
                      <PricePill
                        key={key}
                        label={`${v.ml} мл`}
                        value={price}
                        cost={card ? tech_card_cost(state, card, key) : 0}
                        on_change={(next) => {
                          if (index === 0) {
                            edit_item({
                              ...draft,
                              price: next,
                              volumes: vols.map((row, i) => (i === 0 ? { ...row, add: 0 } : row)),
                            });
                            return;
                          }
                          edit_item({
                            ...draft,
                            volumes: vols.map((row, i) =>
                              i === index ? { ...row, add: Math.max(0, next - draft.price) } : row
                            ),
                          });
                        }}
                      />
                    );
                  });
                })()}
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {drink_selected
                  ? createElement(menu_temp_switches, {
                      cold: card?.cold ?? Boolean(draft.cold),
                      hot: card?.hot ?? Boolean(draft.hot),
                      on_cold: (on: boolean) =>
                        card ? set_card_temp(card, draft, { cold: on }) : edit_item({ ...draft, cold: on }),
                      on_hot: (on: boolean) =>
                        card ? set_card_temp(card, draft, { hot: on }) : edit_item({ ...draft, hot: on }),
                    })
                  : null}
                <button
                  type="button"
                  aria-pressed={draft.stock_limited === true}
                  onClick={() =>
                    edit_item({
                      ...draft,
                      stock_limited: draft.stock_limited !== true,
                      stock_qty:
                        draft.stock_limited === true
                          ? draft.stock_qty ?? null
                          : Math.max(0, Number(draft.stock_qty) || 10),
                    })
                  }
                  className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm ${
                    draft.stock_limited === true ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  лимитированная
                </button>
                {draft.stock_limited === true ? (
                  <label className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                    осталось
                    <input
                      type="number"
                      min={0}
                      aria-label="сколько осталось"
                      value={Math.max(0, Number(draft.stock_qty) || 0)}
                      onChange={(e) =>
                        edit_item({
                          ...draft,
                          stock_qty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                      className="h-8 w-16 rounded-full border border-neutral-200 bg-white px-2 text-center text-sm text-neutral-900 outline-none"
                    />
                  </label>
                ) : null}
                {visibility_button({ item: draft, on_toggle: () => toggle_visible(draft) })}
                {archive_button({ item: draft, on_toggle: () => toggle_archive(draft) })}
              </div>
              {card ? (
                <button type="button" className={btn_ghost_danger} onClick={() => remove_card(card)}>
                  убрать рецепт
                </button>
              ) : (
                <button type="button" className={btn_ghost_danger} onClick={() => void purge_item(draft)}>
                  удалить
                </button>
              )}
            </div>
            {!card && drink_selected ? (
              <button type="button" className={btn_secondary} onClick={() => ensure_card(draft)}>
                создать рецепт
              </button>
            ) : null}
            <div className="mt-5 border-t border-neutral-100 pt-5">
              <MenuItemFields
                draft={draft}
                items={menu}
                categories={categories}
                on_change={edit_item}
                on_catalog_change={refresh_categories}
                food_costs={
                  card
                    ? (volumes_from_size_keys(Object.keys(card.sizes), draft.volumes).length
                        ? volumes_from_size_keys(Object.keys(card.sizes), draft.volumes)
                        : [{ ml: 0, add: 0 }]
                      ).map((v) => {
                        const key = v.ml ? String(Math.round(Number(v.ml) || 0)) : '1';
                        const price = draft.price + (Number(v.add) || 0);
                        const cost = price > 0 ? tech_card_cost(state, card, key) : 0;
                        return {
                          key,
                          label: v.ml ? `${v.ml} мл` : '',
                          pct: price > 0 ? (cost / price) * 100 : 0,
                        };
                      })
                    : []
                }
              />
              {card ? (
                <button type="button" className={`${btn_ghost_danger} mt-4`} onClick={() => void purge_item(draft)}>
                  удалить
                </button>
              ) : null}
            </div>
          </Card>
          </div>

          {drink_selected && card ? (
            <RecipeBox
              card={card}
              state={state}
              raw_materials={raw_materials}
              pack_materials={pack_materials}
              size_key={recipe_size_key}
              on_size_key={set_recipe_size_key}
              temp={recipe_temp}
              on_temp={set_recipe_temp}
              cold={Boolean(card.cold ?? draft?.cold)}
              hot={Boolean(card.hot ?? draft?.hot)}
              on_update_card={(fn) => update_card(card.id, fn)}
              on_update_size={(key, fn) => update_size(card.id, key, fn)}
              on_add_size={(k) => update_size(card.id, k, (s) => ({ ...s, volume: Number(k) || s.volume }))}
            />
          ) : null}
          {draft && is_combo(draft) ? (
            <ComboSection
              draft={draft}
              items={menu}
              categories={categories}
              on_change={edit_item}
            />
          ) : null}
        </div>
      ) : (
        <div className="hidden lg:block">
          <EmptyState>выберите позицию слева — карточка и рецепт откроются здесь</EmptyState>
        </div>
      )}

      {craft_open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 sm:items-center sm:p-6">
          <div className="flex h-[100dvh] w-full flex-col bg-white sm:h-[min(920px,calc(100dvh-3rem))] sm:max-w-5xl sm:overflow-hidden sm:rounded-3xl sm:shadow-soft">
            <DrinkCraft on_close={close_craft} on_saved={(id) => void after_craft(id)} />
          </div>
        </div>
      ) : null}
    </div>
    </>
  );
}

function AddSize({ existing, on_add }: { existing: string[]; on_add: (key: string) => void }) {
  const [open, set_open] = useState(false);
  const [val, set_val] = useState('');
  const done = useRef(false);

  function commit() {
    if (done.current) return;
    done.current = true;
    const k = val.trim();
    if (k && !existing.includes(k)) on_add(k);
    set_val('');
    set_open(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="добавить размер"
        onClick={() => {
          done.current = false;
          set_open(true);
        }}
        className="grid h-9 w-9 place-items-center rounded-2xl bg-accent/5 text-lg leading-none text-neutral-500 transition-colors hover:bg-accent/15 hover:text-neutral-800"
      >
        +
      </button>
    );
  }

  return (
    <form
      className="flex items-center"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        autoFocus
        inputMode="numeric"
        className="h-9 w-16 rounded-2xl bg-accent/5 px-2 text-center text-xs text-neutral-900 outline-none"
        placeholder="мл"
        value={val}
        onChange={(e) => set_val(e.target.value)}
        onBlur={commit}
      />
    </form>
  );
}

function RecipeBox({
  card,
  state,
  raw_materials,
  pack_materials,
  size_key,
  on_size_key,
  temp,
  on_temp,
  cold,
  hot,
  on_update_card,
  on_update_size,
  on_add_size,
}: {
  card: tech_card;
  state: import('@/lib/finance/model').finance_state;
  raw_materials: material[];
  pack_materials: material[];
  size_key: string;
  on_size_key: (key: string) => void;
  temp: drink_temp;
  on_temp: (t: drink_temp) => void;
  cold: boolean;
  hot: boolean;
  on_update_card: (fn: (c: tech_card) => tech_card) => void;
  on_update_size: (key: string, fn: (s: tech_card_size) => tech_card_size) => void;
  on_add_size: (key: string) => void;
}) {
  const materials = state.materials;
  const size_keys = Object.keys(card.sizes).sort(
    (a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)
  );
  const active_key = size_key && card.sizes[size_key] ? size_key : size_keys[0] || '';
  const stored = active_key ? card.sizes[active_key] : undefined;
  const auto = active_key === '650' && Boolean(card.sizes['500']) && !stored?.manual;
  const size =
    (active_key
      ? (auto ? effective_card_size(card, active_key, materials) : stored) ?? stored
      : undefined) ?? null;
  const view_ml = size?.volume || Number(active_key) || card_steps_base_ml(card);
  const temp_options = drink_temps({ cold, hot });
  const active_temp = temp_options.includes(temp) ? temp : temp_options[0] ?? 'cold';
  const temp_key = temp_options.join(',');

  useEffect(() => {
    if (active_key && active_key !== size_key) on_size_key(active_key);
  }, [active_key, size_key, on_size_key]);

  useEffect(() => {
    if (temp_options.length && !temp_options.includes(temp)) on_temp(temp_options[0]);
  }, [temp_key, temp, on_temp, temp_options]);

  if (!size || !active_key) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">добавьте размер, чтобы править рецепт</p>
        <div className="mt-3">
          <AddSize existing={size_keys} on_add={on_add_size} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-wide text-neutral-900">рецепт</p>
        <div className="flex flex-wrap items-center gap-2">
          {temp_options.length > 0 ? (
            <div
              className="inline-flex max-w-full flex-wrap rounded-full border border-black/[0.08] bg-white p-0.5"
              role="group"
              aria-label="температура"
            >
              {temp_options.map((option) => {
                const active = option === active_temp;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => on_temp(option)}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${
                      active
                        ? option === 'cold'
                          ? 'bg-sky-500 font-semibold text-white'
                          : 'bg-rose-500 font-semibold text-white'
                        : option === 'cold'
                          ? 'text-sky-600 hover:bg-sky-50'
                          : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    {drink_temp_label(option)}
                  </button>
                );
              })}
            </div>
          ) : null}
          {size_keys.length > 0 ? (
            <div
              className="inline-flex max-w-full flex-wrap rounded-full border border-black/[0.08] bg-white p-0.5"
              role="group"
              aria-label="объём"
            >
              {size_keys.map((key) => {
                const ml = Math.round(Number(key) || card.sizes[key]?.volume || 0);
                const active = key === active_key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => on_size_key(key)}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${
                      active
                        ? 'bg-accent text-accent-foreground font-semibold shadow-[0_2px_8px_rgba(255,107,107,0.28)]'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {ml > 0 ? `${ml} мл` : size_label(key)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>
          {size_label(active_key)} · {format_rub(tech_card_cost(state, card, active_key), 1)}
        </span>
        {auto ? <span>· сырьё от 500 мл × 1,3</span> : null}
        <span className="flex-1" />
        {auto ? (
          <button
            type="button"
            className={btn_secondary}
            onClick={() =>
              on_update_card((c) => ({
                ...c,
                sizes: {
                  ...c.sizes,
                  '650': {
                    ...derive_size_from_base(c.sizes['500'], 650, materials),
                    manual: true,
                  },
                },
              }))
            }
          >
            править вручную
          </button>
        ) : null}
        {active_key === '650' && stored?.manual ? (
          <button
            type="button"
            className={btn_secondary}
            onClick={() =>
              on_update_card((c) => {
                if (!c.sizes['500']) return c;
                return {
                  ...c,
                  sizes: {
                    ...c.sizes,
                    '650': derive_size_from_base(c.sizes['500'], 650, materials),
                  },
                };
              })
            }
          >
            от 500 мл
          </button>
        ) : null}
        {size_keys.length > 1 ? (
          <button
            type="button"
            className={btn_ghost_danger}
            onClick={() =>
              on_update_card((c) => {
                const sizes = { ...c.sizes };
                delete sizes[active_key];
                return { ...c, sizes };
              })
            }
          >
            убрать размер
          </button>
        ) : null}
        <AddSize existing={size_keys} on_add={on_add_size} />
      </div>

      <div className={auto ? 'pointer-events-none opacity-80' : undefined}>
        <IngredientList
          title="ингредиенты"
          rows={size.ingredients}
          options={raw_materials}
          state_materials={materials}
          cost_of={(mid, q) => material_cost(state, mid, q)}
          on_change={(rows) => on_update_size(active_key, (s) => ({ ...s, ingredients: rows }))}
        />
        <div className="my-3 border-t border-dashed border-neutral-200" />
        <IngredientList
          title="упаковка"
          rows={size.packaging}
          options={pack_materials}
          state_materials={materials}
          cost_of={(mid, q) => material_cost(state, mid, q)}
          on_change={(rows) => on_update_size(active_key, (s) => ({ ...s, packaging: rows }))}
          quick_pack_ml={view_ml}
        />
      </div>

      <div className="my-4 border-t border-neutral-100 pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">этапы</p>
        <PrepStepsEditor
          steps={resolved_card_prep_steps(card, materials)}
          materials={materials}
          base_ml={card_steps_base_ml(card)}
          size_keys={size_keys}
          view_ml={view_ml}
          on_view_ml={(ml) => {
            const key = size_keys.find((k) => Math.round(Number(k) || 0) === ml) || String(ml);
            on_size_key(key);
          }}
          show_header={false}
          on_change={(next) => on_update_card((c) => apply_steps_to_card(c, next, materials))}
        />
      </div>
    </Card>
  );
}

/** 1 стакан нужного объёма + 1 плёнка + 1 трубочка */
function default_sealed_pack(materials: material[], volume_ml: number): Record<string, number> {
  const pack = materials.filter((m) => m.category === 'packaging');
  const pick = (ids: string[], re: RegExp) =>
    pack.find((m) => ids.includes(m.id)) || pack.find((m) => re.test(m.name.toLowerCase()));

  const straw = pick(['straw'], /трубоч/);
  const film = pick(['film'], /плёнк|пленк|запай/);
  const cups = pack.filter(
    (m) => /стакан|cup/.test(m.name.toLowerCase()) || /^cup_/.test(m.id)
  );
  const vol = String(Math.round(volume_ml) || '');
  const cup =
    (vol
      ? cups.find((m) => m.name.includes(vol) || m.id.includes(vol) || new RegExp(`\\b${vol}\\b`).test(m.name))
      : undefined) ||
    cups.find((m) => m.id === 'cup_plastic') ||
    cups.find((m) => /пластик/.test(m.name.toLowerCase())) ||
    cups[0];

  const out: Record<string, number> = {};
  if (cup) out[cup.id] = 1;
  if (film) out[film.id] = 1;
  if (straw) out[straw.id] = 1;
  return out;
}

function IngredientList({
  title,
  rows,
  options,
  state_materials,
  cost_of,
  on_change,
  quick_pack_ml,
}: {
  title: string;
  rows: Record<string, number>;
  options: { id: string; name: string; unit: import('@/lib/finance/model').material_unit }[];
  state_materials: import('@/lib/finance/model').material[];
  cost_of: (material_id: string, qty: number) => number;
  on_change: (rows: Record<string, number>) => void;
  /** если задан — кнопка «стакан + плёнка + трубочка» под этот объём */
  quick_pack_ml?: number;
}) {
  const [adding, set_adding] = useState('');
  const entries = Object.entries(rows);
  const used = new Set(entries.map(([id]) => id));
  const available = options.filter((o) => !used.has(o.id));
  const total = entries.reduce((s, [id, q]) => s + cost_of(id, q), 0);
  const quick =
    quick_pack_ml && quick_pack_ml > 0
      ? default_sealed_pack(state_materials, quick_pack_ml)
      : null;
  const can_quick = Boolean(quick && Object.keys(quick).length > 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</p>
        <p className="text-xs text-neutral-500">{format_rub(total, 1)}</p>
      </div>
      {entries.length ? (
        <div className="space-y-1.5">
          {entries.map(([id, q]) => {
            const mat = state_materials.find((m) => m.id === id);
            return (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-neutral-800">{mat?.name ?? <span className="text-neutral-400">удалённый материал</span>}</span>
                <div className="flex w-28 items-center gap-1">
                  <NumInput value={q} min={0} on_change={(v) => on_change({ ...rows, [id]: v })} />
                  <span className="w-6 text-xs text-neutral-400">{mat ? base_unit_label(mat.unit) : ''}</span>
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-neutral-500">{format_rub(cost_of(id, q), 1)}</span>
                <button
                  type="button"
                  className={btn_ghost_danger}
                  onClick={() => {
                    const next = { ...rows };
                    delete next[id];
                    on_change(next);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-neutral-400">пусто</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {can_quick && quick ? (
          <button
            type="button"
            className={btn_secondary}
            onClick={() => on_change({ ...rows, ...quick })}
          >
            + стакан · плёнка · трубочка
          </button>
        ) : null}
        {available.length > 0 ? (
          <select
            className={`${field_class} min-w-[10rem] flex-1 text-xs`}
            value={adding}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              on_change({ ...rows, [id]: 0 });
              set_adding('');
            }}
          >
            <option value="">+ добавить…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}
