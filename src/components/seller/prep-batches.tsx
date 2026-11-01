'use client';

import { useCallback, useEffect, useState } from 'react';
import type { prep_batch_view } from '@/lib/finance/prep-batches';
import { FLOATING_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';

/* ------------------------------------------------------------------ */
/* данные                                                              */
/* ------------------------------------------------------------------ */

export type material_option = { id: string; name: string; unit: string };

export function usePrepBatches(spot_id: string) {
  const [preps, set_preps] = useState<prep_batch_view[]>([]);
  const [materials, set_materials] = useState<material_option[]>([]);
  const load = useCallback(async () => {
    try {
      const q = spot_id ? `?spot_id=${encodeURIComponent(spot_id)}` : '';
      const res = await fetch(`/api/seller/preps${q}`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const body = (await res.json()) as { preps?: prep_batch_view[]; materials?: material_option[] };
      set_preps(body.preps ?? []);
      if (body.materials) set_materials(body.materials);
    } catch {
      /* сеть моргнула — покажем прошлое */
    }
  }, [spot_id]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const t = window.setInterval(() => void load(), 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [load]);
  return { preps, materials, set_preps, reload: load };
}

/* ------------------------------------------------------------------ */
/* оформление                                                          */
/* ------------------------------------------------------------------ */

type tone = { liquid: string; deep: string; bg: string; fg: string; border: string };

const TONES: { test: RegExp; tone: tone }[] = [
  { test: /сыр|cheese/i, tone: { liquid: '#F7DC8C', deep: '#E9B949', bg: '#FFF8E6', fg: '#8A5A12', border: '#F2DDB0' } },
  { test: /тыкв|pumpkin/i, tone: { liquid: '#F6A04D', deep: '#E07A1F', bg: '#FFF1E3', fg: '#B5520F', border: '#FFD3A8' } },
  { test: /таро|taro|ube/i, tone: { liquid: '#C9A7E8', deep: '#9B6FCB', bg: '#F6EEFD', fg: '#6B3FA0', border: '#E1CDF5' } },
  { test: /клубн|ягод|straw/i, tone: { liquid: '#F59AA8', deep: '#E0566C', bg: '#FFEFF2', fg: '#B23048', border: '#FBCBD3' } },
  { test: /матч|matcha|зел/i, tone: { liquid: '#A9D18E', deep: '#6FA54A', bg: '#F0F7E8', fg: '#4F7A22', border: '#D4E8B8' } },
];
const DEFAULT_TONE: tone = { liquid: '#F3E3C3', deep: '#D9B97A', bg: '#FBF6EC', fg: '#7A5A22', border: '#EADCBF' };

export function prep_tone(name: string): tone {
  return TONES.find((row) => row.test.test(name))?.tone ?? DEFAULT_TONE;
}

function format_g(n: number) {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кг`;
  return `${v} г`;
}

function format_qty(n: number, unit: string) {
  const v = Math.round(n * 10) / 10;
  if (unit === 'г' && Math.abs(v) >= 1000) return format_g(v);
  return `${v.toLocaleString('ru-RU')} ${unit}`;
}

function made_at(iso: string | null) {
  if (!iso) return '';
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return '';
  const day = (d: Date) => d.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  const time = t.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (day(t) === day(now)) return `сегодня в ${time}`;
  const y = new Date(now.getTime() - 86_400_000);
  if (day(t) === day(y)) return `вчера в ${time}`;
  return `${t.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' })} в ${time}`;
}

function level_text(p: prep_batch_view) {
  if (!p.tracked) return 'не отмечали';
  if (p.levelG < -0.5) return `минус ${format_g(-p.levelG)}`;
  if (p.levelG <= 0.5) return 'пусто';
  return format_g(p.levelG);
}

/** банка с уровнем заготовки */
function Jar({ fill, name, size = 44, idle = false }: { fill: number; name: string; size?: number; idle?: boolean }) {
  const tone = prep_tone(name);
  const f = Math.max(0, Math.min(1, fill));
  const top = 14;
  const bottom = 58;
  const level = bottom - (bottom - top) * f;
  const clip = `jar-${name.replace(/[^a-zа-яё0-9]/gi, '').slice(0, 12)}-${size}`;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 52 60" aria-hidden="true" className="shrink-0">
      <defs>
        <clipPath id={clip}>
          <path d="M9 14 Q9 11 12 11 H40 Q43 11 43 14 V54 Q43 58 39 58 H13 Q9 58 9 54 Z" />
        </clipPath>
      </defs>
      <rect x="14" y="3" width="24" height="7" rx="2.5" fill={idle ? '#D4D4D4' : tone.deep} />
      <path
        d="M9 14 Q9 11 12 11 H40 Q43 11 43 14 V54 Q43 58 39 58 H13 Q9 58 9 54 Z"
        fill="rgba(255,255,255,0.85)"
        stroke={idle ? '#D4D4D4' : tone.deep}
        strokeWidth="2"
      />
      <g clipPath={`url(#${clip})`}>
        <rect
          x="0"
          y={level}
          width="52"
          height={60 - level}
          fill={tone.liquid}
          style={{ transition: 'y 600ms ease, height 600ms ease' }}
        />
        {f > 0.02 ? <rect x="0" y={level} width="52" height="2.5" fill={tone.deep} opacity="0.35" /> : null}
      </g>
      <path d="M14 18 V48" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* плитка на доске                                                     */
/* ------------------------------------------------------------------ */

export default function prep_batches_card({
  preps,
  on_open,
}: {
  preps: prep_batch_view[];
  on_open: () => void;
}) {
  const worst = preps.some((p) => p.alert === 'empty') ? 'empty' : preps.some((p) => p.alert === 'low') ? 'low' : 'ok';
  const shown = preps.slice(0, 4);
  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border ${
        worst === 'empty' ? 'border-red-300' : worst === 'low' ? 'border-amber-300' : ''
      }`}
      style={{
        background: 'linear-gradient(160deg, #FFFBF2 0%, #FFF3DC 100%)',
        borderColor: worst === 'ok' ? '#F2DDB0' : undefined,
        containerType: 'size',
      }}
    >
      <button
        type="button"
        onClick={on_open}
        className="flex min-h-0 flex-1 flex-col px-3 pb-2.5 pt-3 text-left active:scale-[0.99]"
        aria-label="заготовки"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[clamp(0.75rem,3.4cqw,1rem)] font-bold tracking-tight text-[#8A5A12]">заготовки</p>
          {worst !== 'ok' ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase text-white ${
                worst === 'empty' ? 'bg-red-500' : 'bg-amber-500'
              }`}
            >
              {worst === 'empty' ? 'пусто' : 'мало'}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex min-h-0 flex-1 flex-col justify-center gap-[clamp(0.25rem,2.5cqh,0.6rem)]">
          {shown.length ? (
            shown.map((p) => {
              const tone = prep_tone(p.name);
              return (
                <div key={p.id} className="flex min-w-0 items-center gap-2">
                  <Jar fill={p.fill} name={p.name} size={22} idle={!p.tracked} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[clamp(0.65rem,2.9cqw,0.85rem)] font-semibold leading-tight text-neutral-800">
                      {p.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/80">
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{
                            width: `${Math.round(p.fill * 100)}%`,
                            background: p.alert === 'empty' ? '#EF4444' : p.alert === 'low' ? '#F59E0B' : tone.deep,
                          }}
                        />
                      </div>
                      <span
                        className={`shrink-0 text-[clamp(0.6rem,2.6cqw,0.78rem)] font-semibold tabular-nums ${
                          p.alert === 'empty' ? 'text-red-600' : p.alert === 'low' ? 'text-amber-600' : 'text-neutral-500'
                        }`}
                      >
                        {p.tracked ? level_text(p) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-center text-xs text-neutral-400">пока нет рецептов</p>
          )}
          {preps.length > shown.length ? (
            <p className="text-[11px] font-semibold text-neutral-400">ещё {preps.length - shown.length}</p>
          ) : null}
        </div>
      </button>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* окно заготовок                                                       */
/* ------------------------------------------------------------------ */

type action = 'make' | 'add' | 'writeoff' | 'fact';

const ACTIONS: { id: action; label: string }[] = [
  { id: 'make', label: 'приготовить' },
  { id: 'add', label: 'добавить' },
  { id: 'writeoff', label: 'списать' },
  { id: 'fact', label: 'факт' },
];

function default_tab(p: prep_batch_view | null): action {
  return p && p.tracked && p.levelG > 0.5 ? 'add' : 'make';
}

/** доливают обычно жидкое — молоко в шапку */
function default_add(p: prep_batch_view) {
  return (p.ingredients.find((row) => row.unit === 'мл') ?? p.ingredients[0])?.materialId ?? '';
}

function recipe_grams(p: prep_batch_view) {
  return p.yieldG > 0 ? String(Math.round(p.yieldG)) : '';
}

const input_cls =
  'rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center text-base font-bold tabular-nums outline-none focus:border-accent';
const chip_cls = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
    on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 active:bg-neutral-200'
  }`;

/** монтировать только открытым — начальное состояние берётся при открытии */
export function PrepBatchesSheet({
  preps,
  spot_id,
  materials,
  on_close,
  on_preps,
}: {
  preps: prep_batch_view[];
  spot_id: string;
  /** всё, что можно добавить в заготовку кроме её состава */
  materials?: material_option[];
  on_close: () => void;
  on_preps: (next: prep_batch_view[]) => void;
}) {
  const [active_id, set_active_id] = useState<string | null>(() => (preps.length === 1 ? preps[0].id : null));
  const [tab, set_tab] = useState<action>(() => default_tab(preps.length === 1 ? preps[0] : null));
  const [grams, set_grams] = useState(() => (preps.length === 1 ? recipe_grams(preps[0]) : ''));
  const [add_id, set_add_id] = useState(() => (preps.length === 1 ? default_add(preps[0]) : ''));
  const [add_qty, set_add_qty] = useState('');
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const [notice, set_notice] = useState('');
  const [howto, set_howto] = useState(false);

  const active = preps.find((p) => p.id === active_id) ?? null;

  function pick(p: prep_batch_view | null) {
    set_active_id(p?.id ?? null);
    const t = default_tab(p);
    set_tab(t);
    set_grams(p && t === 'make' ? recipe_grams(p) : '');
    set_add_id(p ? default_add(p) : '');
    set_add_qty('');
    set_error('');
    set_notice('');
    set_howto(false);
  }

  function pick_tab(t: action) {
    set_tab(t);
    set_grams(active && t === 'make' ? recipe_grams(active) : '');
    set_error('');
    set_notice('');
  }

  const own_options: material_option[] = (active?.ingredients ?? []).map((row) => ({
    id: row.materialId,
    name: row.name,
    unit: row.unit,
  }));
  const add_options = {
    own: own_options,
    rest: (materials ?? []).filter((row) => !own_options.some((own) => own.id === row.id)),
  };

  async function post(payload: Record<string, unknown>, fail: string) {
    if (!active || busy) return;
    set_busy(true);
    set_error('');
    set_notice('');
    try {
      const res = await fetch('/api/seller/preps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...payload, recipeId: active.id, ...(spot_id ? { spot_id } : {}) }),
      });
      const body = (await res.json()) as { error?: string; message?: string; preps?: prep_batch_view[] };
      if (!res.ok) {
        set_error(body.error || fail);
        return;
      }
      if (body.preps) on_preps(body.preps);
      set_notice(body.message || 'готово');
      set_add_qty('');
      if (payload.kind !== 'make') set_grams('');
    } catch {
      set_error('сеть недоступна');
    } finally {
      set_busy(false);
    }
  }

  const g = Number(grams.replace(',', '.'));
  const g_ok = grams.trim() !== '' && Number.isFinite(g) && g > 0;
  const left = active ? Math.max(0, active.levelG) : 0;
  const scale = active && active.yieldG > 0 && g_ok ? g / active.yieldG : 1;
  const add_mat = [...add_options.own, ...add_options.rest].find((row) => row.id === add_id);
  const add_n = Number(add_qty.replace(',', '.'));
  const add_ok = Boolean(add_mat) && add_qty.trim() !== '' && Number.isFinite(add_n) && add_n > 0;
  const fact_ok = grams.trim() !== '' && Number.isFinite(g) && g >= 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label="закрыть"
        onClick={on_close}
      />
      <div className="relative w-full max-w-md">
        <button type="button" onClick={on_close} className={FLOATING_CLOSE_BTN_CLASS} aria-label="закрыть">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.22)]">
          {/* шапка */}
          <div
            className="flex items-center gap-3 px-4 pb-3 pt-4"
            style={{ background: active ? prep_tone(active.name).bg : '#FFFBF2' }}
          >
            {active && preps.length > 1 ? (
              <button
                type="button"
                onClick={() => pick(null)}
                className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-neutral-700"
                aria-label="все заготовки"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
            {active ? <Jar fill={active.fill} name={active.name} size={48} idle={!active.tracked} /> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold tracking-tight text-neutral-900">
                {active ? active.name : 'заготовки'}
              </p>
              {active ? (
                <p className="mt-0.5 text-sm tabular-nums text-neutral-600">
                  <span
                    className={`font-semibold ${
                      active.alert === 'empty' ? 'text-red-600' : active.alert === 'low' ? 'text-amber-600' : 'text-neutral-900'
                    }`}
                  >
                    {level_text(active)}
                  </span>
                  {active.tracked && active.fullG > 0 && active.levelG > 0.5 ? (
                    <span> из {format_g(active.fullG)}</span>
                  ) : null}
                  {active.startedAt ? <span className="text-neutral-400"> · {made_at(active.startedAt)}</span> : null}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-neutral-500">
                  сырьё списывается по заказам через рецепт. здесь — сколько осталось в контейнере
                </p>
              )}
            </div>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-4 pb-4 pt-3">
            {!active ? (
              /* список */
              <div className="space-y-2">
                {preps.length ? (
                  preps.map((p) => {
                    const tone = prep_tone(p.name);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pick(p)}
                        className="flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left active:scale-[0.99]"
                        style={{ background: tone.bg, borderColor: tone.border }}
                      >
                        <Jar fill={p.fill} name={p.name} size={36} idle={!p.tracked} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-neutral-900">{p.name}</p>
                          <p className="truncate text-xs text-neutral-500">
                            {p.tracked && p.startedAt ? made_at(p.startedAt) : 'нажми, когда приготовишь'}
                            {!p.ready ? ' · состав не заполнен' : ''}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-bold tabular-nums ${
                            p.alert === 'empty' ? 'text-red-600' : p.alert === 'low' ? 'text-amber-600' : 'text-neutral-800'
                          }`}
                        >
                          {level_text(p)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-sm text-neutral-400">
                    заготовок пока нет — их заводят в админке: склад → заготовки
                  </p>
                )}
              </div>
            ) : (
              /* одна заготовка */
              <div className="space-y-3">
                {!active.ready ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
                    у заготовки не заполнен состав — по заказам сырьё не списывается. заполните в админке: склад →
                    заготовки
                  </p>
                ) : null}

                <div className="grid grid-cols-4 gap-1 rounded-2xl bg-neutral-100 p-1">
                  {ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pick_tab(a.id)}
                      className={`rounded-xl py-2 text-xs font-semibold transition-colors ${
                        tab === a.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                {tab === 'make' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={grams}
                        onChange={(e) => set_grams(e.target.value)}
                        placeholder="г"
                        aria-label="сколько граммов приготовили"
                        className={`${input_cls} w-28 shrink-0`}
                      />
                      <span className="text-sm text-neutral-500">г готовой</span>
                    </div>
                    {active.yieldG > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {[0.5, 1, 2].map((k) => {
                          const v = Math.round(active.yieldG * k);
                          return (
                            <button key={k} type="button" className={chip_cls(Number(grams) === v)} onClick={() => set_grams(String(v))}>
                              {k === 1 ? 'рецепт' : k === 0.5 ? '½' : `×${k}`} · {format_g(v)}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {active.ingredients.length ? (
                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 px-3 py-2.5">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                          положить{g_ok ? ` на ${format_g(g)}` : ''}
                        </p>
                        <div className="space-y-1">
                          {active.ingredients.map((row) => {
                            const need = row.qty * scale;
                            const short = row.have + 0.5 < need;
                            return (
                              <div key={row.materialId} className="flex items-baseline gap-2 text-sm">
                                <span className="min-w-0 flex-1 truncate text-neutral-800">{row.name}</span>
                                <span className="font-bold tabular-nums text-neutral-900">{format_qty(need, row.unit)}</span>
                                <span
                                  className={`w-24 shrink-0 text-right text-[11px] tabular-nums ${
                                    short ? 'font-semibold text-red-600' : 'text-neutral-400'
                                  }`}
                                >
                                  склад {format_qty(Math.max(0, row.have), row.unit)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {active.steps.length ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => set_howto((v) => !v)}
                          className="text-xs font-semibold text-neutral-500"
                        >
                          {howto ? 'скрыть, как готовить' : 'как готовить'}
                        </button>
                        {howto ? (
                          <ol className="mt-1.5 space-y-1 text-sm text-neutral-700">
                            {active.steps.map((s, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="w-4 shrink-0 text-right text-neutral-400">{i + 1}.</span>
                                <span>
                                  <span className="font-semibold">{s.title}</span>
                                  {s.qty > 0 ? ` — ${format_qty(s.qty * scale, s.unit)}` : ''}
                                  {s.hint ? <span className="text-neutral-500"> · {s.hint}</span> : null}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </div>
                    ) : null}

                    {active.tracked && left > 0.5 ? (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled={busy || !g_ok}
                          onClick={() => void post({ kind: 'make', grams: g, mode: 'more' }, 'не удалось записать')}
                          className="w-full rounded-2xl bg-accent/95 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
                        >
                          {busy ? '…' : `доготовил${g_ok ? ` +${format_g(g)}` : ''} → ${format_g(left + (g_ok ? g : 0))}`}
                        </button>
                        <button
                          type="button"
                          disabled={busy || !g_ok}
                          onClick={() => {
                            if (!confirm(`старый остаток ${format_g(left)} спишется. начать новую партию?`)) return;
                            void post({ kind: 'make', grams: g, mode: 'new' }, 'не удалось записать');
                          }}
                          className="w-full rounded-2xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-50"
                        >
                          новая партия — старое выбросил
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || !g_ok}
                        onClick={() => void post({ kind: 'make', grams: g, mode: 'new' }, 'не удалось записать')}
                        className="w-full rounded-2xl bg-accent/95 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
                      >
                        {busy ? '…' : `приготовил${g_ok ? ` ${format_g(g)}` : ''}`}
                      </button>
                    )}
                    <p className="text-center text-[11px] text-neutral-400">
                      склад сейчас не трогаем: сырьё спишется по заказам — ровно столько, сколько ушло в стаканы
                    </p>
                  </div>
                ) : null}

                {tab === 'add' ? (
                  <div className="space-y-3">
                    <select
                      value={add_id}
                      onChange={(e) => set_add_id(e.target.value)}
                      aria-label="что добавили"
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm font-semibold outline-none focus:border-accent"
                    >
                      {!add_id ? <option value="">что добавили…</option> : null}
                      {add_options.own.length ? (
                        <optgroup label="из рецепта">
                          {add_options.own.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {add_options.rest.length ? (
                        <optgroup label="другое">
                          {add_options.rest.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={add_qty}
                        onChange={(e) => set_add_qty(e.target.value)}
                        placeholder={add_mat?.unit || 'г'}
                        aria-label="сколько добавили"
                        className={`${input_cls} w-28 shrink-0`}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[10, 20, 50].map((v) => (
                          <button key={v} type="button" className={chip_cls(add_qty === String(v))} onClick={() => set_add_qty(String(v))}>
                            {v} {add_mat?.unit || 'г'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !add_ok}
                      onClick={() => void post({ kind: 'add', materialId: add_id, qty: add_n }, 'не удалось добавить')}
                      className="w-full rounded-2xl bg-accent/95 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
                    >
                      {busy ? '…' : add_ok ? `добавил ${format_qty(add_n, add_mat!.unit)} ${add_mat!.name}` : 'добавил'}
                    </button>
                    <p className="text-center text-[11px] text-neutral-400">
                      сразу спишется со склада, а в контейнере станет на столько же больше
                    </p>
                  </div>
                ) : null}

                {tab === 'writeoff' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={grams}
                        onChange={(e) => set_grams(e.target.value)}
                        placeholder={left > 0.5 ? `всё — ${Math.round(left)}` : 'г'}
                        aria-label="сколько списать, г"
                        className={`${input_cls} w-32 shrink-0`}
                      />
                      <span className="text-sm text-neutral-500">г выбросили</span>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !active.ready || (!g_ok && left <= 0.5)}
                      onClick={() => {
                        const amount = g_ok ? g : left;
                        if (!confirm(`списать ${format_g(amount)} ${active.name}?`)) return;
                        void post({ kind: 'writeoff', ...(g_ok ? { grams: g } : {}) }, 'не удалось списать');
                      }}
                      className="w-full rounded-2xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-40"
                    >
                      {busy ? '…' : g_ok ? `списать ${format_g(g)}` : left > 0.5 ? `списать всё — ${format_g(left)}` : 'списать'}
                    </button>
                    <p className="text-center text-[11px] text-neutral-400">
                      сырьё уйдёт в списания в пропорции рецепта
                    </p>
                  </div>
                ) : null}

                {tab === 'fact' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={grams}
                        onChange={(e) => set_grams(e.target.value)}
                        placeholder="г"
                        aria-label="сколько сейчас в контейнере, г"
                        className={`${input_cls} w-28 shrink-0`}
                      />
                      <span className="text-sm text-neutral-500">г сейчас в контейнере</span>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !fact_ok}
                      onClick={() => void post({ kind: 'fact', grams: g }, 'не удалось записать')}
                      className="w-full rounded-2xl border border-neutral-200 py-3 text-sm font-bold text-neutral-800 disabled:opacity-50"
                    >
                      {busy ? '…' : 'так и есть'}
                    </button>
                    <p className="text-center text-[11px] text-neutral-400">
                      если меньше, чем показывает программа, разница спишется как потеря. можно 0
                    </p>
                  </div>
                ) : null}

                {notice ? <p className="text-center text-sm font-medium text-emerald-700">{notice}</p> : null}
                {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
