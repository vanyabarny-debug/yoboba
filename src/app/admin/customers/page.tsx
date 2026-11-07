import { createElement, Suspense } from 'react';
import CustomersPage from '@/components/admin/customers-page';

export default function admin_customers_page() {
  return createElement(Suspense, { fallback: null }, createElement(CustomersPage));
}
