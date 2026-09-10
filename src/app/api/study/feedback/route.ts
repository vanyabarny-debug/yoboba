import { NextResponse } from 'next/server';
import { save_intern_feedback } from '@/lib/study/interns-server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    mood?: number;
    liked?: string;
    disliked?: string;
    name?: string;
    phone?: string;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'пустой отзыв' }, { status: 400 });
  }
  try {
    await save_intern_feedback(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
