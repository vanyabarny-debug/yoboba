'use client';

import { createElement, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import site_chrome from '@/components/site-chrome';
import { fetch_order_by_id } from '@/lib/orders';
import { format_order_number } from '@/lib/order-number';
import { default_store_address } from '@/lib/location';
import { BRAND_NAME } from '@/lib/brand';
import { format_price } from '@/lib/cart-summary';
import type { order } from '@/lib/types';

const track_steps: {
  id: order['status'];
  title: string;
  hint: string;
}[] = [
  { id: 'new', title: 'принят', hint: 'заказ ушёл на точку' },
  { id: 'preparing', title: 'готовим', hint: 'бариста уже за работой' },
  { id: 'ready', title: 'готов', hint: 'можно забирать' },
  { id: 'completed', title: 'выдан', hint: 'приятного!' },
];

const status_rank: Record<order['status'], number> = {
  new: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
  cancelled: -1,
};

function pickup_label(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function step_index(status: order['status']) {
  if (status === 'cancelled') return -1;
  return status_rank[status] ?? 0;
}

function track_client({ id }: { id: string }) {
  const router = useRouter();
  const [order, set_order] = useState<order | null>(null);
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(true);

  const load = useCallback(async () => {
    const { data, error: err } = await fetch_order_by_id(id);
    if (err || !data) {
      set_error(err?.message || 'заказ не найден');
      set_order(null);
      set_loading(false);
      return;
    }
    set_order(data);
    set_error('');
    set_loading(false);
    if (data.status === 'new' || data.status === 'preparing' || data.status === 'ready') {
      const { set_active_order_id } = await import('@/lib/active-order-store');
      set_active_order_id(data.id);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    if (order.status === 'completed' || order.status === 'cancelled') return;
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [order?.status, load, order]);

  const active = order ? step_index(order.status) : 0;
  const cancelled = order?.status === 'cancelled';
  const paid_bonus =
    order?.payment_type === 'bonus' ||
    (order?.payment_type === 'online' && Number(order?.total_price) === 0);
  const done = order?.status === 'completed';

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-4">
      <button
        type="button"
        onClick={() => router.push('/')}
        className="mb-4 text-sm font-medium text-neutral-500 hover:text-neutral-800"
      >
        ← в меню
      </button>

      {loading ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-soft">
          <p className="text-sm text-neutral-500">загружаем заказ…</p>
        </div>
      ) : error || !order ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-soft space-y-4">
          <p className="text-base font-semibold text-neutral-900">
            {error || 'заказ не найден'}
          </p>
          <Link
            href="/"
            className="inline-flex rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            на главную
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <header className="overflow-hidden rounded-3xl bg-neutral-900 px-6 py-7 text-white shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
              {BRAND_NAME} · заказ
            </p>
            <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
              № {format_order_number(order)}
            </h1>
            <p className="mt-3 text-sm text-white/70">
              {cancelled
                ? 'заказ отменён'
                : done
                  ? 'заказ уже выдан — ждем вас снова'
                  : `заберите в ${pickup_label(order.pickup_time)}`}
            </p>
            <p className="mt-1 text-xs text-white/45">{default_store_address}</p>
          </header>

          {!cancelled ? (
            <section className="rounded-3xl bg-white px-5 py-6 shadow-soft">
              <h2 className="text-sm font-bold text-neutral-900">статус</h2>
              <ol className="relative mt-5 space-y-0">
                {track_steps.map((step, i) => {
                  const reached = active >= i;
                  const current = active === i && !done;
                  const past = active > i || done;
                  return (
                    <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < track_steps.length - 1 ? (
                        <span
                          className={`absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-0.5 ${
                            past || (current && active > i) ? 'bg-accent' : 'bg-neutral-200'
                          } ${past ? 'bg-accent' : ''}`}
                          style={{
                            backgroundColor:
                              active > i || (done && i < track_steps.length - 1)
                                ? 'var(--color-accent, #FF6B6B)'
                                : undefined,
                          }}
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                          current
                            ? 'bg-accent text-white shadow-[0_0_0_6px_rgba(255,107,107,0.18)] animate-pulse'
                            : reached
                              ? 'bg-accent text-white'
                              : 'bg-neutral-100 text-neutral-400'
                        }`}
                      >
                        {reached && !current ? '✓' : i + 1}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p
                          className={`text-base font-bold leading-tight ${
                            reached ? 'text-neutral-900' : 'text-neutral-400'
                          }`}
                        >
                          {step.title}
                        </p>
                        <p
                          className={`mt-0.5 text-sm ${
                            current ? 'text-accent font-medium' : 'text-neutral-500'
                          }`}
                        >
                          {current ? step.hint : reached ? 'готово' : 'скоро'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : (
            <section className="rounded-3xl border border-neutral-200 bg-white px-5 py-6 text-center shadow-soft">
              <p className="text-base font-semibold text-neutral-800">заказ отменён</p>
              <p className="mt-1 text-sm text-neutral-500">если что-то пошло не так — напишите нам</p>
            </section>
          )}

          <section className="rounded-3xl bg-white px-5 py-5 shadow-soft space-y-3">
            <h2 className="text-sm font-bold text-neutral-900">состав</h2>
            <ul className="space-y-2">
              {(order.items || []).map((item, i) => (
                <li
                  key={`${item.menu_id}-${i}`}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 text-neutral-800">
                    {item.name}
                    <span className="text-neutral-400"> ×{item.quantity}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold text-neutral-900">
                    {format_price(item.price * item.quantity)} ₽
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm text-neutral-500">
                {paid_bonus
                  ? 'оплачен тапикоинами'
                  : order.is_paid
                    ? 'оплачен'
                    : 'к оплате на кассе'}
              </span>
              <span className="text-lg font-bold tabular-nums text-neutral-900">
                {format_price(Number(order.total_price))} ₽
              </span>
            </div>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/"
              className="flex-1 rounded-2xl bg-accent py-3.5 text-center text-sm font-semibold text-accent-foreground"
            >
              в меню
            </Link>
            <Link
              href="/profile"
              className="flex-1 rounded-2xl border border-neutral-200 bg-white py-3.5 text-center text-sm font-semibold text-neutral-800"
            >
              профиль
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function order_track_page() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  return createElement(
    site_chrome,
    null,
    id
      ? createElement(track_client, { id })
      : createElement(
          'div',
          { className: 'mx-auto max-w-lg px-4 py-10 text-center text-sm text-neutral-500' },
          'заказ не найден'
        )
  );
}
