import { NextResponse } from 'next/server';
import { is_admin_request } from '@/lib/push-server';
import { record_inbox, safe_inbox_href } from '@/lib/inbox-server';

export async function POST(request: Request) {
  if (!(await is_admin_request())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    emoji?: unknown;
    image?: unknown;
    href?: unknown;
    user_ids?: unknown;
  } | null;

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!title || !text) {
    return NextResponse.json({ error: 'нужны заголовок и текст' }, { status: 400 });
  }

  const user_ids = Array.isArray(body?.user_ids)
    ? body.user_ids.filter((id): id is string => typeof id === 'string').slice(0, 2000)
    : [];
  if (!user_ids.length) {
    return NextResponse.json({ error: 'выберите гостей с аккаунтом' }, { status: 400 });
  }

  const image = typeof body?.image === 'string' ? body.image : null;
  if (image && image.length > 180_000) {
    return NextResponse.json({ error: 'картинка слишком большая' }, { status: 400 });
  }

  const saved = await record_inbox({
    title,
    body: text,
    emoji: typeof body?.emoji === 'string' ? body.emoji : null,
    image,
    href: safe_inbox_href(typeof body?.href === 'string' ? body.href : null),
    source: 'inbox',
    user_ids,
  });
  if (!saved) {
    return NextResponse.json({ error: 'некого уведомить — нужен аккаунт в приложении' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, recipients: saved.recipients });
}
