'use client';

import { useSearchParams } from 'next/navigation';
import FinanceFrame from '@/components/admin/finance/finance-frame';
import TechcardsSection from '@/components/admin/finance/techcards-section';

export default function admin_menu_page() {
  const craft = useSearchParams().get('craft') === '1';
  return (
    <FinanceFrame title="меню" show_heading={false}>
      {(props) => <TechcardsSection {...props} start_craft={craft} />}
    </FinanceFrame>
  );
}
