import { NextResponse } from 'next/server';
import { designer_is_admin } from '@/lib/designer/require-admin';
import { setGeminiApiKey } from '@/lib/designer/posterGenerate.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!(await designer_is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { apiKey?: unknown } | null;
  try {
    const status = setGeminiApiKey(typeof body?.apiKey === 'string' ? body.apiKey : '');
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить ключ';
    const status = typeof err === 'object' && err && 'status' in err ? Number(err.status) || 500 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
