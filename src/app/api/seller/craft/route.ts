import { NextResponse } from 'next/server';
import { add_craft_material, craft_catalog, create_crafted_drink } from '@/lib/craft-drink-server';
import { current_seller_access } from '@/lib/seller-access-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await current_seller_access();
  if (!access?.craft) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const catalog = await craft_catalog();
  return NextResponse.json(catalog, {
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });
}

export async function POST(request: Request) {
  const access = await current_seller_access();
  if (!access?.craft) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }
  const row = body as {
    kind?: unknown;
    name?: unknown;
    category?: unknown;
    measure?: unknown;
    cost?: unknown;
    cold?: unknown;
    hot?: unknown;
    boards?: { caption?: string; drops?: { material_id?: string; qty?: number; action?: string }[] }[];
  };

  try {
    if (row.kind === 'material') {
      const added = await add_craft_material({
        name: String(row.name || ''),
        measure: String(row.measure || 'g'),
        cost: Number(row.cost),
      });
      return NextResponse.json(added);
    }
    const saved = await create_crafted_drink({
      name: String(row.name || ''),
      category: String(row.category || ''),
      cold: row.cold !== false,
      hot: row.hot !== false,
      boards: Array.isArray(row.boards) ? row.boards : [],
    });
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'не удалось сохранить';
    const status = /уже в меню|название|цену|закупки|ингредиент|раздела/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
