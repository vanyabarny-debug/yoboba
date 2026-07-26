import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Ставит supabase-сессию в httpOnly cookies через same-origin fetch.
 * Нужен для VK: токены в query string ломаются/режутся за nginx,
 * а Set-Cookie на 302 с /auth/vk/callback часто не доходит.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  const access_token = body.access_token?.trim();
  const refresh_token = body.refresh_token?.trim();

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'missing tokens' }, { status: 400 });
  }

  const cookie_bag: {
    name: string;
    value: string;
    options?: Parameters<NextResponse['cookies']['set']>[2];
  }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies_to_set) {
          cookie_bag.length = 0;
          cookies_to_set.forEach(({ name, value, options }) => {
            cookie_bag.push({ name, value, options });
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error || !data.session?.user) {
    return NextResponse.json(
      { error: error?.message || 'не удалось сохранить сессию' },
      { status: 401 }
    );
  }

  const res = NextResponse.json({
    ok: true,
    user_id: data.session.user.id,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });

  cookie_bag.forEach(({ name, value, options }) => {
    res.cookies.set(name, value, options);
  });

  return res;
}
