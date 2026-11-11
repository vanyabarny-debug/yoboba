'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { SHEET_ANIM_MS, SHEET_OPEN_DELAY_MS } from '@/lib/drawer-ui';
import { useSheetSwipe } from '@/lib/use-sheet-swipe';

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

const moscow = 'Europe/Moscow';

function day_key(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: moscow,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function day_title(iso: string) {
  const key = day_key(iso);
  const today = day_key(new Date().toISOString());
  const yesterday = day_key(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'сегодня';
  if (key === yesterday) return 'вчера';
  return new Date(iso).toLocaleDateString('ru-RU', {
    timeZone: moscow,
    day: 'numeric',
    month: 'long',
  });
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    timeZone: moscow,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groups_of(items: inbox_item[]) {
  const groups: { key: string; title: string; items: inbox_item[] }[] = [];
  for (const item of items) {
    const key = day_key(item.created_at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, title: day_title(item.created_at), items: [item] });
  }
  return groups;
}

function glyph(item: inbox_item) {
  return item.emoji || (item.source === 'push' ? '🔔' : '💬');
}

function MessageCard({
  item,
  on_open,
}: {
  item: inbox_item;
  on_open: (item: inbox_item) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => on_open(item)}
      className={`w-full rounded-[22px] px-3.5 py-3 text-left transition active:scale-[0.99] ${
        item.unread ? 'bg-[#FFF6EA]' : 'bg-neutral-50'
      }`}
    >
      <span className="flex gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[22px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {glyph(item)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug text-neutral-900">{item.title}</span>
          <span className="mt-1 block text-[14px] leading-snug text-neutral-600">{item.body}</span>
          <span className="mt-1.5 block text-[12px] text-neutral-400">{clock(item.created_at)}</span>
        </span>
      </span>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="mt-3 max-h-52 w-full rounded-2xl object-cover" />
      ) : null}
    </button>
  );
}

function EmptyInbox() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-3xl">🔔</span>
      <p className="mt-4 text-base font-semibold text-neutral-900">пока тихо</p>
      <p className="mt-1 max-w-[16rem] text-sm leading-snug text-neutral-400">
        сообщения появятся здесь и останутся на месяц
      </p>
    </div>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const sheet_ref = useRef<HTMLDivElement>(null);
  const list_ref = useRef<HTMLDivElement>(null);
  const [open, set_open] = useState(false);
  const [items, set_items] = useState<inbox_item[]>([]);
  const [unread, set_unread] = useState(0);
  const [ready, set_ready] = useState(false);
  const [sheet_visible, set_sheet_visible] = useState(false);
  const [sheet_open, set_sheet_open] = useState(false);
  const [mobile, set_mobile] = useState(false);

  const open_ref = useRef(false);
  open_ref.current = open;

  const close = useCallback(() => set_open(false), []);
  const { sheet_props, backdrop_style } = useSheetSwipe({
    active: sheet_open,
    on_dismiss: close,
    vertical_only: true,
    get_scroll_top: () => list_ref.current?.scrollTop ?? 0,
  });

  const [was_open, set_was_open] = useState(false);
  if (was_open !== open) {
    set_was_open(open);
    set_sheet_open(false);
    if (open) set_sheet_visible(true);
  }

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
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => set_mobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
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
    const timer = window.setTimeout(() => set_sheet_open(true), SHEET_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open || !sheet_visible) return;
    const timer = window.setTimeout(() => set_sheet_visible(false), SHEET_ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [open, sheet_visible]);

  useEffect(() => {
    if (!open || !mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mobile]);

  useEffect(() => {
    if (!open) return;
    function on_down(e: MouseEvent) {
      const target = e.target as Node;
      if (root.current?.contains(target) || sheet_ref.current?.contains(target)) return;
      set_open(false);
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
  const groups = groups_of(items);

  const sheet =
    sheet_visible && typeof document !== 'undefined'
      ? createPortal(
          <div ref={sheet_ref} className="fixed inset-0 z-[70] min-[1024px]:hidden">
            <button
              type="button"
              aria-label="закрыть"
              className={`product-panel-backdrop absolute inset-0 bg-black/45 ${sheet_open ? 'is-visible' : ''}`}
              style={backdrop_style}
              onClick={() => set_open(false)}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col justify-end">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="уведомления"
                className={`inbox-sheet pointer-events-auto flex max-h-[92dvh] min-h-[46dvh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.16)] ${
                  sheet_open ? 'is-visible' : ''
                }`}
                {...sheet_props}
              >
                <div className="shrink-0 px-4 pb-2 pt-2.5">
                  <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-200" />
                  <div className="flex items-start justify-between gap-3 px-1">
                    <div>
                      <p className="text-[22px] font-bold leading-none text-neutral-900">уведомления</p>
                      <p className="mt-1.5 text-[13px] text-neutral-400">история за месяц</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => set_open(false)}
                      aria-label="закрыть"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                {items.length === 0 ? (
                  <EmptyInbox />
                ) : (
                  <div
                    ref={list_ref}
                    className="product-panel-body min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-[max(1.25rem,var(--safe-bottom))]"
                  >
                    {groups.map((group) => (
                      <section key={group.key}>
                        <p className="sticky top-0 z-10 bg-white/95 px-2 py-1.5 text-[12px] font-semibold text-neutral-400 backdrop-blur">
                          {group.title}
                        </p>
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <MessageCard key={item.id} item={item} on_open={open_item} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

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
          <path d="M10 18.2a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 py-[2px] text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 hidden w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] min-[1024px]:block">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">уведомления</p>
            <p className="text-[12px] text-neutral-400">история за месяц</p>
          </div>
          {items.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto px-3 py-3">
              {groups.map((group) => (
                <section key={group.key}>
                  <p className="px-1 pb-1.5 text-[12px] font-semibold text-neutral-400">{group.title}</p>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <MessageCard key={item.id} item={item} on_open={open_item} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {sheet}
    </div>
  );
}
