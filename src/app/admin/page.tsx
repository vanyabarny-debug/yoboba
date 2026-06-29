'use client';

import { createElement } from 'react';
import Link from 'next/link';
import online_counter from '@/components/admin/online-counter';
import live_carts from '@/components/admin/live-carts';
import revenue_charts from '@/components/admin/revenue-charts';
import push_form from '@/components/admin/push-form';

export default function admin_dashboard() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-page border-b border-surface">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-accent">админка yoboba</h1>
            <p className="text-xs text-neutral-500">live-аналитика и управление</p>
          </div>
          <nav className="flex gap-3 text-sm">
            <Link href="/admin/menu" className="text-neutral-600 hover:text-accent">
              меню
            </Link>
            <Link href="/" className="text-neutral-400">
              на сайт
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {createElement(online_counter)}
        <div className="md:col-span-1 lg:col-span-1">
          {createElement(live_carts)}
        </div>
        <div className="md:col-span-2 lg:col-span-1">
          {createElement(revenue_charts)}
        </div>
        <div className="md:col-span-2 lg:col-span-3 lg:max-w-md">
          {createElement(push_form)}
        </div>
      </main>
    </div>
  );
}
