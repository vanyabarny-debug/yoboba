/**
 * Объём раньше иногда вшивали в название строки заказа («таро 500мл»),
 * из‑за чего 500 и 650 выглядели как разные напитки. Храним объём в поле
 * volume, а имя оставляем чистым. Хелперы только читают/нормализуют —
 * массово БД не переписываем.
 */

const VOLUME_IN_NAME_RE = /(\d{3,4})\s*мл\b/i;
const VOLUME_STRIP_RE = /\s*[·•,]?\s*\d{3,4}\s*мл\b/gi;

export function volume_from_order_name(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const m = VOLUME_IN_NAME_RE.exec(name);
  return m?.[1];
}

/** убирает «500мл» / «650 мл» из названия, не трогая остальное */
export function strip_volume_from_order_name(name: string | null | undefined): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(VOLUME_STRIP_RE, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned || raw;
}

export function normalize_order_item_fields(input: {
  name?: string | null;
  volume?: string | null;
}): { name: string; volume?: string } {
  const raw_name = (input.name || '').trim() || 'напиток';
  const from_field =
    typeof input.volume === 'string' && /^\d+$/.test(input.volume.trim())
      ? input.volume.trim()
      : undefined;
  const from_name = volume_from_order_name(raw_name);
  const volume = from_field || from_name;
  return {
    name: strip_volume_from_order_name(raw_name),
    ...(volume ? { volume } : {}),
  };
}
