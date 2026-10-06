import { NextResponse } from 'next/server';
import { designer_is_admin } from '@/lib/designer/require-admin';
import { getPosterStatus } from '@/lib/designer/posterGenerate.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!(await designer_is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  return NextResponse.json(getPosterStatus());
}
