'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type inbox_item = {
  id: string;
  title: string;
  body: string;
  emoji: string | null;
  image: string | null;
  href: string | null;
  source: 'inbox' | 'push';
  created_at: string;
  unread: boolean;
};

function when(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationBell() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, set_open] = useState(false);
  const [items, set_items] = useState<inbox_item[]>([]);
  const [unread, set_unread] = useState(0);
  const [ready, set_ready] = useState(false);

  const open_ref = useRef(false);
  open_ref.current = open;

  const load = useCallback(async () => {
    if (open_ref.current) return;
    try {
      const res = await fetch('/api/inbox', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) {
        set_ready(false);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { items?: inbox_item[]; unread?: number };
      set_items(body.items || []);
      set_unread(body.unread || 0);
      set_ready(true);
    } catch {
      /* сеть */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 25_000);
    function on_visible() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', on_visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', on_visible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function on_down(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) set_open(false);
    }
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') set_open(false);
    }
    document.addEventListener('mousedown', on_down);
    document.addEventListener('keydown', on_key);
    return () => {
      document.removeEventListener('mousedown', on_down);
      document.removeEventListener('keydown', on_key);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    set_open(next);
    if (!next) return;
    const fresh = items.filter((row) => row.unread).map((row) => row.id);
    if (!fresh.length) return;
    try {
      const res = await fetch('/api/inbox', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: fresh }),
      });
      if (!res.ok) return;
      set_unread(0);
    } catch {
      /* останется бейдж */
    }
  }

  function open_item(item: inbox_item) {
    set_open(false);
    if (item.href) router.push(item.href);
  }

  if (!ready) return null;

  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={unread ? `уведомления, ${unread} новых` : 'уведомления'}
        aria-expanded={open}
        onClick={() => void toggle()}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-neutral-800 transition hover:bg-neutral-200/80 active:scale-95"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 4.2 1.3 5.6 1.8 6.2H4.4c.5-.6 1.8-2 1.8-6.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M10 18.2a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 py-[2px] text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3.5 py-2.5">
            <p className="text-sm font-semibold text-neutral-900">уведомления</p>
            <button
              type="button"
              onClick={() => set_open(false)}
              aria-label="закрыть"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm text-neutral-400">пока пусто</p>
          ) : (
            <ul className="max-h-[min(70vh,28rem)] divide-y divide-neutral-100 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => open_item(item)}
                    className={`flex w-full gap-3 px-3.5 py-3 text-left hover:bg-neutral-50 ${
                      item.unread ? 'bg-[#FFF8EE]' : ''
                    }`}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg">
                      {item.emoji || (item.source === 'push' ? '🔔' : '💬')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-neutral-900">{item.title}</span>
                        <span className="shrink-0 text-[11px] text-neutral-400">{when(item.created_at)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-neutral-600">{item.body}</span>
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt=""
                          className="mt-2 max-h-36 w-full rounded-xl object-cover"
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
