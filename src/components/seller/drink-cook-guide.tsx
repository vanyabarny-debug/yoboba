'use client';

import { useEffect, useRef, useState } from 'react';
import { play_start_chime } from '@/lib/order-chime';
import type { drink_row } from '@/components/seller/order-prep-card';
import { pick_recipe_size, type public_recipe } from '@/lib/finance/prep-steps';

type phase = 'intro' | 'step' | 'empty';

function RecipePane({
  drink,
  recipes,
  error,
  compact,
  on_start_drink,
  on_mark_drink_done,
  on_finished,
}: {
  drink: drink_row;
  recipes: public_recipe[] | null;
  error: string;
  compact: boolean;
  on_start_drink: (drink: drink_row) => void;
  on_mark_drink_done: (drink: drink_row) => void;
  on_finished: () => void;
}) {
  const recipe = recipes?.find((r) => r.menu_id === drink.menu_id);
  const size = pick_recipe_size(recipe, drink.volume);
  const steps = size?.steps ?? [];
  const [phase, set_phase] = useState<phase>('intro');
  const [step_i, set_step_i] = useState(0);

  useEffect(() => {
    if (!recipes) return;
    set_phase(steps.length ? 'intro' : 'empty');
    set_step_i(0);
  }, [drink.key, recipes, steps.length]);

  const progress =
    phase === 'intro' || phase === 'empty'
      ? 0
      : steps.length
        ? (step_i + 1) / steps.length
        : 1;
  const current = steps[step_i];
  const title_cls = compact
    ? 'text-xl font-semibold leading-tight tracking-tight sm:text-2xl'
    : 'text-3xl font-semibold leading-tight tracking-tight sm:text-4xl';

  function start_timer() {
    if (drink.done || drink.started) return;
    play_start_chime();
    on_start_drink(drink);
  }

  function skip_recipe() {
    start_timer();
    on_finished();
  }

  function view_recipe() {
    start_timer();
    if (!steps.length) {
      on_finished();
      return;
    }
    set_phase('step');
    set_step_i(0);
  }

  function go_next() {
    if (step_i + 1 >= steps.length) {
      if (!drink.done) on_mark_drink_done(drink);
      on_finished();
      return;
    }
    set_step_i(step_i + 1);
  }

  function go_back() {
    if (phase === 'step' && step_i > 0) {
      set_step_i(step_i - 1);
      return;
    }
    if (phase === 'step') {
      set_phase('intro');
    }
  }

  if (!recipes) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-sm text-neutral-400">загружаю рецепт…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="h-1 bg-neutral-100">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${compact ? 'px-4 pb-6' : 'px-6 pb-10'}`}>
        {phase === 'empty' ? (
          <div className="m-auto w-full max-w-md text-center">
            <p className="text-sm uppercase tracking-[0.16em] text-accent">рецепт</p>
            <h1 className={`mt-3 ${title_cls}`}>{drink.name}</h1>
            <p className="mt-4 text-base text-neutral-500">
              этапов пока нет — готовьте как обычно, таймер пойдёт на карточке
            </p>
            {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
            <button
              type="button"
              className="mt-8 w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
              onClick={skip_recipe}
            >
              {drink.done || drink.started ? 'дальше' : 'начать'}
            </button>
          </div>
        ) : phase === 'intro' ? (
          <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pt-2">
              <p className="text-center text-sm uppercase tracking-[0.16em] text-accent">раскладка</p>
              <h1 className={`mt-3 text-center ${title_cls}`}>{drink.name}</h1>
              {size?.label ? <p className="mt-2 text-center text-base text-neutral-500">{size.label}</p> : null}
              <ul className={`divide-y divide-neutral-100 ${compact ? 'mt-4' : 'mt-8'}`}>
                {steps.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-baseline justify-between gap-3 ${compact ? 'py-2' : 'py-3'}`}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">{s.hint}</p>
                      <p className={`mt-0.5 font-medium leading-snug ${compact ? 'text-base' : 'text-lg'}`}>
                        {s.title}
                      </p>
                    </div>
                    {s.qty_label ? (
                      <p className={`shrink-0 tabular-nums text-neutral-900 ${compact ? 'text-base' : 'text-lg'}`}>
                        {s.qty_label}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 pt-4">
              <button
                type="button"
                className="w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
                onClick={view_recipe}
              >
                посмотреть рецепт
              </button>
              <button
                type="button"
                className="mt-2 w-full py-2 text-base text-neutral-400 hover:text-neutral-700"
                onClick={skip_recipe}
              >
                пропустить рецепт
              </button>
            </div>
          </div>
        ) : phase === 'step' && current ? (
          <div className="relative m-auto w-full max-w-md text-center">
            <button
              type="button"
              className="absolute left-0 top-0 text-sm text-neutral-400 hover:text-neutral-700"
              onClick={go_back}
            >
              назад
            </button>
            <p className="text-sm uppercase tracking-[0.16em] text-accent">{current.hint}</p>
            <p className="mt-1 text-sm tabular-nums text-neutral-400">
              {step_i + 1} / {steps.length}
            </p>
            <h1 className={`mt-3 whitespace-pre-line ${title_cls}`}>{current.title}</h1>
            {current.qty_label ? (
              <p className={`mt-6 tabular-nums text-neutral-900 ${compact ? 'text-3xl' : 'text-4xl'}`}>
                {current.qty_label}
              </p>
            ) : (
              <p className="mt-6 text-sm text-neutral-400">без граммовки — просто сделайте шаг</p>
            )}
            <button
              type="button"
              className="mt-10 w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
              onClick={go_next}
            >
              {step_i + 1 >= steps.length ? (drink.done ? 'дальше' : 'готово') : 'дальше'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DrinkCookGuide({
  drinks,
  start_key,
  on_start_drink,
  on_mark_drink_done,
  on_close,
}: {
  drinks: drink_row[];
  start_key?: string;
  on_start_drink: (drink: drink_row) => void;
  on_mark_drink_done: (drink: drink_row) => void;
  on_close: () => void;
}) {
  const start_index = Math.max(
    0,
    drinks.findIndex((d) => d.key === start_key)
  );
  const [pair_i, set_pair_i] = useState(Math.floor((start_index >= 0 ? start_index : 0) / 2));
  const [finished, set_finished] = useState<Record<string, true>>({});
  const finished_ref = useRef(finished);
  finished_ref.current = finished;
  const [recipes, set_recipes] = useState<public_recipe[] | null>(null);
  const [error, set_error] = useState('');

  const pair_count = Math.max(1, Math.ceil(drinks.length / 2));
  const safe_pair = Math.min(pair_i, pair_count - 1);
  const pair = drinks.slice(safe_pair * 2, safe_pair * 2 + 2);
  const split = pair.length > 1;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/seller/recipes', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { recipes?: public_recipe[]; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          set_error(body.error);
          set_recipes([]);
          return;
        }
        set_recipes(body.recipes ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          set_error('не удалось загрузить рецепт');
          set_recipes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pane_finished(key: string) {
    const next = { ...finished_ref.current, [key]: true as const };
    finished_ref.current = next;
    set_finished(next);
    if (pair.every((d) => next[d.key])) {
      if (safe_pair + 1 < pair_count) set_pair_i(safe_pair + 1);
      else on_close();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white font-heading-soft text-neutral-900">
      <div className="flex items-center justify-between px-5 py-4">
        <button type="button" className="text-sm text-neutral-400 hover:text-neutral-700" onClick={on_close}>
          закрыть
        </button>
        {drinks.length > 1 ? (
          <p className="text-sm tabular-nums text-neutral-400">
            {safe_pair * 2 + 1}
            {pair.length > 1 ? `–${safe_pair * 2 + pair.length}` : ''} / {drinks.length}
          </p>
        ) : (
          <span />
        )}
        <span className="w-16" />
      </div>

      <div className={`flex min-h-0 flex-1 ${split ? 'flex-row' : 'flex-col'}`}>
        {pair.map((drink, i) => (
          <div
            key={drink.key}
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${
              split && i > 0 ? 'border-l border-neutral-200' : ''
            }`}
          >
            {finished[drink.key] ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
                <p className="text-base text-neutral-400">на карточке</p>
              </div>
            ) : (
              <RecipePane
                drink={drink}
                recipes={recipes}
                error={error}
                compact={split}
                on_start_drink={on_start_drink}
                on_mark_drink_done={on_mark_drink_done}
                on_finished={() => pane_finished(drink.key)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
