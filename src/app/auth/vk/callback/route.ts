import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sanitize_auth_return_path } from '@/lib/auth-return';
import { public_site_origin } from '@/lib/vk-auth-config';
import {
  exchange_vk_code,
  fetch_vk_user,
  mint_vk_supabase_otp,
  upsert_vk_supabase_user,
} from '@/lib/vk-auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function clear_vk_cookies(response: NextResponse) {
  response.cookies.set('vk_oauth_state', '', { maxAge: 0, path: '/' });
  response.cookies.set('vk_code_verifier', '', { maxAge: 0, path: '/' });
  response.cookies.set('vk_return_to', '', { maxAge: 0, path: '/' });
  response.cookies.set('vk_redirect_uri', '', { maxAge: 0, path: '/' });
  return response;
}

function fail(origin: string, message: string) {
  const res = NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(message)}`, origin)
  );
  res.headers.set('cache-control', 'no-store');
  return clear_vk_cookies(res);
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

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = public_site_origin(request);

  console.log('[vk/callback] start', {
    has_code: Boolean(url.searchParams.get('code') || url.searchParams.get('payload')),
    origin,
    vk_client_id: process.env.NEXT_PUBLIC_VK_CLIENT_ID || null,
  });

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('supabase public keys missing');
    }
    if (!process.env.NEXT_PUBLIC_VK_CLIENT_ID) {
      throw new Error('NEXT_PUBLIC_VK_CLIENT_ID missing');
    }

    const { code, device_id, state } = read_vk_callback_params(url);
    const vk_error = url.searchParams.get('error');
    const expected_state = request.cookies.get('vk_oauth_state')?.value;
    const code_verifier = request.cookies.get('vk_code_verifier')?.value;
    const return_to = sanitize_auth_return_path(
      request.cookies.get('vk_return_to')?.value
    );
    const saved_redirect = request.cookies.get('vk_redirect_uri')?.value;
    const redirect_uri = saved_redirect || `${origin}/auth/vk/callback`;

    if (vk_error) {
      return fail(origin, vk_error);
    }

    if (!code || !device_id || !state || !expected_state || !code_verifier) {
      console.error('[vk/callback] missing params', {
        code: Boolean(code),
        device_id: Boolean(device_id),
        state: Boolean(state),
        expected_state: Boolean(expected_state),
        code_verifier: Boolean(code_verifier),
      });
      return fail(origin, 'vk_missing_params');
    }

    if (state !== expected_state) {
      return fail(origin, 'vk_state_mismatch');
    }

    console.log('[vk/callback] exchange code', { redirect_uri });
    const tokens = await exchange_vk_code({
      code,
      device_id,
      code_verifier,
      state,
      redirect_uri,
    });

    console.log('[vk/callback] fetch user');
    const vk_user = await fetch_vk_user(tokens.access_token, tokens.id_token);

    console.log('[vk/callback] upsert supabase user', { vk_id: vk_user.user_id });
    const account = await upsert_vk_supabase_user({
      vk_user,
      anonymous_user_id: null,
    });

    const cookie_bag: {
      name: string;
      value: string;
      options?: Parameters<NextResponse['cookies']['set']>[2];
    }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

    console.log('[vk/callback] mint session');
    const otp = await mint_vk_supabase_otp(account.email);
    const verified = otp.hashed_token
      ? await supabase.auth.verifyOtp({
          token_hash: otp.hashed_token,
          type: 'email',
        })
      : await supabase.auth.verifyOtp({
          email: otp.email,
          token: otp.email_otp,
          type: 'email',
        });

    if (verified.error || !verified.data.session?.user) {
      throw new Error(`supabase verifyOtp: ${verified.error?.message || 'нет сессии'}`);
    }

    if (!cookie_bag.length) {
      throw new Error('supabase: сессия не записалась в cookies');
    }

    const next = new URL(return_to, origin);
    const res = NextResponse.redirect(next);
    res.headers.set('cache-control', 'no-store');
    clear_vk_cookies(res);
    cookie_bag.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options);
    });

    console.log('[vk/callback] session ok', {
      user_id: verified.data.session.user.id,
      email: account.email,
      next: return_to,
      cookies: cookie_bag.length,
    });

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vk_auth_failed';
    console.error('[vk/callback] error', message, err);
    return fail(origin, message);
  }
}
