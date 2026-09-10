'use client';

import { useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import InternsManage from '@/components/admin/interns-manage';
import SellersManage from '@/components/admin/sellers-manage';

export default function personnel_page() {
  const [tab, set_tab] = useState<'interns' | 'staff'>('interns');

  return (
    <AdminShell>
      <div className="mb-4 flex w-fit gap-1 rounded-xl border border-surface bg-white p-1">
        <button
          type="button"
          onClick={() => set_tab('interns')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === 'interns' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          стажёры
        </button>
        <button
          type="button"
          onClick={() => set_tab('staff')}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            tab === 'staff' ? 'bg-neutral-900 text-white' : 'text-neutral-500'
          }`}
        >
          кассиры
        </button>
      </div>
      {tab === 'interns' ? <InternsManage /> : <SellersManage bare />}
    </AdminShell>
  );
}
