import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import {
  default_day_tasks,
  parse_day_tasks,
  type day_task_proof_record,
  type day_task_template,
} from '@/lib/day-task-templates';

const tasks_key = 'day-tasks';
const proofs_key = 'day-task-proofs';

export async function get_day_task_templates(): Promise<day_task_template[]> {
  const raw = await read_json_store<unknown>(tasks_key, default_day_tasks);
  return parse_day_tasks(raw) ?? default_day_tasks;
}

export async function save_day_task_templates(tasks: day_task_template[]) {
  await write_json_store(tasks_key, tasks);
}

export async function add_day_task_proof(record: day_task_proof_record) {
  const rows = await read_json_store<day_task_proof_record[]>(proofs_key, []);
  const next = [...rows.filter((row) => row.id !== record.id), record].slice(-400);
  await write_json_store(proofs_key, next);
}

export async function proofs_for_day(day = moscow_today_iso()) {
  const rows = await read_json_store<day_task_proof_record[]>(proofs_key, []);
  return rows.filter((row) => row.day === day);
}
