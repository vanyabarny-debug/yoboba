import { proofs_map_for_task } from '@/lib/checklist-proofs-server';
import {
  enrich_runtime_items,
  section_for_kind,
  template_texts,
  type checklist_kind,
} from '@/lib/shift-checklist-templates';
import { get_shift_checklist_templates } from '@/lib/shift-checklist-templates-server';

type db_item = {
  id: string;
  item_order: number;
  item_text: string;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
};

export async function checklist_items_for_new_task(kind: checklist_kind) {
  const bundle = await get_shift_checklist_templates();
  return template_texts(section_for_kind(bundle, kind));
}

export async function enrich_checklist_items(
  kind: checklist_kind,
  task_id: string,
  shift_date: string,
  items: db_item[]
) {
  const bundle = await get_shift_checklist_templates();
  const section = section_for_kind(bundle, kind);
  const proofs = await proofs_map_for_task(kind, task_id, shift_date);
  return enrich_runtime_items(items, section, proofs);
}

export async function template_proof_for_item(
  kind: checklist_kind,
  item_order: number
): Promise<'none' | 'photo' | 'video' | 'any'> {
  const bundle = await get_shift_checklist_templates();
  const section = section_for_kind(bundle, kind);
  return section.items[item_order - 1]?.proof ?? 'none';
}
