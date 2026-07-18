'use client';

import { useEffect, useState } from 'react';
import type { sidebar_ad_slide } from '@/lib/types';
import {
  delete_sidebar_slide,
  get_sidebar_ad_store,
  move_sidebar_slide,
  new_sidebar_slide_id,
  reset_sidebar_ad_store,
  set_sidebar_interval_ms,
  upsert_sidebar_slide,
} from '@/lib/sidebar-ad-store';

const empty_slide: sidebar_ad_slide = {
  id: '',
  title: '',
  subtitle: '',
  image_url: '',
  link_url: '',
  menu_id: null,
  category: null,
  is_active: true,
};

export default function sidebar_ad_manage() {
  const [slides, set_slides] = useState<sidebar_ad_slide[]>([]);
  const [interval_ms, set_interval_ms] = useState(5000);
  const [editing, set_editing] = useState<sidebar_ad_slide | null>(null);

  function reload() {
    const store = get_sidebar_ad_store();
    set_slides(store.slides);
    set_interval_ms(store.interval_ms);
  }

  useEffect(() => {
    reload();
  }, []);

  function handle_save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload: sidebar_ad_slide = {
      ...editing,
      id: editing.id || new_sidebar_slide_id(),
      title: editing.title.trim(),
      subtitle: editing.subtitle?.trim() || undefined,
      image_url: editing.image_url.trim(),
      link_url: editing.link_url?.trim() || undefined,
      menu_id: editing.menu_id?.trim() || null,
      category: editing.category?.trim() || null,
    };
    if (!payload.title || !payload.image_url) return;
    upsert_sidebar_slide(payload);
    set_editing(null);
    reload();
  }

  return (
    <section className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold">реклама справа</h2>
          <p className="text-xs text-neutral-500 mt-0.5">слайдшоу на десктопе, плавная смена картинок</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm('сбросить рекламу к дефолту?')) {
                reset_sidebar_ad_store();
                reload();
              }
            }}
            className="text-xs text-neutral-400 px-2 py-1"
          >
            сброс
          </button>
          <button
            type="button"
            onClick={() => set_editing({ ...empty_slide })}
            className="rounded-pill bg-accent text-accent-foreground px-4 py-2 text-sm font-medium"
          >
            + слайд
          </button>
        </div>
      </div>

      <label className="flex items-center gap-3 mb-4 text-sm">
        <span className="text-neutral-600 whitespace-nowrap">интервал, сек</span>
        <input
          type="number"
          min={2}
          max={60}
          value={Math.round(interval_ms / 1000)}
          onChange={(e) => set_interval_ms(Number(e.target.value) * 1000)}
          className="w-20 rounded-xl border border-surface px-3 py-1.5"
        />
        <button
          type="button"
          onClick={() => {
            set_sidebar_interval_ms(interval_ms);
            reload();
          }}
          className="text-accent text-sm font-medium"
        >
          сохранить
        </button>
      </label>

      <ul className="space-y-2">
        {slides.map((slide) => (
          <li
            key={slide.id}
            className="flex items-center gap-3 bg-surface rounded-xl p-3 text-sm"
          >
            {slide.image_url && (
              <img
                src={slide.image_url}
                alt=""
                className="w-10 h-14 rounded-lg object-cover bg-cream flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{slide.title}</p>
              <p className="text-xs text-neutral-500 truncate">
                {slide.subtitle || 'без подзаголовка'}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  move_sidebar_slide(slide.id, -1);
                  reload();
                }}
                className="w-7 h-7 rounded-lg bg-white text-neutral-500"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => {
                  move_sidebar_slide(slide.id, 1);
                  reload();
                }}
                className="w-7 h-7 rounded-lg bg-white text-neutral-500"
              >
                ↓
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                upsert_sidebar_slide({ ...slide, is_active: !slide.is_active });
                reload();
              }}
              className={`text-xs px-2 py-1 rounded-pill ${
                slide.is_active ? 'bg-accent/10 text-accent' : 'bg-neutral-200 text-neutral-500'
              }`}
            >
              {slide.is_active ? 'вкл' : 'выкл'}
            </button>
            <button
              type="button"
              onClick={() => set_editing({ ...slide })}
              className="text-xs text-neutral-600"
            >
              edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`удалить «${slide.title}»?`)) {
                  delete_sidebar_slide(slide.id);
                  reload();
                }
              }}
              className="text-xs text-accent"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <button
            type="button"
            aria-label="закрыть"
            className="absolute inset-0 bg-black/30"
            onClick={() => set_editing(null)}
          />
          <form
            onSubmit={handle_save}
            className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-card p-5 shadow-soft max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-semibold mb-4">
              {editing.id ? 'редактировать слайд' : 'новый слайд'}
            </h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-neutral-500">заголовок</span>
                <input
                  value={editing.title}
                  onChange={(e) => set_editing({ ...editing, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">подзаголовок</span>
                <input
                  value={editing.subtitle || ''}
                  onChange={(e) => set_editing({ ...editing, subtitle: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">url картинки</span>
                <input
                  value={editing.image_url}
                  onChange={(e) => set_editing({ ...editing, image_url: e.target.value })}
                  placeholder="/images/sidebar/slide1.png"
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">ссылка</span>
                <input
                  value={editing.link_url || ''}
                  onChange={(e) => set_editing({ ...editing, link_url: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">id товара</span>
                <input
                  value={editing.menu_id || ''}
                  onChange={(e) => set_editing({ ...editing, menu_id: e.target.value || null })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">категория</span>
                <input
                  value={editing.category || ''}
                  onChange={(e) => set_editing({ ...editing, category: e.target.value || null })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => set_editing(null)}
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
        </div>
      )}
    </section>
  );
}
