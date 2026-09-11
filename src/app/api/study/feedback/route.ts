import { NextResponse } from 'next/server';
import { save_intern_feedback } from '@/lib/study/interns-server';
import type { intern_quiz_block } from '@/lib/study/interns';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    mood?: number;
    liked?: string;
    disliked?: string;
    name?: string;
    phone?: string;
    quizzes?: intern_quiz_block[];
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'пустой отзыв' }, { status: 400 });
  }
  const mood = Math.round(Number(body.mood));
  const has_mood = Number.isFinite(mood) && mood >= 1 && mood <= 5;
  const has_text = Boolean(String(body.liked || '').trim() || String(body.disliked || '').trim());
  const has_quiz = Array.isArray(body.quizzes) && body.quizzes.length > 0;
  if (!has_mood && !has_text && !has_quiz) {
    return NextResponse.json({ error: 'пустой отзыв' }, { status: 400 });
  }
  try {
    const intern = await save_intern_feedback({
      mood: has_mood ? mood : undefined,
      liked: body.liked,
      disliked: body.disliked,
      name: body.name,
      phone: body.phone,
      quizzes: body.quizzes,
    });
    return NextResponse.json({ ok: true, id: intern?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
