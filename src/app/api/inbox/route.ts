import { NextResponse } from 'next/server';
import { list_inbox, mark_inbox_read } from '@/lib/inbox-server';
import { create_server_client } from '@/lib/supabase/server';

async function current_user_id() {
  const supabase = await create_server_client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function GET() {
  const user_id = await current_user_id();
  if (!user_id) return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  const data = await list_inbox(user_id);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user_id = await current_user_id();
  if (!user_id) return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : [];
  await mark_inbox_read(user_id, ids.slice(0, 40));
  const data = await list_inbox(user_id);
  return NextResponse.json(data);
}
