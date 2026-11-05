/** фактические граммы заготовки на строку заказа: materialId → г */
export function parse_prep_grams(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 8)) {
    const id = key.trim().slice(0, 80);
    const grams = Number(value);
    if (!id || !Number.isFinite(grams) || grams < 0 || grams > 100_000) continue;
    out[id] = Math.round(grams * 10) / 10;
  }
  return Object.keys(out).length ? out : undefined;
}
