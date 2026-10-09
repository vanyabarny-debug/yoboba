'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** старый маршрут — пуши живут в разделе клиентов */
export default function push_page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/customers');
  }, [router]);
  return null;
}
