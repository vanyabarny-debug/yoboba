'use client';

import { useEffect, useMemo, useState } from 'react';
import type { material, tech_card } from '@/lib/finance/model';
import {
  build_ttk_bundle,
  card_ttk_temps,
  copy_ttk_to_clipboard,
  empty_ttk_fill,
  ttk_fill_ready,
  ttk_volume_keys,
  type ttk_fill,
} from '@/lib/finance/ttk-document';
import { ttk_preset_for } from '@/lib/finance/ttk-presets';
import { btn_primary, btn_secondary, field_class } from '@/components/admin/finance/ui';

function fill_from_card(card: tech_card, vols: string[]): ttk_fill {
  const base = empty_ttk_fill(vols);
  const src = card.ttk || ttk_preset_for(card)?.ttk;
  if (!src) return base;
  const nutrition = { ...base.nutrition };
  for (const vol of vols) {
    const row = src.nutrition?.[vol];
    if (row) nutrition[vol] = { ...nutrition[vol], ...row };
  }
  return {
    appearance: src.appearance || '',
    color: src.color || '',
    taste: src.taste || '',
    consistency: src.consistency || '',
    serveTemp: src.serveTemp || '',
    storage: src.storage || '',
    nutrition,
  };
}

type props = {
  open: boolean;
  card: tech_card;
  materials: material[];
  number: number;
  on_close: () => void;
  on_copied?: () => void;
  on_error?: () => void;
  /** сохранить заполненные поля на техкарту */
  on_save_fill?: (fill: ttk_fill) => void;
};

export default function TtkCopyModal({
  open,
  card,
  materials,
  number,
  on_close,
  on_copied,
  on_error,
  on_save_fill,
}: props) {
  const vols = useMemo(() => ttk_volume_keys(card, materials), [card, materials]);
  const temps = useMemo(() => card_ttk_temps(card), [card]);
  const [fill, set_fill] = useState<ttk_fill>(() => fill_from_card(card, vols));
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    if (open) set_fill(fill_from_card(card, vols));
  }, [open, vols, card]);

  if (!open) return null;

  function patch(part: Partial<ttk_fill>) {
    set_fill((prev) => ({ ...prev, ...part }));
  }

  function patch_nutrition(vol: string, part: Partial<ttk_fill['nutrition'][string]>) {
    set_fill((prev) => ({
      ...prev,
      nutrition: {
        ...prev.nutrition,
        [vol]: { ...(prev.nutrition[vol] || empty_ttk_fill([vol]).nutrition[vol]), ...part },
      },
    }));
  }

  async function confirm() {
    if (!ttk_fill_ready(fill) || busy) return;
    set_busy(true);
    try {
      const text = build_ttk_bundle({ card, materials, number, fill });
      await copy_ttk_to_clipboard(text);
      on_save_fill?.(fill);
      on_copied?.();
      on_close();
    } catch {
      on_error?.();
    } finally {
      set_busy(false);
    }
  }

  const ready = ttk_fill_ready(fill);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ttk-fill-title"
        className="flex max-h-[min(920px,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-soft"
      >
        <div className="shrink-0 border-b border-neutral-100 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-accent">ТТК</p>
          <h2 id="ttk-fill-title" className="mt-1 text-lg font-semibold text-neutral-900">
            {ttk_fill_ready(fill) ? 'проверьте ТТК перед копированием' : 'заполните перед копированием'}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">{card.name}</p>
          {temps.length > 1 ? (
            <p className="mt-1 text-xs text-accent">
              скопируются 2 ТТК: холодный и горячий
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">
              вариант: {temps[0] === 'hot' ? 'горячий' : 'холодный'}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            4. показатели качества
          </p>
          {(
            [
              ['appearance', 'внешний вид', 'прозрачный стакан, на дне тапиока…'],
              ['color', 'цвет', 'светло-коричневый, молочно-карамельный'],
              ['taste', 'вкус и запах', 'вкус чёрного чая с нотами карамели…'],
              ['consistency', 'консистенция', 'напиток жидкий со льдом; тапиока упругая…'],
            ] as const
          ).map(([key, label, ph]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs text-neutral-500">{label}</span>
              <textarea
                rows={2}
                className={`${field_class} resize-y`}
                placeholder={ph}
                value={fill[key]}
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">температура подачи (если нужно)</span>
            <input
              className={field_class}
              placeholder="60–65 °C"
              value={fill.serveTemp || ''}
              onChange={(e) => patch({ serveTemp: e.target.value })}
            />
          </label>

          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            5. хранение полуфабрикатов
          </p>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">сроки хранения полуфабрикатов</span>
            <textarea
              rows={3}
              className={`${field_class} resize-y`}
              placeholder="вареная тапиока — до 4 часов при +18…+25 °C; чайная база — до 12 часов при +2…+6 °C…"
              value={fill.storage}
              onChange={(e) => patch({ storage: e.target.value })}
            />
          </label>

          <p className="pt-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            6. пищевая ценность
          </p>
          {vols.map((vol) => {
            const row = fill.nutrition[vol] || empty_ttk_fill([vol]).nutrition[vol];
            return (
              <div key={vol} className="rounded-2xl border border-neutral-100 p-3">
                <p className="mb-2 text-xs font-medium text-neutral-600">порция {vol} мл</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['protein', 'белки, г'],
                      ['fat', 'жиры, г'],
                      ['carbs', 'углеводы, г'],
                      ['energy', 'ккал / кДж'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[11px] text-neutral-400">{label}</span>
                      <input
                        className={field_class}
                        placeholder={key === 'energy' ? '262 / 1096' : '0'}
                        value={row[key]}
                        onChange={(e) => patch_nutrition(vol, { [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-neutral-100 px-5 py-4">
          <button type="button" className={btn_secondary} onClick={on_close} disabled={busy}>
            отмена
          </button>
          <button
            type="button"
            className={btn_primary}
            disabled={!ready || busy}
            onClick={() => void confirm()}
          >
            {busy ? 'копирую…' : temps.length > 1 ? 'скопировать 2 ТТК' : 'скопировать ТТК'}
          </button>
        </div>
      </div>
    </div>
  );
}
