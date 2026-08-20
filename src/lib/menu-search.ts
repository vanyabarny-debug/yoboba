import type { menu_item } from '@/lib/types';
import { get_default_site_content, get_site_content_store } from '@/lib/site-content-store';
import {
  get_composition_text,
  get_item_nutrition_base,
  get_item_volumes,
  get_topping_name,
} from '@/lib/product-details';
import { item_categories } from '@/lib/menu-item-categories';

export type menu_search_result = {
  item: menu_item;
  snippet: string;
  snippet_label: string;
  score: number;
};

function nutrition_text(item: menu_item) {
  const n = get_item_nutrition_base(item);
  const vols = get_item_volumes(item);
  const first = vols[0]?.ml ?? 100;
  const scale = vols.length > 0 ? first / 100 : 1;
  const scaled = {
    kcal: Math.round(n.kcal * scale),
    protein: Math.round(n.protein * scale * 10) / 10,
    fat: Math.round(n.fat * scale * 10) / 10,
    carb: Math.round(n.carb * scale * 10) / 10,
  };
  return [
    `${n.kcal} ккал`,
    `${n.protein} г белка`,
    `${n.fat} г жира`,
    `${n.carb} г углеводов`,
    `${scaled.kcal} ккал ${first} мл`,
    `${scaled.protein} белок`,
    `${scaled.carb} углеводы`,
    'грамм',
    ...vols.map((v) => `${v.ml} мл`),
  ].join(' ');
}

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, 'е').trim();
}

function escape_regex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlight_query(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, match: false }];

  const words = trimmed.split(/\s+/).filter(Boolean).map(escape_regex);
  if (!words.length) return [{ text, match: false }];

  const regex = new RegExp(`(${words.join('|')})`, 'gi');
  const parts = text.split(regex);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      match: words.some((word) => normalize(part).includes(normalize(word))),
    }));
}

function store_snapshot() {
  return typeof window === 'undefined' ? get_default_site_content() : get_site_content_store();
}

function item_fields(item: menu_item, all_items: menu_item[]) {
  const store = store_snapshot();
  const composition = get_composition_text(item) || 'основа, тапиока, лёд';
  const description =
    store.category_descriptions[item.category] ??
    'готовим после заказа — можно настроить объём, лёд и добавки.';
  const rec_names = item.recommendations
    .map((id) => all_items.find((i) => i.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  return [
    { label: 'название', text: item.name, weight: 100 },
    { label: 'категория', text: item_categories(item).join(' '), weight: 80 },
    { label: 'цена', text: `${item.price} руб ${item.price} ₽`, weight: 40 },
    { label: 'состав', text: `${composition}, ${item.name}`, weight: 60 },
    { label: 'описание', text: description, weight: 50 },
    { label: 'кбжу', text: nutrition_text(item), weight: 45 },
    { label: 'добавка', text: get_topping_name(item), weight: 35 },
    { label: 'рекомендации', text: rec_names, weight: 30 },
  ];
}

function matches_query(blob: string, query: string, words: string[]) {
  const q = normalize(query);
  if (!q) return false;
  if (blob.includes(q)) return true;
  if (words.length === 1) return words[0].length >= 1 && blob.includes(words[0]);
  return words.every((word) => blob.includes(word));
}

function score_fields(fields: ReturnType<typeof item_fields>, words: string[], full_query: string) {
  const q = normalize(full_query);
  let score = 0;

  for (const field of fields) {
    const hay = normalize(field.text);
    if (hay.includes(q)) score += field.weight * 2;
    for (const word of words) {
      if (hay.includes(word)) score += field.weight;
    }
  }

  return score;
}

export function search_menu_items(
  items: menu_item[],
  query: string,
  limit = 12
): menu_search_result[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const words = normalize(trimmed).split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const available = items.filter((i) => i.is_available);
  const results: menu_search_result[] = [];

  for (const item of available) {
    const fields = item_fields(item, items);
    const blob = normalize(fields.map((f) => f.text).join(' '));
    if (!matches_query(blob, trimmed, words)) continue;

    const score = score_fields(fields, words, trimmed);
    const hit =
      fields.find((f) => normalize(f.text).includes(normalize(trimmed))) ??
      fields.find((f) => words.some((w) => normalize(f.text).includes(w))) ??
      fields[0];

    results.push({
      item,
      snippet: hit.text,
      snippet_label: hit.label,
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
