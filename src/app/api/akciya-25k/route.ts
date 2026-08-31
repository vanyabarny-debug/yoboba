import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  get_viral_25k_status,
  redeem_viral_25k,
  set_viral_25k_counts,
} from '@/lib/viral-25k-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

/** публичный статус счётчика для страницы акции */
export async function GET() {
  const status = await get_viral_25k_status();
  return NextResponse.json(status);
}

/** касса/админ: выдать один или поправить счётчик */
export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: 'redeem' | 'set';
    redeemed_count?: number;
    limit?: number;
  };

  try {
    if (body.action === 'set') {
      const status = await set_viral_25k_counts({
        redeemed_count: body.redeemed_count,
        limit: body.limit,
      });
      return NextResponse.json(status);
    }
    const status = await redeem_viral_25k();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось обновить счётчик';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
