import { NextResponse } from 'next/server';
import { parse_apply_input, upsert_intern, type intern_apply_input } from '@/lib/study/interns-server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as intern_apply_input | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'пустая заявка' }, { status: 400 });
  }

  const parsed = parse_apply_input(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const intern = await upsert_intern(body);
    return NextResponse.json({ ok: true, id: intern.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
