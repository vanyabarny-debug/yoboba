import { get_menu_store } from '@/lib/menu-store';
import { get_promo_store } from '@/lib/promo-store';
import { get_site_content_store } from '@/lib/site-content-store';

export type site_link_group = 'основные' | 'меню' | 'страницы' | 'акции';

export type site_link = {
  href: string;
  label: string;
  group: site_link_group;
};

const staff_prefixes = [
  '/admin',
  '/seller',
  '/barista',
  '/squad',
  '/manage',
  '/auth',
  '/orders',
];

function is_guest_href(href: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  const path = href.split('?')[0] || '/';
  return !staff_prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function add_link(
  out: site_link[],
  seen: Set<string>,
  href: string,
  label: string,
  group: site_link_group
) {
  const next = href.trim() || '/';
  if (!is_guest_href(next) || seen.has(next)) return;
  seen.add(next);
  out.push({ href: next, label: label.trim() || next, group });
}

export function list_guest_site_links(): site_link[] {
  const out: site_link[] = [];
  const seen = new Set<string>();

  add_link(out, seen, '/', 'главная · меню', 'основные');
  add_link(out, seen, '/?cart=1', 'корзина', 'основные');
  add_link(out, seen, '/?gift=1', 'подарить напиток', 'основные');
  add_link(out, seen, '/profile', 'профиль', 'основные');
  add_link(out, seen, '/login', 'вход', 'основные');

  for (const category of get_menu_store().categories) {
    add_link(
      out,
      seen,
      `/?category=${encodeURIComponent(category)}`,
      category,
      'меню'
    );
  }

  const content = get_site_content_store();
  for (const page of content.pages) {
    add_link(out, seen, `/${page.slug}`, page.title, 'страницы');
  }
  for (const link of content.top_bar_links) {
    if (!link.is_active) continue;
    add_link(out, seen, link.href, link.label, 'страницы');
  }
  add_link(out, seen, content.lang_link.href, content.lang_link.label, 'страницы');

  for (const promo of get_promo_store().promos) {
    if (!promo.is_active || !promo.link_url) continue;
    add_link(out, seen, promo.link_url, promo.title, 'акции');
  }

  return out;
}

export function group_guest_site_links(links: site_link[]) {
  const groups: { group: site_link_group; items: site_link[] }[] = [];
  for (const link of links) {
    const last = groups[groups.length - 1];
    if (last?.group === link.group) last.items.push(link);
    else groups.push({ group: link.group, items: [link] });
  }
  return groups;
}
