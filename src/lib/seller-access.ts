/** что сотрудник видит на кассе. нет поля в карточке — обычный набор бариста */

export const seller_right_ids = [
  'work',
  'ready',
  'pos',
  'stock',
  'stock_money',
  'craft',
  'analytics',
  'business',
] as const;

export type seller_right = (typeof seller_right_ids)[number];

export type seller_access = Record<seller_right, boolean>;

export const seller_right_label: Record<seller_right, string> = {
  work: 'в работе',
  ready: 'готовые',
  pos: 'касса',
  stock: 'склад',
  stock_money: 'склад в деньгах',
  craft: 'крафт напитка',
  analytics: 'аналитика смены',
  business: 'общая аналитика',
};

export function default_seller_access(): seller_access {
  return {
    work: true,
    ready: true,
    pos: true,
    stock: true,
    stock_money: false,
    craft: true,
    analytics: true,
    business: false,
  };
}

export function full_seller_access(): seller_access {
  return {
    work: true,
    ready: true,
    pos: true,
    stock: true,
    stock_money: true,
    craft: true,
    analytics: true,
    business: true,
  };
}

export function parse_seller_access(raw: unknown): seller_access {
  const access = default_seller_access();
  if (!raw || typeof raw !== 'object') return access;
  const rec = raw as Record<string, unknown>;
  for (const id of seller_right_ids) {
    if (typeof rec[id] === 'boolean') access[id] = rec[id];
  }
  if (access.stock_money) access.stock = true;
  const any_open = seller_right_ids.some((id) => id !== 'stock_money' && access[id]);
  if (!any_open) access.work = true;
  return access;
}
