'use client';

import { createElement } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import shifts_manage from '@/components/admin/shifts-manage';

export default function admin_shifts_page() {
  return createElement(AdminShell, {
    children: createElement(shifts_manage),
  });
}
