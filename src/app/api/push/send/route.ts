import { NextResponse } from 'next/server';
import { is_admin_request, send_web_push } from '@/lib/push-server';

export async function POST(request: Request) {
  if (!(await is_admin_request())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    url?: string;
    audience?: 'all' | 'selected';
    keys?: string[];
  };

  const title = String(body.title || '').trim();
  const text = String(body.body || '').trim();
  if (!title || !text) {
    return NextResponse.json({ error: 'нужны заголовок и текст' }, { status: 400 });
  }

  const audience = body.audience === 'selected' ? 'selected' : 'all';
  if (audience === 'selected' && !(body.keys || []).length) {
    return NextResponse.json({ error: 'выберите, кому отправить' }, { status: 400 });
  }

  const url = String(body.url || '/').trim() || '/';
  const safe_url = url.startsWith('/') && !url.startsWith('//') ? url : '/';

  try {
    const result = await send_web_push({
      payload: { title, body: text, url: safe_url },
      audience,
      keys: body.keys,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось отправить';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
