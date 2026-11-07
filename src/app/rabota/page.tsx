import { createElement } from 'react';
import SiteContentPage from '@/components/site-content-page';

export default function page() {
  return createElement(SiteContentPage, { slug: 'rabota' });
}
