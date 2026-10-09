'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PrepStepsEditor from '@/components/admin/finance/prep-steps-editor';
import {
  apply_steps_to_card,
  card_steps_base_ml,
  resolved_card_prep_steps,
} from '@/lib/finance/prep-steps';
import { normalize_finance_state, type finance_state, type tech_card } from '@/lib/finance/model';

export default function MenuPrepSteps({ menu_item_id }: { menu_item_id: string }) {
  const [state, set_state] = useState<finance_state | null>(null);
  const [error, set_error] = useState('');
  const [status, set_status] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const latest = useRef<finance_state | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/finance', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { state?: unknown; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          set_error(body.error);
          return;
        }
        set_state(normalize_finance_state(body.state));
      })
      .catch(() => set_error('не удалось загрузить этапы'));
    return () => {
      cancelled = true;
    };
  }, [menu_item_id]);

  const card = useMemo(
    () => state?.techCards.find((c) => c.menu_item_id === menu_item_id) ?? null,
    [state, menu_item_id]
  );

  function persist(next: finance_state) {
    latest.current = next;
    set_state(next);
    set_status('saving');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const s = latest.current;
      if (!s) return;
      fetch('/api/admin/finance', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: s }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('save');
          set_status('saved');
        })
        .catch(() => set_status('error'));
    }, 450);
  }

  function patch_card(fn: (c: tech_card) => tech_card) {
    if (!state || !card) return;
    persist({
      ...state,
      techCards: state.techCards.map((c) => (c.id === card.id ? fn(c) : c)),
    });
  }

  if (error) return <p className="mt-3 text-xs text-red-500">{error}</p>;
  if (!state) return <p className="mt-3 text-xs text-neutral-400">загружаю этапы…</p>;
  if (!card) {
    return (
      <p className="mt-3 text-xs text-neutral-400">
        рецепт ещё не создан — откройте раздел «меню» и выберите напиток
      </p>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-500">этапы готовки</p>
        {status === 'saving' ? (
          <span className="text-[11px] text-neutral-400">сохраняю…</span>
        ) : status === 'saved' ? (
          <span className="text-[11px] text-emerald-600">сохранено</span>
        ) : status === 'error' ? (
          <span className="text-[11px] text-red-500">не сохранилось</span>
        ) : null}
      </div>
      <PrepStepsEditor
        steps={resolved_card_prep_steps(card, state.materials)}
        materials={state.materials}
        base_ml={card_steps_base_ml(card)}
        size_keys={Object.keys(card.sizes)}
        on_change={(next) => patch_card((c) => apply_steps_to_card(c, next, state.materials))}
      />
      <p className="mt-2 text-[11px] text-neutral-400">кассир увидит эти шаги, когда нажмёт карточку заказа</p>
    </div>
  );
}
