import { createElement } from 'react';
import site_content_page from '@/components/site-content-page';

export default function page() {
  return createElement(site_content_page, { slug: 'rabota' });
}
