import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function merge_cookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

export async function GET(request: NextRequest) {
  let cookie_response = NextResponse.next();

  const supabase = createServerClient(
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

  const res = NextResponse.json({
    user: {
      id: user.id,
      is_anonymous: user.is_anonymous === true,
    },
    profile: profile || null,
  });
  merge_cookies(cookie_response, res);
  return res;
}
