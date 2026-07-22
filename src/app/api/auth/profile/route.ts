import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

function merge_cookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

function normalize_profile_phone(raw?: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('*')) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return raw.trim().startsWith('+') ? raw.trim() : `+${digits}`;
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

export async function GET(request: NextRequest) {
  let cookie_response = NextResponse.next();
  const supabase = make_supabase(request, cookie_response);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const res = NextResponse.json({ user: null, profile: null });
    merge_cookies(cookie_response, res);
    return res;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, phone, name, bonus_balance, role')
    .eq('id', user.id)
    .maybeSingle();

  const meta_phone = normalize_profile_phone(
    (user.user_metadata as { phone?: string } | undefined)?.phone
  );
  let resolved_profile = profile;

  // телефон мог сохраниться в user_metadata при VK-входе, но не попасть в profiles
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

  const res = NextResponse.json({
    user: {
      id: user.id,
      is_anonymous: user.is_anonymous === true,
    },
    profile: resolved_profile || null,
  });
  merge_cookies(cookie_response, res);
  return res;
}

export async function PATCH(request: NextRequest) {
  let cookie_response = NextResponse.next();
  const supabase = make_supabase(request, cookie_response);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    const res = NextResponse.json({ error: 'не авторизован' }, { status: 401 });
    merge_cookies(cookie_response, res);
    return res;
  }

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name || name.length < 2) {
    const res = NextResponse.json({ error: 'укажите имя' }, { status: 400 });
    merge_cookies(cookie_response, res);
    return res;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id, phone, name, bonus_balance, role')
    .single();

  if (error || !profile) {
    const res = NextResponse.json(
      { error: error?.message || 'не удалось обновить профиль' },
      { status: 500 }
    );
    merge_cookies(cookie_response, res);
    return res;
  }

  const res = NextResponse.json({ profile });
  merge_cookies(cookie_response, res);
  return res;
}
