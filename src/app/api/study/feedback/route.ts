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
  const mood = Math.round(Number(body.mood));
  if (!Number.isFinite(mood) || mood < 1 || mood > 5) {
    return NextResponse.json({ error: 'выбери смайлик' }, { status: 400 });
  }
  try {
    await save_intern_feedback({
      mood,
      liked: body.liked,
      disliked: body.disliked,
      name: body.name,
      phone: body.phone,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
