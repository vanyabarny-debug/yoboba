import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie, seller_id_cookie } from '@/lib/session';
import { moscow_today_iso } from '@/lib/order-number';
import { ext_for_mime, save_day_task_media } from '@/lib/day-task-media-server';
import { type day_task_media } from '@/lib/day-task-templates';
import { add_checklist_proof } from '@/lib/checklist-proofs-server';
import { template_proof_for_item } from '@/lib/checklist-task-enrich';
import type { checklist_kind } from '@/lib/shift-checklist-templates';

const image_max = 6 * 1024 * 1024;
const video_max = 16 * 1024 * 1024;

function parse_kind(raw: string): checklist_kind | null {
  if (raw === 'opening' || raw === 'day' || raw === 'closing') return raw;
  return null;
}

export async function POST(request: Request) {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const kind = parse_kind(String(form?.get('kind') || ''));
  const task_id = String(form?.get('task_id') || '');
  const item_id = String(form?.get('item_id') || '');
  const spot_id = String(form?.get('spot_id') || '').slice(0, 80);
  const item_order = Number(form?.get('item_order') || 0);
  const shift_date =
    typeof form?.get('shift_date') === 'string' ? String(form.get('shift_date')).slice(0, 10) : moscow_today_iso();

  if (!(file instanceof File) || !kind || !task_id || !item_id || !spot_id || !item_order) {
    return NextResponse.json({ error: 'не хватает данных' }, { status: 400 });
  }

  const proof = await template_proof_for_item(kind, item_order);
  if (proof === 'none') {
    return NextResponse.json({ error: 'к этому пункту файл не нужен' }, { status: 400 });
  }

  const media_kind: day_task_media['kind'] | null = file.type.startsWith('video/')
    ? 'video'
    : file.type.startsWith('image/')
      ? 'image'
      : null;
  if (!media_kind) return NextResponse.json({ error: 'нужно фото или видео' }, { status: 400 });
  if (proof === 'photo' && media_kind !== 'image') {
    return NextResponse.json({ error: 'сюда нужно фото' }, { status: 400 });
  }
  if (proof === 'video' && media_kind !== 'video') {
    return NextResponse.json({ error: 'сюда нужно видео' }, { status: 400 });
  }
  const limit = media_kind === 'video' ? video_max : image_max;
  if (file.size > limit) {
    return NextResponse.json(
      { error: media_kind === 'video' ? 'видео больше 16 мб' : 'фото больше 6 мб' },
      { status: 400 }
    );
  }
  const ext = ext_for_mime(file.type, file.name);
  if (!ext) return NextResponse.json({ error: 'такой формат не открывается' }, { status: 400 });

  const id = randomUUID();
  save_day_task_media(id, ext, Buffer.from(await file.arrayBuffer()));
  const media: day_task_media = { id, kind: media_kind };

  await add_checklist_proof({
    id,
    kind,
    item_id,
    task_id,
    spot_id,
    seller_id: store.get(seller_id_cookie)?.value || '',
    shift_date,
    media,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, media });
}
