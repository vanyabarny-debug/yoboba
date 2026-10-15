import { NextResponse } from 'next/server';
import { parse_push_categories } from '@/lib/push-categories';
import {
  caller_push_categories,
  is_admin_request,
  push_keys_for_categories,
  send_web_push,
} from '@/lib/push-server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    url?: string;
    audience?: 'all' | 'selected' | 'categories';
    keys?: string[];
    categories?: string[];
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

  if (body.audience === 'categories') {
    const allowed = await caller_push_categories();
    if (!allowed) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
    const picked = parse_push_categories(body.categories).filter((id) => allowed.includes(id));
    if (!picked.length) {
      return NextResponse.json({ error: 'выберите категорию' }, { status: 400 });
    }
    try {
      const match = await push_keys_for_categories(picked);
      if (!match.keys.length) return NextResponse.json({ sent: 0, failed: 0, total: 0, people: 0 });
      const result = await send_web_push({
        payload: { title, body: text, url: safe_url },
        audience: 'selected',
        keys: match.keys,
      });
      return NextResponse.json({ ...result, people: match.people });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'не удалось отправить';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!(await is_admin_request())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

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
