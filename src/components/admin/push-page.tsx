'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';

type target = {
  key: string;
  user_id: string | null;
  name: string;
  phone: string | null;
  devices: number;
};

type payload = {
  configured?: boolean;
  total_devices?: number;
  targets?: target[];
  error?: string;
};

const presets = [
  {
    id: 'promo',
    label: 'акция',
    title: 'акция в yomoyo',
    body: 'загляни в приложение — новые вкусы и предложения',
    url: '/akcii',
  },
  {
    id: 'gift',
    label: 'подарок',
    title: 'вам подарок',
    body: 'друг отправил напиток — забери его в точке',
    url: '/profile',
  },
  {
    id: 'miss',
    label: 'скучаем',
    title: 'мы скучаем',
    body: 'загляни за бабл ти — сегодня особенно вкусно',
    url: '/',
  },
  {
    id: 'open',
    label: 'открытие',
    title: 'скоро открытие',
    body: 'yomoyo почти готов — следи за новостями в приложении',
    url: '/',
  },
] as const;

export default function push_page() {
  const [data, set_data] = useState<payload | null>(null);
  const [error, set_error] = useState('');
  const [query, set_query] = useState('');
  const [title, set_title] = useState('');
  const [body, set_body] = useState('');
  const [url, set_url] = useState('/');
  const [audience, set_audience] = useState<'all' | 'selected'>('all');
  const [picked, set_picked] = useState<Set<string>>(new Set());
  const [preset, set_preset] = useState<string>('');
  const [sending, set_sending] = useState(false);
  const [result, set_result] = useState('');

  useEffect(() => {
    fetch('/api/push/subscribers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: payload) => {
        if (body.error) {
          set_error(body.error);
          return;
        }
        set_data(body);
      })
      .catch(() => set_error('не удалось загрузить подписчиков'));
  }, []);

  const filtered = useMemo(() => {
    const list = data?.targets ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => {
      const hay = [t.name, t.phone, t.user_id].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [data, query]);

  function apply_preset(id: string) {
    const item = presets.find((p) => p.id === id);
    if (!item) return;
    set_preset(id);
    set_title(item.title);
    set_body(item.body);
    set_url(item.url);
  }

  function toggle(key: string) {
    set_picked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    set_audience('selected');
  }

  function select_visible(on: boolean) {
    set_picked((prev) => {
      const next = new Set(prev);
      for (const t of filtered) {
        if (on) next.add(t.key);
        else next.delete(t.key);
      }
      return next;
    });
    set_audience('selected');
  }

  async function handle_send(e: React.FormEvent) {
    e.preventDefault();
    set_sending(true);
    set_result('');
    const res = await fetch('/api/push/send', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        url,
        audience,
        keys: audience === 'selected' ? [...picked] : [],
      }),
    });
    const json = (await res.json()) as {
      sent?: number;
      failed?: number;
      total?: number;
      error?: string;
    };
    set_sending(false);
    if (!res.ok) {
      set_result(json.error || 'ошибка отправки');
      return;
    }
    set_result(
      `отправлено ${json.sent ?? 0} из ${json.total ?? 0}` +
        (json.failed ? ` · не дошло ${json.failed}` : '')
    );
  }

  const devices = data?.total_devices ?? 0;

  return (
    <AdminShell>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">пуш-рассылка</h2>
          <p className="text-sm text-neutral-500">
            уведомление упадёт в шторку телефона, если гость разрешил пуши и добавил
            приложение на экран
          </p>
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
            <p className="text-xs text-neutral-500">vapid</p>
            <p className="text-xl font-bold tabular-nums">
              {data?.configured ? 'готов' : 'нет'}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
            <p className="text-xs text-neutral-500">устройств</p>
            <p className="text-xl font-bold tabular-nums">{devices}</p>
          </div>
          <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
            <p className="text-xs text-neutral-500">получателей</p>
            <p className="text-xl font-bold tabular-nums">{data?.targets?.length ?? 0}</p>
          </div>
        </div>

        <form
          onSubmit={(e) => void handle_send(e)}
          className="rounded-2xl bg-white border border-neutral-200/80 p-4 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => apply_preset(p.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  preset === p.id
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => {
              set_preset('');
              set_title(e.target.value);
            }}
            placeholder="заголовок"
            required
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
          />
          <textarea
            value={body}
            onChange={(e) => {
              set_preset('');
              set_body(e.target.value);
            }}
            placeholder="текст в шторке"
            required
            rows={3}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none resize-none focus:ring-2 focus:ring-highlight"
          />
          <label className="block">
            <span className="text-xs text-neutral-500">куда открыть по нажатию</span>
            <input
              type="text"
              value={url}
              onChange={(e) => set_url(e.target.value)}
              placeholder="/"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
            />
          </label>

          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                checked={audience === 'all'}
                onChange={() => set_audience('all')}
              />
              всем с пушами · {devices}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                checked={audience === 'selected'}
                onChange={() => set_audience('selected')}
              />
              выбранным · {picked.size}
            </label>
          </div>

          <button
            type="submit"
            disabled={sending || !data?.configured}
            className="rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {sending ? 'отправляем…' : 'отправить'}
          </button>
          {result ? <p className="text-sm text-neutral-500">{result}</p> : null}
        </form>

        <div className="rounded-2xl bg-white border border-neutral-200/80 p-4 shadow-sm space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => set_query(e.target.value)}
              placeholder="поиск по имени или телефону"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => select_visible(true)}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700"
              >
                выбрать видимых
              </button>
              <button
                type="button"
                onClick={() => select_visible(false)}
                className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700"
              >
                снять
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-400">
              пока никто не разрешил уведомления — гость должен открыть приложение,
              оформить заказ или включить рассылку в профиле
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {filtered.map((t) => (
                <li key={t.key}>
                  <label className="flex cursor-pointer items-center gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={picked.has(t.key)}
                      onChange={() => toggle(t.key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-900">
                        {t.name}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {t.phone || 'без телефона'}
                        {t.devices > 1 ? ` · ${t.devices} устр.` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
