import type { store_spot } from '@/lib/types';

const WIDGET = 'https://yandex.ru/sprav/widget/rating-badge';

/** номер организации из кода виджета, ссылки на Карты или голых цифр */
export function parse_yandex_org_id(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  const badge = text.match(/rating-badge\/(\d+)/);
  if (badge) return badge[1];
  const org = text.match(/\/org\/(\d+)/);
  if (org) return org[1];
  if (/^\d{5,}$/.test(text)) return text;
  if (/yandex|iframe|org/i.test(text)) {
    const embedded = text.match(/(\d{6,})/);
    if (embedded) return embedded[1];
  }
  return '';
}

export function spot_yandex_org_id(
  spot: Pick<store_spot, 'yandex_org_id'> | null | undefined,
): string {
  if (!spot?.yandex_org_id) return '';
  return parse_yandex_org_id(spot.yandex_org_id);
}

export function yandex_widget_src(org_id: string): string {
  return `${WIDGET}/${org_id}?type=rating`;
}

export function yandex_review_url(
  spot: Pick<store_spot, 'yandex_org_id' | 'review_url'> | null | undefined,
): string {
  const custom = spot?.review_url?.trim();
  if (custom) return custom;
  const id = spot_yandex_org_id(spot);
  if (!id) return '';
  return `https://yandex.ru/maps/org/${id}/reviews`;
}

export function spot_has_yandex(
  spot: Pick<store_spot, 'yandex_org_id' | 'review_url'> | null | undefined,
): boolean {
  return Boolean(spot_yandex_org_id(spot) || spot?.review_url?.trim());
}
