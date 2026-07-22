'use client';

import { createElement } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import business_dashboard from '@/components/admin/business-dashboard';

export default function admin_dashboard() {
  return createElement(AdminShell, {
    children: createElement(business_dashboard),
  });
}
