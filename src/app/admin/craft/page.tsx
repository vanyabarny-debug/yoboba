'use client';

import AdminShell from '@/components/admin/admin-shell';
import DrinkCraft from '@/components/seller/drink-craft';

export default function admin_craft_page() {
  return (
    <AdminShell>
      <div className="min-h-[70vh] rounded-3xl border border-neutral-200 bg-white">
        <DrinkCraft />
      </div>
    </AdminShell>
  );
}
