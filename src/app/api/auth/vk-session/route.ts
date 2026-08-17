import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fallback для VK-входа (основной путь — verify сразу в /auth/vk/callback).
 * generateLink hashed_token → verifyOtp + cookies + токены клиенту.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token_hash?: string;
  };

  const token_hash = body.token_hash?.trim();
  if (!token_hash) {
    return NextResponse.json({ error: 'missing token_hash' }, { status: 400 });
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

  let verified = await supabase.auth.verifyOtp({
    token_hash,
    type: 'email',
  });

  if (verified.error || !verified.data.session?.user) {
    verified = await supabase.auth.verifyOtp({
      token_hash,
      type: 'magiclink',
    });
  }

  if (verified.error || !verified.data.session?.user) {
    return NextResponse.json(
      { error: verified.error?.message || 'verify failed' },
      { status: 401 }
    );
  }

  const session = verified.data.session;
  const res = NextResponse.json({
    ok: true,
    user_id: session.user.id,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
  });

  cookie_bag.forEach(({ name, value, options }) => {
    res.cookies.set(name, value, options);
  });

  return res;
}
