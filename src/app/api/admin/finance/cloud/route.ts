import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { ensure_finance_cloud } from '@/lib/finance/ensure-cloud';

export const dynamic = 'force-dynamic';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const report = await ensure_finance_cloud();
  return NextResponse.json(report, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const report = await ensure_finance_cloud();
  return NextResponse.json(report);
}
