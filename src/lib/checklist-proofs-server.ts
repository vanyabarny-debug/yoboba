import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import type { day_task_media } from '@/lib/day-task-templates';
import type { checklist_kind } from '@/lib/shift-checklist-templates';

export type checklist_item_proof = {
  id: string;
  kind: checklist_kind;
  item_id: string;
  task_id: string;
  spot_id: string;
  seller_id: string;
  shift_date: string;
  media: day_task_media;
  created_at: string;
};

const proofs_key = 'checklist-item-proofs';

export async function list_checklist_proofs(day = moscow_today_iso()) {
  const rows = await read_json_store<checklist_item_proof[]>(proofs_key, []);
  return rows.filter((row) => row.shift_date === day);
}

export async function proofs_map_for_task(kind: checklist_kind, task_id: string, day = moscow_today_iso()) {
  const rows = await list_checklist_proofs(day);
  const map = new Map<string, day_task_media>();
  for (const row of rows) {
    if (row.kind === kind && row.task_id === task_id) {
      map.set(row.item_id, row.media);
    }
  }
  return map;
}

export async function add_checklist_proof(record: checklist_item_proof) {
  const rows = await read_json_store<checklist_item_proof[]>(proofs_key, []);
  const next = [
    ...rows.filter((row) => !(row.kind === record.kind && row.item_id === record.item_id)),
    record,
  ].slice(-800);
  await write_json_store(proofs_key, next);
}

export async function all_proofs_recent(days_back = 7) {
  const rows = await read_json_store<checklist_item_proof[]>(proofs_key, []);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days_back);
  const min = cutoff.toISOString().slice(0, 10);
  return rows.filter((row) => row.shift_date >= min);
}
