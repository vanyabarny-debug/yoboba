import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import {
  AVATAR_EMOJI_CHANGE_COST,
  is_avatar_emoji,
  random_avatar_emoji,
} from '@/lib/avatar-emoji';
import { is_supabase_configured } from '@/lib/supabase/config';

function merge_cookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

function make_supabase(request: NextRequest, cookie_response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies_to_set) {
          cookies_to_set.forEach(({ name, value, options }) => {
            cookie_response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

/** смена аватарки за тапикоины (клиент демо — только валидация; баланс крутится на клиенте) */
export async function POST(request: NextRequest) {
  let cookie_response = NextResponse.next();
  const body = (await request.json().catch(() => ({}))) as { emoji?: string; demo?: boolean };
  const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';

  if (!is_avatar_emoji(emoji)) {
    const res = NextResponse.json({ error: 'такой эмоджи нельзя' }, { status: 400 });
    merge_cookies(cookie_response, res);
    return res;
  }

  if (!is_supabase_configured() || body.demo) {
    const res = NextResponse.json({
      ok: true,
      demo: true,
      avatar_emoji: emoji,
      cost: AVATAR_EMOJI_CHANGE_COST,
    });
    merge_cookies(cookie_response, res);
    return res;
  }

  const supabase = make_supabase(request, cookie_response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    const res = NextResponse.json({ error: 'не авторизован' }, { status: 401 });
    merge_cookies(cookie_response, res);
    return res;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const res = NextResponse.json({ error: 'сервис недоступен' }, { status: 500 });
    merge_cookies(cookie_response, res);
    return res;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: profile, error: read_err } = await admin
    .from('profiles')
    .select('id, phone, name, bonus_balance, avatar_emoji, role')
    .eq('id', user.id)
    .maybeSingle();

  if (read_err || !profile) {
    const res = NextResponse.json(
      { error: read_err?.message || 'профиль не найден' },
      { status: 404 }
    );
    merge_cookies(cookie_response, res);
    return res;
  }

  if (profile.avatar_emoji === emoji) {
    const res = NextResponse.json({
      profile,
      cost: 0,
      avatar_emoji: emoji,
    });
    merge_cookies(cookie_response, res);
    return res;
  }

  const current = Number(profile.bonus_balance) || 0;
  if (current < AVATAR_EMOJI_CHANGE_COST) {
    const res = NextResponse.json(
      {
        error: `нужно ${AVATAR_EMOJI_CHANGE_COST} тапикоинов, у вас ${current}`,
        bonus_balance: current,
      },
      { status: 400 }
    );
    merge_cookies(cookie_response, res);
    return res;
  }

  const next_balance = current - AVATAR_EMOJI_CHANGE_COST;
  const { data: updated, error: upd_err } = await admin
    .from('profiles')
    .update({
      avatar_emoji: emoji,
      bonus_balance: next_balance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id, phone, name, bonus_balance, avatar_emoji, role')
    .single();

  if (upd_err || !updated) {
    const res = NextResponse.json(
      { error: upd_err?.message || 'не удалось сменить аватар' },
      { status: 500 }
    );
    merge_cookies(cookie_response, res);
    return res;
  }

  const res = NextResponse.json({
    profile: updated,
    cost: AVATAR_EMOJI_CHANGE_COST,
    avatar_emoji: emoji,
    bonus_balance: next_balance,
  });
  merge_cookies(cookie_response, res);
  return res;
}

export async function GET() {
  return NextResponse.json({
    cost: AVATAR_EMOJI_CHANGE_COST,
    default: random_avatar_emoji(),
  });
}
