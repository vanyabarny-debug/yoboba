'use client';

import { createElement } from 'react';
import admin_shell from '@/components/admin/admin-shell';
import business_dashboard from '@/components/admin/business-dashboard';
import { BRAND_NAME } from '@/lib/brand';

export default function admin_dashboard() {
  return createElement(
    admin_shell,
    {
      title: `админка ${BRAND_NAME}`,
      subtitle: 'ключевые показатели бизнеса',
      children: createElement(business_dashboard),
    }
  );
}
