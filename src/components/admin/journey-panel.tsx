'use client';

import { useMemo, useState } from 'react';
import {
  customer_journey,
  journey_report,
  type journey_order,
} from '@/lib/customer-journey';

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function days(n: number | null) {
  if (n == null) return '—';
  if (n < 1) return 'в тот же день';
  const r = Math.round(n);
  return `${r} ${plural(r, 'день', 'дня', 'дней')}`;
}

/** как гости возвращаются: первая покупка → вернулся ли → через сколько → что берут повторно */
export function JourneyPanel({ customers }: { customers: { orders: journey_order[] }[] }) {
  const [open, set_open] = useState(false);
  const [tab, set_tab] = useState<'repeat' | 'first'>('repeat');
  const report = useMemo(() => (open ? journey_report(customers) : null), [customers, open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => set_open(true)}
        className="w-full rounded-2xl bg-white px-3 py-2.5 text-left text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200"
      >
        поведение гостей
        <span className="ml-2 text-xs font-normal text-neutral-400">первая покупка, возврат, повторные</span>
      </button>
    );
  }
  if (!report) return null;

  const max_bucket = Math.max(1, ...report.second_buckets.map((b) => b.count));
  const repeat_rows = report.items.filter((r) => r.rebuyers > 0).slice(0, 10);
  const first_rows = [...report.items].filter((r) => r.first > 0).sort((a, b) => b.first - a.first).slice(0, 10);

  return (
    <section className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">поведение гостей</p>
        <button type="button" onClick={() => set_open(false)} className="text-xs font-medium text-neutral-500">
          свернуть
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="гостей с покупками" v={String(report.guests)} />
        <Stat k="вернулись" v={`${report.returned} · ${pct(report.return_rate)}`} />
        <Stat k="второй визит, медиана" v={days(report.median_days_to_second)} />
        <Stat k="во 2-й раз то же самое" v={pct(report.same_second_share)} />
        <Stat k="пропали (не были >2 интервалов)" v={String(report.overdue)} tone="warn" />
        <Stat k="пришли раз за 30 дней, ждём" v={String(report.one_and_done_recent)} />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-neutral-600">через сколько вернулись во второй раз</p>
        {report.second_buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-neutral-500">{b.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <span
                className="block h-full rounded-full bg-emerald-500"
                style={{ width: `${(b.count / max_bucket) * 100}%` }}
              />
            </span>
            <span className="w-6 text-right tabular-nums text-neutral-700">{b.count}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ['repeat', 'что берут повторно'],
            ['first', 'с чего начинают'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => set_tab(id)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              tab === id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'repeat' ? (
        <table className="w-full text-xs">
          <thead className="text-neutral-400">
            <tr>
              <th className="py-1 text-left font-medium">позиция</th>
              <th className="py-1 text-right font-medium" title="гостей, взявших в 2+ визитах">
                берут снова
              </th>
              <th className="py-1 text-right font-medium" title="из всех, кто пробовал">
                доля
              </th>
              <th className="py-1 text-right font-medium" title="взяли во второй визит">
                во 2-й раз
              </th>
            </tr>
          </thead>
          <tbody>
            {repeat_rows.map((r) => (
              <tr key={r.name} className="border-t border-neutral-100">
                <td className="py-1 pr-2 text-neutral-800">{r.name}</td>
                <td className="py-1 text-right tabular-nums">{r.rebuyers}</td>
                <td className="py-1 text-right tabular-nums">{pct(r.buyers ? r.rebuyers / r.buyers : 0)}</td>
                <td className="py-1 text-right tabular-nums">{r.as_second}</td>
              </tr>
            ))}
            {!repeat_rows.length ? (
              <tr>
                <td colSpan={4} className="py-2 text-neutral-400">
                  пока никто не брал одно и то же дважды
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-neutral-400">
            <tr>
              <th className="py-1 text-left font-medium">первая покупка</th>
              <th className="py-1 text-right font-medium">гостей</th>
              <th className="py-1 text-right font-medium">вернулись</th>
            </tr>
          </thead>
          <tbody>
            {first_rows.map((r) => (
              <tr key={r.name} className="border-t border-neutral-100">
                <td className="py-1 pr-2 text-neutral-800">{r.name}</td>
                <td className="py-1 text-right tabular-nums">{r.first}</td>
                <td className="py-1 text-right tabular-nums">
                  {r.first_returned} · {pct(r.first ? r.first_returned / r.first : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report.transitions.length ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">первая → вторая покупка</p>
          {report.transitions.map((t) => (
            <p key={`${t.from}-${t.to}`} className="text-xs text-neutral-700">
              {t.from} <span className="text-neutral-400">→</span> {t.to}
              <span className="ml-1 tabular-nums text-neutral-400">×{t.count}</span>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-2.5 py-2">
      <p className="text-[11px] leading-tight text-neutral-500">{k}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-700' : 'text-neutral-900'}`}>
        {v}
      </p>
    </div>
  );
}

/** путь одного гостя — для карточки */
export function CustomerJourneyCard({ orders }: { orders: journey_order[] }) {
  const j = useMemo(() => customer_journey(orders), [orders]);
  if (!j.visits) return null;
  const rows: [string, string][] = [
    ['первая покупка', `${j.first_items.join(', ') || '—'}${j.first_at ? ` · ${new Date(j.first_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' })}` : ''}`],
    ['вернулся', j.returned ? `да, через ${days(j.days_to_second)}` : 'пока нет'],
  ];
  if (j.returned) rows.push(['во второй раз', j.second_items.join(', ') || '—']);
  rows.push(['визитов', String(j.visits)]);
  if (j.avg_gap != null) rows.push(['обычно между визитами', days(j.avg_gap)]);
  if (j.repeat_favorite) rows.push(['берёт снова', `${j.repeat_favorite.name} · ${j.repeat_favorite.visits} ${plural(j.repeat_favorite.visits, 'визит', 'визита', 'визитов')}`]);
  rows.push(['последний раз', j.days_since_last === 0 ? 'сегодня' : `${days(j.days_since_last)} назад`]);
  return (
    <div className="space-y-1 rounded-xl bg-white/70 p-2.5 ring-1 ring-neutral-200/70">
      <p className="text-xs font-semibold text-neutral-800">
        путь гостя{j.overdue ? <span className="ml-1.5 font-medium text-amber-700">· давно не был</span> : null}
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="shrink-0 text-neutral-500">{k}</span>
          <span className="text-right text-neutral-800">{v}</span>
        </div>
      ))}
    </div>
  );
}
