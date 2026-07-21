import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { public_site_origin } from '@/lib/vk-auth-config';
import {
  exchange_vk_code,
  fetch_vk_user,
  upsert_vk_supabase_user,
} from '@/lib/vk-auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** callback ходит в VK + Supabase — даём запас по времени */
export const maxDuration = 60;

function clear_vk_cookies(response: NextResponse) {
  response.cookies.set('vk_oauth_state', '', { maxAge: 0, path: '/' });
  response.cookies.set('vk_code_verifier', '', { maxAge: 0, path: '/' });
  response.cookies.set('vk_return_to', '', { maxAge: 0, path: '/' });
  return response;
}

function read_vk_callback_params(url: URL) {
  const payload_raw = url.searchParams.get('payload');
  if (payload_raw) {
    try {
      const payload = JSON.parse(payload_raw) as {
        code?: string;
        state?: string;
        device_id?: string;
      };
      return {
        code: payload.code ?? null,
        device_id: payload.device_id ?? null,
        state: payload.state ?? null,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    code: url.searchParams.get('code'),
    device_id: url.searchParams.get('device_id'),
    state: url.searchParams.get('state'),
  };
}

function redirect_login(origin: string, error: string, request_cookies: { name: string; value: string }[]) {
  const res = NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(error)}`, origin)
  );
  // сохраняем входящие cookies кроме vk_* — сессию не трогаем
  request_cookies.forEach(({ name, value }) => {
    if (!name.startsWith('vk_')) res.cookies.set(name, value);
  });
  return clear_vk_cookies(res);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = public_site_origin(request);
  const incoming = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i), value: c.slice(i + 1) };
    }) ?? [];

  const get_cookie = (name: string) =>
    incoming.find((c) => c.name === name)?.value;

  console.log('[vk/callback] start', {
    has_code: Boolean(url.searchParams.get('code') || url.searchParams.get('payload')),
    origin,
  });

  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('supabase public env missing');
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
    }

    const { code, device_id, state } = read_vk_callback_params(url);
    const vk_error = url.searchParams.get('error');
    const expected_state = get_cookie('vk_oauth_state');
    const code_verifier = get_cookie('vk_code_verifier');
    const return_to = get_cookie('vk_return_to') || '/';

    if (vk_error) {
      return redirect_login(origin, vk_error, incoming);
    }

    if (!code || !device_id || !state || !expected_state || !code_verifier) {
      console.error('[vk/callback] missing params', {
        code: Boolean(code),
        device_id: Boolean(device_id),
        state: Boolean(state),
        expected_state: Boolean(expected_state),
        code_verifier: Boolean(code_verifier),
      });
      return redirect_login(origin, 'vk_missing_params', incoming);
    }

    if (state !== expected_state) {
      return redirect_login(origin, 'vk_state_mismatch', incoming);
    }

    console.log('[vk/callback] exchange code');
    const access_token = await exchange_vk_code({
      code,
      device_id,
      code_verifier,
      origin,
    });

    console.log('[vk/callback] fetch user');
    const vk_user = await fetch_vk_user(access_token);

    console.log('[vk/callback] upsert supabase user', { vk_id: vk_user.user_id });
    const session = await upsert_vk_supabase_user({
      vk_user,
      anonymous_user_id: null,
    });

    const destination = return_to.startsWith('/') ? return_to : '/';
    const res = NextResponse.redirect(new URL(destination, origin));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return incoming;
          },
          setAll(cookies_to_set) {
            cookies_to_set.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    console.log('[vk/callback] verify otp');
    const { error: verify_error } = await supabase.auth.verifyOtp({
      token_hash: session.token_hash,
      type: 'email',
    });

    if (verify_error) {
      throw verify_error;
    }

    console.log('[vk/callback] ok ->', destination);
    return clear_vk_cookies(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vk_auth_failed';
    console.error('[vk/callback] error', message, err);
    return redirect_login(origin, message, incoming);
  }
}
