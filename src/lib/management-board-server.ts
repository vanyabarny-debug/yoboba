import { read_json_store, write_json_store } from '@/lib/data-store';
import { get_day_task_templates, save_day_task_templates } from '@/lib/day-task-templates-server';
import {
  get_shift_checklist_templates,
  save_shift_checklist_templates,
} from '@/lib/shift-checklist-templates-server';
import { parse_shift_checklist_bundle } from '@/lib/shift-checklist-templates';
import {
  build_catalog,
  checklist_section_from_card,
  parse_management_store,
  patched_day_tasks,
  type board_card,
  type management_store,
} from '@/lib/management-board';

const store_key = 'management-board';

export type management_payload = {
  store: management_store;
  cards: board_card[];
};

async function catalog(store: management_store) {
  const [tasks, checklists] = await Promise.all([
    get_day_task_templates(),
    get_shift_checklist_templates(),
  ]);
  return build_catalog(tasks, store, {
    opening: checklists.opening.appear_at,
    closing: checklists.closing.appear_at,
    opening_items: checklists.opening.items,
    closing_items: checklists.closing.items,
  });
}

async function sync_sources(store: management_store) {
  const [tasks, checklists] = await Promise.all([
    get_day_task_templates(),
    get_shift_checklist_templates(),
  ]);
  const cards = build_catalog(tasks, store, {
    opening: checklists.opening.appear_at,
    closing: checklists.closing.appear_at,
    opening_items: checklists.opening.items,
    closing_items: checklists.closing.items,
  });
  const next_tasks = patched_day_tasks(tasks, cards);
  if (next_tasks && JSON.stringify(next_tasks) !== JSON.stringify(tasks)) {
    await save_day_task_templates(next_tasks);
  }
  const opening = cards.find((card) => card.id === 'opening');
  const closing = cards.find((card) => card.id === 'closing');
  const opening_section = opening
    ? checklist_section_from_card(opening, checklists.opening.appear_at)
    : null;
  const closing_section = closing
    ? checklist_section_from_card(closing, checklists.closing.appear_at)
    : null;
  const bundle = {
    ...checklists,
    opening: opening_section || checklists.opening,
    closing: closing_section || checklists.closing,
  };
  if (!parse_shift_checklist_bundle(bundle)) return;
  if (JSON.stringify(bundle) !== JSON.stringify(checklists)) {
    await save_shift_checklist_templates(bundle);
  }
}

export async function read_management_board(): Promise<management_payload> {
  const raw = await read_json_store<unknown>(store_key, { overrides: {}, customs: [], placements: [] });
  const store = parse_management_store(raw);
  return { store, cards: await catalog(store) };
}

export async function write_management_board(raw: unknown): Promise<management_payload> {
  const store = parse_management_store(raw);
  await write_json_store(store_key, store);
  await sync_sources(store);
  return { store, cards: await catalog(store) };
}
