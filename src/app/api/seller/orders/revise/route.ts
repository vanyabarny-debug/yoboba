import { NextResponse } from 'next/server';
import { staff_actor } from '@/lib/staff-actor';
import { delete_order, parse_order_items, revise_order } from '@/lib/order-revise-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    id?: string;
    items?: unknown;
  } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';

  if (body?.action === 'delete') {
    const result = await delete_order({ id, actor });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === 'update') {
    const parsed = parse_order_items(body.items);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await revise_order({ id, items: parsed.items, actor });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ order: result.order });
  }

  return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
}
