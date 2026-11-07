'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** смены переехали в дашборд аналитики */
export default function AdminShiftsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);
  return (
    <p className="p-8 text-sm text-neutral-500">переходим в аналитику…</p>
  );
}
