export function item_stock_limited(item: {
  stock_limited?: boolean;
  stock_qty?: number | null;
}) {
  return item.stock_limited === true;
}

/** сколько осталось; null — лимит не включён */
export function item_stock_qty(item: {
  stock_limited?: boolean;
  stock_qty?: number | null;
}): number | null {
  if (!item_stock_limited(item)) return null;
  const n = Number(item.stock_qty);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function item_is_effectively_available(item: {
  is_available: boolean;
  stock_limited?: boolean;
  stock_qty?: number | null;
}) {
  if (!item.is_available) return false;
  const qty = item_stock_qty(item);
  if (qty === null) return true;
  return qty > 0;
}

/** показывать плашку «осталось N» как на ламоде */
export function item_show_stock_left(item: {
  is_available: boolean;
  stock_limited?: boolean;
  stock_qty?: number | null;
}) {
  if (!item_is_effectively_available(item)) return false;
  const qty = item_stock_qty(item);
  return qty !== null && qty > 0;
}

export function format_stock_left(qty: number) {
  if (qty === 1) return 'остался 1';
  if (qty >= 2 && qty <= 4) return `осталось ${qty}`;
  return `осталось ${qty}`;
}
