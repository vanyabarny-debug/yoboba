'use client';

import { createElement, useEffect, useState } from 'react';
import Link from 'next/link';
import type { store_spot } from '@/lib/types';
import spot_edit_sheet from '@/components/admin/spot-edit-sheet';
import {
  delete_spot,
  get_spots,
  new_spot_id,
  subscribe_spot_store,
  upsert_spot,
} from '@/lib/spot-store';

export default function spots_manage() {
  const [spots, set_spots] = useState<store_spot[]>([]);
  const [editing, set_editing] = useState<store_spot | null>(null);

  useEffect(() => {
    function reload() {
      set_spots(get_spots());
    }
    reload();
    return subscribe_spot_store(reload);
  }, []);

  function open_create() {
    set_editing({
      id: new_spot_id(),
      city: 'кимры',
      address: '',
      label: '',
      is_active: true,
    });
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-page border-b border-surface">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-accent">точки выдачи</h1>
            <p className="text-xs text-neutral-500">адреса магазинов для выбора в приложении</p>
          </div>
          <nav className="flex gap-3 text-sm">
            <Link href="/admin" className="text-neutral-600 hover:text-accent">
              дашборд
            </Link>
            <Link href="/" className="text-neutral-400">
              на сайт
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <button
          type="button"
          onClick={open_create}
          className="rounded-pill bg-accent text-accent-foreground px-5 py-2.5 text-sm font-medium"
        >
          + добавить точку
        </button>

        <div className="grid gap-3">
          {spots.map((spot) => (
            <div
              key={spot.id}
              className={`rounded-card bg-page border border-surface p-4 flex items-start justify-between gap-4 ${
                !spot.is_active ? 'opacity-50' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{spot.address}</p>
                <p className="text-sm text-neutral-500 mt-1 capitalize">
                  {spot.city}
                  {spot.label ? ` · ${spot.label}` : ''}
                  {!spot.is_active ? ' · неактивна' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => set_editing(spot)}
                className="text-sm text-accent font-medium shrink-0"
              >
                править
              </button>
            </div>
          ))}
        </div>
      </main>

      {editing &&
        createElement(spot_edit_sheet, {
          spot: editing,
          on_close: () => set_editing(null),
          on_save: upsert_spot,
          on_delete: delete_spot,
        })}
    </div>
  );
}
