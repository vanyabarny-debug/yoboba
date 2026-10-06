/** Шаблоны чек-листов смены: открытие, день, закрытие — правятся в админке */

import { default_closing_checklist, CLOSING_TASK_TIME } from '@/lib/closing-checklist';
import { default_day_checklist, DAY_TASK_TIME } from '@/lib/day-checklist';
import { default_opening_checklist, OPENING_TASK_TIME } from '@/lib/opening-checklist';
import type { day_task_media } from '@/lib/day-task-templates';

export type checklist_proof = 'none' | 'photo' | 'video' | 'any';

export type shift_checklist_template_item = {
  id: string;
  text: string;
  proof: checklist_proof;
  /** фото/видео-инструкция от админа (не путать с отчётом бариста) */
  media: day_task_media | null;
};

export type shift_checklist_section = {
  appear_at: string;
  items: shift_checklist_template_item[];
};

export type shift_checklist_bundle = {
  opening: shift_checklist_section;
  day: shift_checklist_section;
  closing: shift_checklist_section;
};

const proofs = new Set<checklist_proof>(['none', 'photo', 'video', 'any']);

function new_id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function strings_to_items(prefix: string, lines: string[]): shift_checklist_template_item[] {
  return lines.map((text, index) => ({
    id: `${prefix}-${index + 1}`,
    text,
    proof: 'none' as const,
    media: null,
  }));
}

export const default_shift_checklist_bundle: shift_checklist_bundle = {
  opening: { appear_at: OPENING_TASK_TIME, items: strings_to_items('open', default_opening_checklist) },
  day: { appear_at: DAY_TASK_TIME, items: strings_to_items('day', default_day_checklist) },
  closing: { appear_at: CLOSING_TASK_TIME, items: strings_to_items('close', default_closing_checklist) },
};

function clean_media(raw: unknown): day_task_media | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const kind = rec.kind === 'video' ? 'video' : rec.kind === 'image' ? 'image' : '';
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || !kind) return null;
  return { id, kind };
}

function parse_section(raw: unknown, fallback: shift_checklist_section): shift_checklist_section | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const appear_at = typeof rec.appear_at === 'string' ? rec.appear_at.trim() : fallback.appear_at;
  if (!/^\d{2}:\d{2}$/.test(appear_at)) return null;
  const [hh, mm] = appear_at.split(':').map((n) => Number(n));
  if (hh > 23 || mm > 59) return null;
  if (!Array.isArray(rec.items) || rec.items.length < 1 || rec.items.length > 80) return null;
  const items: shift_checklist_template_item[] = [];
  for (const row of rec.items) {
    if (!row || typeof row !== 'object') return null;
    const item = row as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    const proof = item.proof as checklist_proof;
    if (!/^[a-zA-Z0-9-]{2,80}$/.test(id)) return null;
    if (!text || text.length > 500) return null;
    if (!proofs.has(proof)) return null;
    items.push({ id, text, proof, media: clean_media(item.media) });
  }
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) return null;
  return { appear_at, items };
}

export function parse_shift_checklist_bundle(raw: unknown): shift_checklist_bundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const opening = parse_section(rec.opening, default_shift_checklist_bundle.opening);
  const day = parse_section(rec.day, default_shift_checklist_bundle.day);
  const closing = parse_section(rec.closing, default_shift_checklist_bundle.closing);
  if (!opening || !day || !closing) return null;
  return { opening, day, closing };
}

export type checklist_kind = 'opening' | 'day' | 'closing';

export function section_for_kind(bundle: shift_checklist_bundle, kind: checklist_kind) {
  return bundle[kind];
}

export function template_texts(section: shift_checklist_section): string[] {
  return section.items.map((i) => i.text);
}

/** подмешивает proof, инструкцию и id шаблона по порядку пунктов */
export function enrich_runtime_items<
  T extends { id: string; item_order: number; item_text: string; is_checked: boolean },
>(
  db_items: T[],
  section: shift_checklist_section,
  proofs_by_item: Map<string, day_task_media>
) {
  const by_order = new Map(section.items.map((t, i) => [i + 1, t]));
  return db_items.map((item) => {
    const tpl = by_order.get(item.item_order);
    const proof_media = proofs_by_item.get(item.id) ?? null;
    return {
      ...item,
      template_item_id: tpl?.id ?? null,
      proof: tpl?.proof ?? ('none' as checklist_proof),
      instruction_media: tpl?.media ?? null,
      proof_media,
    };
  });
}

export function empty_template_item(): shift_checklist_template_item {
  return { id: new_id('item'), text: '', proof: 'none', media: null };
}

export function should_show_checklist_at(appear_at: string, now = new Date()): boolean {
  const moscow_time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const to_min = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
  };
  return to_min(moscow_time) >= to_min(appear_at);
}
