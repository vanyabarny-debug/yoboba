'use client';

import FinanceFrame from '@/components/admin/finance/finance-frame';
import TechcardsSection from '@/components/admin/finance/techcards-section';

export default function admin_techcards_page() {
  return (
    <FinanceFrame title="техкарты" hint="нажмите напиток — сразу откроется его рецепт">
      {(p) => <TechcardsSection {...p} />}
    </FinanceFrame>
  );
}
