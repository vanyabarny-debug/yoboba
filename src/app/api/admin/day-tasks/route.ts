import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { parse_day_tasks } from '@/lib/day-task-templates';
import {
  get_day_task_templates,
  proofs_for_day,
  save_day_task_templates,
} from '@/lib/day-task-templates-server';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const [tasks, proofs] = await Promise.all([get_day_task_templates(), proofs_for_day()]);
  return NextResponse.json({ tasks, proofs });
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { tasks?: unknown } | null;
  const tasks = parse_day_tasks(body?.tasks);
  if (!tasks) {
    return NextResponse.json({ error: 'проверьте название, время и страницы' }, { status: 400 });
  }
  await save_day_task_templates(tasks);
  return NextResponse.json({ tasks });
}
