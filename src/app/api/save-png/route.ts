import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { designer_is_admin } from '@/lib/designer/require-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safe_png_name(filename: string) {
  const base = filename.split(/[/\\]/).pop()?.trim() || '';
  if (!base || base === '.' || base === '..' || base.includes('..')) return null;
  return base.toLowerCase().endsWith('.png') ? base : `${base}.png`;
}

export async function POST(request: Request) {
  if (!(await designer_is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { base64?: unknown; filename?: unknown } | null;
  if (!body || typeof body.base64 !== 'string' || typeof body.filename !== 'string') {
    return NextResponse.json({ error: 'missing base64 or filename' }, { status: 400 });
  }
  const filename = safe_png_name(body.filename);
  if (!filename) return NextResponse.json({ error: 'плохое имя файла' }, { status: 400 });

  const buf = Buffer.from(body.base64, 'base64');
  if (!buf.length) return NextResponse.json({ error: 'пустой файл' }, { status: 400 });

  const export_dir = path.join(process.cwd(), 'data', 'designer-exports');
  await mkdir(export_dir, { recursive: true });
  const saved = path.join(export_dir, filename);
  await writeFile(saved, buf);

  try {
    await writeFile(path.join(homedir(), 'Downloads', filename), buf);
  } catch {
    /* в контейнере папки загрузок нет */
  }

  return NextResponse.json({ ok: true, path: saved });
}
