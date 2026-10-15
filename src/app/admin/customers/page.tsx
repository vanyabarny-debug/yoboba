import { createElement, Suspense } from 'react';
import customers_page from '@/components/admin/customers-page';

export default function admin_customers_page() {
  return createElement(Suspense, { fallback: null }, createElement(customers_page));
}
