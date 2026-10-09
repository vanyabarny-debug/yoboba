'use client';

import { createElement, useEffect, useState } from 'react';
import type { store_spot } from '@/lib/types';
import AdminShell from '@/components/admin/admin-shell';
import personnel_panel from '@/components/admin/personnel-panel';
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
  const [personnel_open, set_personnel_open] = useState(false);

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
    <AdminShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">точки выдачи</h2>
          <p className="text-sm text-neutral-500">адреса магазинов для выбора в приложении</p>
        </div>

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

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => set_personnel_open((v) => !v)}
            aria-expanded={personnel_open}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-neutral-50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900">персонал</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                сотрудники, стажёры и задачи смен
              </span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className={`shrink-0 text-neutral-400 transition-transform ${
                personnel_open ? 'rotate-180' : ''
              }`}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {personnel_open ? createElement(personnel_panel) : null}
        </div>
      </div>

      {editing &&
        createElement(spot_edit_sheet, {
          spot: editing,
          on_close: () => set_editing(null),
          on_save: upsert_spot,
          on_delete: delete_spot,
        })}
    </AdminShell>
  );
}
