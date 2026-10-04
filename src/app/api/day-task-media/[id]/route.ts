import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { media_content_type, read_day_task_media } from '@/lib/day-task-media-server';

type ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: ctx) {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const file = read_day_task_media(id);
  if (!file) return NextResponse.json({ error: 'файл не найден' }, { status: 404 });

  const type = media_content_type(file.ext);
  const total = file.bytes.length;
  const range = request.headers.get('range');
  const match = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : total - 1;
    if (start > end || start >= total) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'content-range': `bytes */${total}` },
      });
    }
    const slice = file.bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: {
        'content-type': type,
        'content-length': String(slice.length),
        'content-range': `bytes ${start}-${end}/${total}`,
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=3600',
      },
    });
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      'content-type': type,
      'content-length': String(total),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
    },
  });
}
