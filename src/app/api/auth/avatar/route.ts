import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import {
  AVATAR_EMOJI_CHANGE_COST,
  is_avatar_bg,
  is_avatar_emoji,
  normalize_avatar_bg,
  random_avatar_emoji,
} from '@/lib/avatar-emoji';
import { is_supabase_configured } from '@/lib/supabase/config';
import { read_profile, update_profile_row } from '@/lib/profile-row';

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

/** смена эмоджи и/или цвета фона (бесплатно) */
export async function POST(request: NextRequest) {
  let cookie_response = NextResponse.next();
  const body = (await request.json().catch(() => ({}))) as {
    emoji?: string;
    bg?: string | null;
    demo?: boolean;
  };
  const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
  const has_bg = Object.prototype.hasOwnProperty.call(body, 'bg');
  const next_bg = has_bg ? normalize_avatar_bg(body.bg) : undefined;

  if (emoji && !is_avatar_emoji(emoji)) {
    const res = NextResponse.json({ error: 'такой эмоджи нельзя' }, { status: 400 });
    merge_cookies(cookie_response, res);
    return res;
  }
  if (has_bg && !is_avatar_bg(body.bg)) {
    const res = NextResponse.json({ error: 'такой цвет нельзя' }, { status: 400 });
    merge_cookies(cookie_response, res);
    return res;
  }
  if (!emoji && !has_bg) {
    const res = NextResponse.json({ error: 'нечего обновлять' }, { status: 400 });
    merge_cookies(cookie_response, res);
    return res;
  }

  if (!is_supabase_configured() || body.demo) {
    const res = NextResponse.json({
      ok: true,
      demo: true,
      avatar_emoji: emoji || undefined,
      avatar_bg: has_bg ? next_bg : undefined,
      cost: emoji ? AVATAR_EMOJI_CHANGE_COST : 0,
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

  const { data: profile, error: read_err, missing_avatar_bg } = await read_profile(
    admin,
    user.id
  );

  if (read_err || !profile) {
    const res = NextResponse.json(
      { error: read_err?.message || 'профиль не найден' },
      { status: 404 }
    );
    merge_cookies(cookie_response, res);
    return res;
  }

  const emoji_changed = Boolean(emoji) && emoji !== profile.avatar_emoji;
  const bg_changed =
    has_bg && normalize_avatar_bg(profile.avatar_bg) !== next_bg;

  if (!emoji_changed && !bg_changed) {
    const res = NextResponse.json({
      profile,
      cost: 0,
      avatar_emoji: profile.avatar_emoji,
      avatar_bg: profile.avatar_bg ?? null,
    });
    merge_cookies(cookie_response, res);
    return res;
  }

  let next_balance = Number(profile.bonus_balance) || 0;
  let cost = 0;
  if (emoji_changed) {
    if (next_balance < AVATAR_EMOJI_CHANGE_COST) {
      const res = NextResponse.json(
        {
          error: `нужно ${AVATAR_EMOJI_CHANGE_COST} бобаллов, у вас ${next_balance}`,
          bonus_balance: next_balance,
        },
        { status: 400 }
      );
      merge_cookies(cookie_response, res);
      return res;
    }
    next_balance -= AVATAR_EMOJI_CHANGE_COST;
    cost = AVATAR_EMOJI_CHANGE_COST;
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (emoji_changed) {
    updates.avatar_emoji = emoji;
    updates.bonus_balance = next_balance;
  }
  if (bg_changed && !missing_avatar_bg) {
    updates.avatar_bg = next_bg;
  }

  const { data: updated, error: upd_err } = await update_profile_row(
    admin,
    user.id,
    updates
  );

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
    cost,
    avatar_emoji: updated.avatar_emoji,
    avatar_bg: updated.avatar_bg ?? null,
    bonus_balance: updated.bonus_balance,
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
