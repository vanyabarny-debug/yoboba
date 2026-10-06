import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { get_shift_checklist_templates } from '@/lib/shift-checklist-templates-server';

export async function GET() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const bundle = await get_shift_checklist_templates();
  return NextResponse.json({
    opening_at: bundle.opening.appear_at,
    day_at: bundle.day.appear_at,
    closing_at: bundle.closing.appear_at,
  });
}
