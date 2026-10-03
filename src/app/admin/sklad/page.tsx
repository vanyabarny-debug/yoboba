'use client';

import FinanceFrame from '@/components/admin/finance/finance-frame';
import InventorySection from '@/components/admin/finance/inventory-section';

export default function admin_sklad_page() {
  return (
    <FinanceFrame title="склад" show_heading={false}>
      {(p) => <InventorySection {...p} />}
    </FinanceFrame>
  );
}
