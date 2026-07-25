import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type otp_type =
  | 'email'
  | 'magiclink'
  | 'signup'
  | 'invite'
  | 'recovery'
  | 'email_change';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token_hash?: string;
    type?: string;
  };

  const token_hash = body.token_hash?.trim();
  if (!token_hash) {
    return NextResponse.json({ error: 'missing token_hash' }, { status: 400 });
  }

  const requested = (body.type || 'magiclink') as otp_type;
  // generateLink(magiclink) на разных версиях GoTrue принимает email или magiclink
  const types: otp_type[] =
    requested === 'email' || requested === 'magiclink'
      ? [requested, requested === 'email' ? 'magiclink' : 'email']
      : [requested];

  const cookie_bag: { name: string; value: string; options?: Parameters<
    NextResponse['cookies']['set']
  >[2] }[] = [];

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

  let last_error: string | null = null;

  for (const type of types) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error && data.session && data.user) {
      const res = NextResponse.json({
        ok: true,
        user_id: data.user.id,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
        user: {
          id: data.user.id,
          email: data.user.email,
          is_anonymous: data.user.is_anonymous === true,
          user_metadata: data.user.user_metadata,
        },
      });
      cookie_bag.forEach(({ name, value, options }) => {
        res.cookies.set(name, value, options);
      });
      return res;
    }

    last_error = error?.message || 'verify failed';
  }

  return NextResponse.json({ error: last_error || 'verify failed' }, { status: 401 });
}
