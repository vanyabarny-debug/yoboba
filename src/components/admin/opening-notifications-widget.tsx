'use client';

import { useEffect, useState } from 'react';

type opening_notification = {
  id: string;
  is_read: boolean;
  created_at: string;
  opening_tasks: {
    id: string;
    spot_address: string | null;
    shift_date: string;
    seller_name: string | null;
    completed_at: string | null;
  } | null;
};

export default function OpeningNotificationsWidget() {
  const [notifications, set_notifications] = useState<opening_notification[]>([]);
  const [loading, set_loading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/opening-notifications', {
          credentials: 'same-origin',
        });

        if (res.ok) {
          const data = (await res.json()) as {
            notifications: opening_notification[];
          };
          set_notifications(data.notifications || []);
        }
      } catch {
        // игнорируем
      } finally {
        set_loading(false);
      }
    }

    void load();
    const poll = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(poll);
  }, []);

  async function mark_read(id: string) {
    try {
      await fetch('/api/admin/opening-notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ notification_id: id, is_read: true }),
      });

      set_notifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      // игнорируем
    }
  }

  const unread = notifications.filter((n) => !n.is_read);

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-400">Загрузка уведомлений...</p>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">
          Открытия смен
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Уведомлений пока нет
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">
          Открытия смен
        </h3>
        {unread.length > 0 ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
            {unread.length} новых
          </span>
        ) : null}
      </div>

      <ul className="mt-3 space-y-2">
        {notifications.slice(0, 10).map((notif) => {
          const task = notif.opening_tasks;
          if (!task) return null;

          return (
            <li
              key={notif.id}
              className={`rounded-xl border p-3 ${
                notif.is_read
                  ? 'border-neutral-100 bg-neutral-50'
                  : 'border-green-200 bg-green-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {task.spot_address || 'Точка'}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    Открыл: {task.seller_name || 'бариста'}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {task.completed_at
                      ? new Date(task.completed_at).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : task.shift_date}
                  </p>
                </div>

                {!notif.is_read ? (
                  <button
                    type="button"
                    onClick={() => mark_read(notif.id)}
                    className="shrink-0 text-xs text-green-600 hover:text-green-700"
                  >
                    ✓
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {notifications.length > 10 ? (
        <p className="mt-2 text-center text-xs text-neutral-400">
          и ещё {notifications.length - 10}
        </p>
      ) : null}
    </div>
  );
}
