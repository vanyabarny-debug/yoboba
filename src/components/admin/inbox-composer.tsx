'use client';

import { useMemo, useState } from 'react';
import { read_image_file } from '@/lib/image-upload';
import {
  group_guest_site_links,
  list_guest_site_links,
  type site_link,
} from '@/lib/site-pages';

type guest = { id: string; name: string; phone: string | null };

function is_account(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

async function shrink_image(data_url: string) {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('не удалось прочитать картинку'));
    img.src = data_url;
  });
  const max = 640;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return data_url;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export default function InboxComposer({ customers }: { customers: guest[] }) {
  const accounts = useMemo(() => customers.filter((c) => is_account(c.id)), [customers]);
  const [title, set_title] = useState('');
  const [body, set_body] = useState('');
  const [emoji, set_emoji] = useState('');
  const [image, set_image] = useState('');
  const [href, set_href] = useState('');
  const [audience, set_audience] = useState<'all' | 'selected'>('all');
  const [picked, set_picked] = useState<Set<string>>(new Set());
  const [query, set_query] = useState('');
  const [sending, set_sending] = useState(false);
  const [result, set_result] = useState('');
  const [links] = useState<site_link[]>(() => list_guest_site_links());

  const grouped = useMemo(() => group_guest_site_links(links), [links]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((c) => `${c.name} ${c.phone || ''}`.toLowerCase().includes(q));
  }, [accounts, query]);

  function toggle(id: string) {
    set_picked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    set_audience('selected');
  }

  async function on_file(file: File | undefined) {
    if (!file) return;
    try {
      const raw = await read_image_file(file, 4);
      const small = await shrink_image(raw);
      if (small.length > 180_000) {
        set_result('картинка слишком большая — выберите другую');
        return;
      }
      set_image(small);
      set_result('');
    } catch (err) {
      set_result(err instanceof Error ? err.message : 'не удалось загрузить картинку');
    }
  }

  async function handle_send(e: React.FormEvent) {
    e.preventDefault();
    const user_ids = audience === 'all' ? accounts.map((c) => c.id) : [...picked];
    if (!user_ids.length) {
      set_result('выберите гостей');
      return;
    }
    set_sending(true);
    set_result('');
    try {
      const res = await fetch('/api/admin/inbox', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          emoji,
          image: image || null,
          href: href || null,
          user_ids,
        }),
      });
      const json = (await res.json()) as { recipients?: number; error?: string };
      if (!res.ok) {
        set_result(json.error || 'не удалось отправить');
        return;
      }
      set_result(`в колокольчике у ${json.recipients ?? user_ids.length}`);
      set_title('');
      set_body('');
      set_emoji('');
      set_image('');
    } catch {
      set_result('не удалось отправить');
    } finally {
      set_sending(false);
    }
  }

  return (
    <form onSubmit={(e) => void handle_send(e)} className="space-y-4">
      <p className="text-sm text-neutral-500">
        сообщение копится в колокольчике рядом с профилем. шторку телефона не трогаем
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs text-neutral-500">эмодзи</span>
          <input
            value={emoji}
            onChange={(e) => set_emoji(e.target.value)}
            placeholder="🧋"
            className="mt-1 w-20 rounded-xl border border-neutral-200 px-3 py-2.5 text-center text-lg outline-none focus:ring-2 focus:ring-highlight"
          />
        </label>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-neutral-500">картинка</span>
          <div className="mt-1 flex items-center gap-2">
            <label className="cursor-pointer rounded-xl bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200">
              {image ? 'заменить' : 'загрузить'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void on_file(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {image ? (
              <button
                type="button"
                onClick={() => set_image('')}
                className="text-xs font-medium text-neutral-500"
              >
                убрать
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-28 w-full rounded-xl object-cover" />
      ) : null}

      <input
        value={title}
        onChange={(e) => set_title(e.target.value)}
        placeholder="заголовок"
        required
        className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
      />
      <textarea
        value={body}
        onChange={(e) => set_body(e.target.value)}
        placeholder="текст"
        required
        rows={3}
        className="w-full resize-none rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
      />
      <label className="block">
        <span className="text-xs text-neutral-500">куда открыть по нажатию</span>
        <select
          value={href}
          onChange={(e) => set_href(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
        >
          <option value="">никуда</option>
          {grouped.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.items.map((link) => (
                <option key={link.href} value={link.href}>
                  {link.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="inbox-audience"
            checked={audience === 'all'}
            onChange={() => set_audience('all')}
          />
          всем клиентам · {accounts.length}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="inbox-audience"
            checked={audience === 'selected'}
            onChange={() => set_audience('selected')}
          />
          выбранным · {picked.size}
        </label>
      </div>

      <button
        type="submit"
        disabled={sending || accounts.length === 0}
        className="rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {sending ? 'отправляем…' : 'в колокольчик'}
      </button>
      {result ? <p className="text-sm text-neutral-500">{result}</p> : null}

      <div className="space-y-3 border-t border-neutral-100 pt-4">
        <input
          type="search"
          value={query}
          onChange={(e) => set_query(e.target.value)}
          placeholder="поиск по имени или телефону"
          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
        />
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-400">нет клиентов с аккаунтом</p>
        ) : (
          <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">{c.name}</span>
                    <span className="block text-xs text-neutral-500">{c.phone || 'без телефона'}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
