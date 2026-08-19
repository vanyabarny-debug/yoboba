import { NextResponse } from 'next/server';
import { is_admin_request, list_push_targets } from '@/lib/push-server';

export async function GET() {
  if (!(await is_admin_request())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  try {
    const data = await list_push_targets();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось загрузить подписчиков';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
