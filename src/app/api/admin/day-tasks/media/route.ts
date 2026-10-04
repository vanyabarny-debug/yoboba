import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { ext_for_mime, save_day_task_media } from '@/lib/day-task-media-server';
import { day_task_media_url, type day_task_media } from '@/lib/day-task-templates';

const image_max = 6 * 1024 * 1024;
const video_max = 16 * 1024 * 1024;

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'файл не пришёл' }, { status: 400 });
  }
  const kind: day_task_media['kind'] | null = file.type.startsWith('video/')
    ? 'video'
    : file.type.startsWith('image/')
      ? 'image'
      : null;
  if (!kind) {
    return NextResponse.json({ error: 'нужно фото или видео' }, { status: 400 });
  }
  const limit = kind === 'video' ? video_max : image_max;
  if (file.size > limit) {
    return NextResponse.json(
      { error: kind === 'video' ? 'видео больше 16 мб' : 'фото больше 6 мб' },
      { status: 400 }
    );
  }
  const ext = ext_for_mime(file.type, file.name);
  if (!ext) return NextResponse.json({ error: 'такой формат не открывается' }, { status: 400 });
  const id = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  save_day_task_media(id, ext, bytes);
  const media: day_task_media = { id, kind };
  return NextResponse.json({ media, url: day_task_media_url(id) });
}
