import { NextResponse } from 'next/server';
import { caller_push_categories, push_category_counts, push_keys_for_categories } from '@/lib/push-server';
import { parse_push_categories } from '@/lib/push-categories';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const allowed = await caller_push_categories();
  if (!allowed) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const pick = parse_push_categories(new URL(request.url).searchParams.get('pick')?.split(',') || []).filter(
    (id) => allowed.includes(id)
  );

  try {
    const categories = await push_category_counts(allowed);
    const union = pick.length ? await push_keys_for_categories(pick) : { people: 0, devices: 0, keys: [] };
    return NextResponse.json(
      { categories, people: union.people, devices: union.devices },
      { headers: { 'cache-control': 'private, no-store, max-age=0' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось посчитать категории';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
