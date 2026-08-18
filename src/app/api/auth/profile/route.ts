import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { normalize_phone } from '@/lib/phone';
import { read_profile, update_profile_row } from '@/lib/profile-row';

function merge_cookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

function make_supabase(request: NextRequest, cookie_response: NextResponse, write_cookies: boolean) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies_to_set) {
          if (!write_cookies) return;
          cookies_to_set.forEach(({ name, value, options }) => {
            cookie_response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  let cookie_response = NextResponse.next();
  // не пишем JWT обратно в Set-Cookie — nginx режет слишком большой заголовок
  const supabase = make_supabase(request, cookie_response, false);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const res = NextResponse.json({ user: null, profile: null });
    merge_cookies(cookie_response, res);
    return res;
  }

  const { data: profile } = await read_profile(supabase, user.id);

  const meta_phone = normalize_phone(
    (user.user_metadata as { phone?: string } | undefined)?.phone
  );
  let resolved_profile = profile;

  if (profile && !profile.phone && meta_phone) {
    resolved_profile = { ...profile, phone: meta_phone };
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await admin
        .from('profiles')
        .update({ phone: meta_phone, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  }

  // если эмоджи ещё нет — выдать рандомный один раз
  if (
    resolved_profile &&
    !resolved_profile.avatar_emoji &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    const { random_avatar_emoji } = await import('@/lib/avatar-emoji');
    const emoji = random_avatar_emoji();
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await admin
      .from('profiles')
      .update({ avatar_emoji: emoji, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .is('avatar_emoji', null);
    resolved_profile = { ...resolved_profile, avatar_emoji: emoji };
  }

  const meta = user.user_metadata as
    | {
        is_guest?: boolean;
        full_name?: string;
        first_name?: string;
        last_name?: string;
        avatar_url?: string | null;
      }
    | undefined;
  const meta_name =
    (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
    [meta?.first_name, meta?.last_name]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join(' ')
      .trim() ||
    null;

  if (resolved_profile && !resolved_profile.name && meta_name) {
    resolved_profile = { ...resolved_profile, name: meta_name };
  }
  const meta_avatar =
    typeof meta?.avatar_url === 'string' && meta.avatar_url.trim()
      ? meta.avatar_url.trim()
      : '';
  if (resolved_profile && meta_avatar) {
    resolved_profile = { ...resolved_profile, avatar_url: meta_avatar };
  }

  const res = NextResponse.json({
    user: {
      id: user.id,
      is_anonymous: user.is_anonymous === true,
      is_guest:
        user.is_anonymous === true ||
        meta?.is_guest === true ||
        (user.email || '').toLowerCase().endsWith('@guest.yoboba.auth'),
    },
    profile: resolved_profile || null,
  });
  merge_cookies(cookie_response, res);
  return res;
}

export async function PATCH(request: NextRequest) {
  let cookie_response = NextResponse.next();
  const supabase = make_supabase(request, cookie_response, true);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    const res = NextResponse.json({ error: 'не авторизован' }, { status: 401 });
    merge_cookies(cookie_response, res);
    return res;
  }

  const body = (await request.json()) as { name?: string; phone?: string };
  const updates: { name?: string; phone?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (name.length < 2) {
      const res = NextResponse.json({ error: 'укажите имя' }, { status: 400 });
      merge_cookies(cookie_response, res);
      return res;
    }
    updates.name = name;
  }

  if (typeof body.phone === 'string') {
    const phone = normalize_phone(body.phone);
    if (!phone) {
      const res = NextResponse.json({ error: 'укажите корректный номер' }, { status: 400 });
      merge_cookies(cookie_response, res);
      return res;
    }
    updates.phone = phone;
  }

  if (!updates.name && !updates.phone) {
    const res = NextResponse.json({ error: 'нечего обновлять' }, { status: 400 });
    merge_cookies(cookie_response, res);
    return res;
  }

  const { data: profile, error } = await update_profile_row(
    supabase,
    user.id,
    updates
  );

  if (error || !profile) {
    const duplicate =
      error?.code === '23505' ||
      error?.message?.includes('unique') ||
      error?.message?.includes('duplicate');
    const res = NextResponse.json(
      {
        error: duplicate
          ? 'этот номер уже привязан к другому аккаунту'
          : 'не удалось обновить профиль',
      },
      { status: duplicate ? 409 : 500 }
    );
    merge_cookies(cookie_response, res);
    return res;
  }

  if (updates.phone && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata as Record<string, unknown>),
        phone: updates.phone,
      },
      phone: updates.phone,
      phone_confirm: true,
    });
  }

  const res = NextResponse.json({ profile });
  merge_cookies(cookie_response, res);
  return res;
}

export async function DELETE(request: NextRequest) {
  let cookie_response = NextResponse.next();
  const supabase = make_supabase(request, cookie_response, true);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    const res = NextResponse.json({ error: 'не авторизован' }, { status: 401 });
    merge_cookies(cookie_response, res);
    return res;
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await admin
      .from('profiles')
      .update({
        name: null,
        phone: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }

  await supabase.auth.signOut();
  const res = NextResponse.json({ ok: true });
  merge_cookies(cookie_response, res);
  return res;
}
