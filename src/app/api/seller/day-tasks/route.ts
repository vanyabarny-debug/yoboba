import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { get_day_task_templates } from '@/lib/day-task-templates-server';

export async function GET() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const tasks = await get_day_task_templates();
  return NextResponse.json(
    { tasks },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
