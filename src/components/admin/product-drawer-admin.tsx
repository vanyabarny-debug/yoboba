'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import product_photo_picker, {
  product_photo_button,
} from '@/components/admin/product-photo-picker';
import {
  get_composition,
  get_description,
  get_topping_name,
  get_topping_portion_price_value,
} from '@/lib/product-details';
import {
  get_category_nutrition,
  get_site_content_store,
  set_category_composition,
  set_category_description,
  set_category_nutrition,
  set_topping_portion_price,
  subscribe_site_content_store,
  type category_nutrition,
} from '@/lib/site-content-store';

type props = {
  item: menu_item | null;
  open: boolean;
  on_close: () => void;
  on_save: (item: menu_item) => void;
  on_delete?: (id: string) => void;
};

const volumes = [
  { id: '450', label: '450 мл', ml: 450, add: 0 },
  { id: '650', label: '650 мл', ml: 650, add: 50 },
] as const;

export default function product_drawer_admin({ item, open, on_close, on_save, on_delete }: props) {
  const [draft, set_draft] = useState<menu_item | null>(null);
  const [description, set_description] = useState('');
  const [composition, set_composition] = useState('');
  const [topping_price, set_topping_price] = useState(60);
  const [nutrition_base, set_nutrition_base] = useState<category_nutrition>({
    kcal: 0,
    protein: 0,
    fat: 0,
    carb: 0,
  });
  const [volume, set_volume] = useState<(typeof volumes)[number]['id']>('450');
  const [topping, set_topping] = useState(0);
  const [details_open, set_details_open] = useState(false);
  const [meta_tick, set_meta_tick] = useState(0);

  useEffect(() => {
    function reload_meta() {
      set_meta_tick((t) => t + 1);
    }
    reload_meta();
    return subscribe_site_content_store(reload_meta);
  }, []);

  useEffect(() => {
    if (!item) {
      set_draft(null);
      return;
    }
    set_draft({ ...item });
    set_description(get_description(item));
    const store = get_site_content_store();
    set_composition(store.category_compositions[item.category] ?? '');
    set_topping_price(get_topping_portion_price_value());
    set_nutrition_base(get_category_nutrition(item.category));
    set_volume('450');
    set_topping(0);
    set_details_open(false);
  }, [item?.id, open]);

  const volume_ml = volumes.find((v) => v.id === volume)?.ml ?? 450;
  const topping_max = Math.max(4, Math.round(volume_ml / 60));
  const topping_name = draft ? get_topping_name(draft) : '';

  const nutrition = useMemo(() => {
    if (!draft) return null;
    const scale = volume_ml / 100;
    const topping_n = { kcal: 52, protein: 0.2, fat: 0.1, carb: 12.5 };
    return {
      kcal: Math.round(nutrition_base.kcal * scale + topping_n.kcal * topping),
      protein: Math.round((nutrition_base.protein * scale + topping_n.protein * topping) * 10) / 10,
      fat: Math.round((nutrition_base.fat * scale + topping_n.fat * topping) * 10) / 10,
      carb: Math.round((nutrition_base.carb * scale + topping_n.carb * topping) * 10) / 10,
    };
  }, [draft, volume_ml, topping, nutrition_base]);

  const composition_list = useMemo(
    () => (draft ? get_composition(draft) : []),
    [draft, meta_tick, composition]
  );

  const preview_price = useMemo(() => {
    if (!draft) return 0;
    const volume_add = volumes.find((v) => v.id === volume)?.add ?? 0;
    return Math.max(0, draft.price + volume_add + topping * topping_price);
  }, [draft, volume, topping, topping_price]);

  function handle_save() {
    if (!draft) return;
    set_category_description(draft.category, description.trim());
    set_category_composition(draft.category, composition.trim());
    set_category_nutrition(draft.category, nutrition_base);
    set_topping_portion_price(topping_price);
    on_save({
      ...draft,
      name: draft.name.trim(),
      price: Math.max(0, Math.round(Number(draft.price) || 0)),
    });
    on_close();
  }

  if (!open || !item || !draft || !nutrition) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
        onClick={on_close}
      />

      <div className="relative w-full max-w-[940px] sm:mx-4">
        <button
          type="button"
          aria-label="закрыть"
          onClick={on_close}
          className="absolute top-0 right-2 sm:-right-12 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:bg-neutral-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="product-panel relative flex h-[min(92vh,640px)] max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:h-[min(88vh,620px)] sm:max-h-[88vh] sm:flex-row sm:rounded-[28px]">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[linear-gradient(180deg,#fafafa_0%,#f1f1f3_100%)] sm:aspect-auto sm:h-full sm:w-[43%]">
            {createElement(menu_image, {
              item: draft,
              className: 'h-full w-full',
              variant: 'card',
            })}
            <div className="absolute top-4 right-4 z-10">
              {createElement(product_photo_picker, {
                label: 'загрузить фото',
                on_save: (url) => set_draft({ ...draft, image_url: url }),
              })}
            </div>
            <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-center">
              {createElement(product_photo_button, {
                label: draft.image_url?.startsWith('data:') ? 'заменить фото' : 'выбрать фото',
                on_save: (url) => set_draft({ ...draft, image_url: url }),
                className: 'shadow-lg',
              })}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => set_draft({ ...draft, name: e.target.value })}
                  className="w-full text-[28px] sm:text-[32px] font-bold leading-[1.05] text-neutral-900 bg-transparent border-b border-transparent focus:border-accent/40 outline-none"
                />
              </div>

              <div className="mt-3 inline-flex rounded-full bg-[#f3f4f6] p-0.5">
                {volumes.map((option) => {
                  const active = option.id === volume;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => set_volume(option.id)}
                      className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${
                        active
                          ? 'bg-white text-neutral-900 font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                          : 'text-neutral-500 hover:text-neutral-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <textarea
                  value={description}
                  onChange={(e) => set_description(e.target.value)}
                  rows={3}
                  placeholder="описание для карточки"
                  className="w-full rounded-xl border border-surface bg-surface/40 px-3 py-2 text-[15px] leading-relaxed text-neutral-700 resize-y"
                />
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => set_details_open((o) => !o)}
                  aria-expanded={details_open}
                  className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-neutral-900"
                >
                  состав
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${details_open ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {details_open && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs font-medium text-neutral-500">кбжу на 100 мл (для категории)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {([
                        ['kcal', 'ккал'],
                        ['protein', 'белки'],
                        ['fat', 'жиры'],
                        ['carb', 'углеводы'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="text-xs text-neutral-500">
                          {label}
                          <input
                            type="number"
                            min={0}
                            step={key === 'kcal' ? 1 : 0.1}
                            value={nutrition_base[key]}
                            onChange={(e) =>
                              set_nutrition_base({
                                ...nutrition_base,
                                [key]: Number(e.target.value) || 0,
                              })
                            }
                            className="mt-1 w-full rounded-xl border border-surface px-2 py-1.5 text-sm font-mono"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-normal text-neutral-500">
                      <span>{nutrition.kcal} ккал</span>
                      <span>белки {nutrition.protein} г</span>
                      <span>жиры {nutrition.fat} г</span>
                      <span>углеводы {nutrition.carb} г</span>
                      <span className="text-neutral-400">при {volume_ml} мл</span>
                    </div>
                    <textarea
                      value={composition}
                      onChange={(e) => set_composition(e.target.value)}
                      rows={2}
                      placeholder="состав через запятую"
                      className="w-full rounded-xl border border-surface bg-surface/40 px-3 py-2 text-[15px] leading-relaxed text-neutral-700 resize-y"
                    />
                    <p className="text-xs text-neutral-400">
                      превью: {composition_list.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-7 rounded-2xl border border-surface bg-surface/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-neutral-700">
                      порция топпинга ({topping_name})
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      цена одного увеличения в карточке товара
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={topping_price}
                      onChange={(e) => set_topping_price(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 rounded-xl border border-surface px-2 py-1.5 text-sm font-mono text-center"
                    />
                    <span className="text-sm text-neutral-500">₽</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm text-neutral-600">превью +{topping_price} ₽ за порцию</p>
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#f3f4f6] p-1">
                    <button
                      type="button"
                      onClick={() => set_topping((t) => Math.max(0, t - 1))}
                      disabled={topping === 0}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-800 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-semibold font-mono tabular-nums">
                      {topping}
                    </span>
                    <button
                      type="button"
                      onClick={() => set_topping((t) => Math.min(topping_max, t + 1))}
                      disabled={topping >= topping_max}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-800 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <label className="text-sm text-neutral-500">базовая цена</label>
                <input
                  type="number"
                  min={0}
                  value={draft.price}
                  onChange={(e) =>
                    set_draft({ ...draft, price: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-28 rounded-xl border border-surface px-3 py-2 text-sm font-mono"
                />
                <span className="text-sm text-neutral-500">₽</span>
              </div>
            </div>

            <div className="border-t border-[#ececf0] bg-white px-5 py-4 sm:px-7 sm:py-5">
              <p className="mb-3 text-center text-sm text-neutral-500">
                превью итога: {preview_price} ₽
              </p>
              {on_delete && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`удалить «${draft.name}»?`)) {
                      on_delete(draft.id);
                      on_close();
                    }
                  }}
                  className="mb-3 w-full rounded-pill border border-surface py-2.5 text-sm text-accent"
                >
                  удалить блюдо
                </button>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={on_close}
                  className="flex-1 rounded-pill border border-surface py-3 text-sm font-medium"
                >
                  отмена
                </button>
                <button
                  type="button"
                  onClick={handle_save}
                  className="flex-1 rounded-pill bg-accent py-3 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_rgba(4,104,240,0.28)]"
                >
                  сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
