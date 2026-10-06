import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { is_supabase_configured } from '@/lib/supabase/config';
import { ensure_pickup_code, PICKUP_CODE_TTL_MINUTES } from '@/lib/pickup-code-server';
import { read_profile } from '@/lib/profile-row';

function make_supabase(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // не пишем JWT обратно — nginx режет большой Set-Cookie
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  // demo / local без supabase: код по demo_user_id из query
  if (!is_supabase_configured()) {
    const demo_user_id = request.nextUrl.searchParams.get('demo_user_id')?.trim();
    if (!demo_user_id) {
      return NextResponse.json({ error: 'нужна авторизация' }, { status: 401 });
    }
    const name = request.nextUrl.searchParams.get('name');
    const phone = request.nextUrl.searchParams.get('phone');
    const bonus_raw = request.nextUrl.searchParams.get('bonus');
    const bonus_balance = bonus_raw ? Number(bonus_raw) : 0;
    try {
      const result = await ensure_pickup_code({
        user_id: demo_user_id,
        name,
        phone,
        bonus_balance: Number.isFinite(bonus_balance) ? bonus_balance : 0,
      });
      return NextResponse.json({
        code: result.code,
        expires_at: result.expires_at,
        ttl_minutes: PICKUP_CODE_TTL_MINUTES,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'не удалось создать код' },
        { status: 500 }
      );
    }
  }

  const supabase = make_supabase(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'нужна авторизация' }, { status: 401 });
  }

  const { data: profile } = await read_profile(supabase, user.id);

  try {
    const result = await ensure_pickup_code({
      user_id: user.id,
      name: profile?.name ?? null,
      phone: profile?.phone ?? null,
      bonus_balance: profile?.bonus_balance ?? 0,
    });
    return NextResponse.json({
      code: result.code,
      expires_at: result.expires_at,
      ttl_minutes: PICKUP_CODE_TTL_MINUTES,
      bonus_balance: profile?.bonus_balance ?? 0,
      name: profile?.name ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'не удалось создать код' },
      { status: 500 }
    );
  }
}
