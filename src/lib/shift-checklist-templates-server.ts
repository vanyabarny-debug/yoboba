import { read_json_store, write_json_store } from '@/lib/data-store';
import {
  default_shift_checklist_bundle,
  parse_shift_checklist_bundle,
  type shift_checklist_bundle,
} from '@/lib/shift-checklist-templates';

const store_key = 'shift-checklist-templates';

export async function get_shift_checklist_templates(): Promise<shift_checklist_bundle> {
  const raw = await read_json_store<unknown>(store_key, default_shift_checklist_bundle);
  return parse_shift_checklist_bundle(raw) ?? default_shift_checklist_bundle;
}

export async function save_shift_checklist_templates(bundle: shift_checklist_bundle) {
  await write_json_store(store_key, bundle);
}
