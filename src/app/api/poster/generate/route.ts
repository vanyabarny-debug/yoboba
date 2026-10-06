import { NextResponse } from 'next/server';
import { designer_is_admin } from '@/lib/designer/require-admin';
import { generatePoster, getPosterStatus } from '@/lib/designer/posterGenerate.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await designer_is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    prompt?: string;
    referenceImage?: string;
    currentImage?: string;
    brandName?: string;
    primaryColor?: string;
    secondaryColor?: string;
  } | null;
  try {
    const result = await generatePoster(body || {});
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось нарисовать плакат';
    const status = typeof err === 'object' && err && 'status' in err ? Number(err.status) || 500 : 500;
    const code = typeof err === 'object' && err && 'code' in err ? err.code : undefined;
    return NextResponse.json({ error: message, code, status: getPosterStatus() }, { status });
  }
}
