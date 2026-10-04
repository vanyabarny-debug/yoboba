import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie, seller_id_cookie } from '@/lib/session';
import { moscow_today_iso } from '@/lib/order-number';
import { ext_for_mime, save_day_task_media } from '@/lib/day-task-media-server';
import { type day_task_media } from '@/lib/day-task-templates';
import { add_day_task_proof, get_day_task_templates } from '@/lib/day-task-templates-server';

const image_max = 6 * 1024 * 1024;
const video_max = 16 * 1024 * 1024;

export async function POST(request: Request) {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const template_id = typeof form?.get('template_id') === 'string' ? String(form.get('template_id')) : '';
  const spot_id = typeof form?.get('spot_id') === 'string' ? String(form.get('spot_id')).slice(0, 80) : '';
  if (!(file instanceof File) || !template_id || !spot_id) {
    return NextResponse.json({ error: 'не хватает файла или задачи' }, { status: 400 });
  }

  const tasks = await get_day_task_templates();
  const task = tasks.find((row) => row.id === template_id);
  if (!task || task.proof === 'none') {
    return NextResponse.json({ error: 'к этой задаче файл не нужен' }, { status: 400 });
  }

  const kind: day_task_media['kind'] | null = file.type.startsWith('video/')
    ? 'video'
    : file.type.startsWith('image/')
      ? 'image'
      : null;
  if (!kind) return NextResponse.json({ error: 'нужно фото или видео' }, { status: 400 });
  if (task.proof === 'photo' && kind !== 'image') {
    return NextResponse.json({ error: 'сюда нужно фото' }, { status: 400 });
  }
  if (task.proof === 'video' && kind !== 'video') {
    return NextResponse.json({ error: 'сюда нужно видео' }, { status: 400 });
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
  save_day_task_media(id, ext, Buffer.from(await file.arrayBuffer()));
  const media: day_task_media = { id, kind };
  await add_day_task_proof({
    id,
    template_id,
    spot_id,
    day: moscow_today_iso(),
    seller_id: store.get(seller_id_cookie)?.value || '',
    media,
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, media });
}
