import { NextResponse } from 'next/server';
import { sanitize_auth_return_path } from '@/lib/auth-return';
import { public_site_origin } from '@/lib/vk-auth-config';
import {
  exchange_vk_code,
  fetch_vk_user,
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

function get_cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') || '';
  const parts = raw.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    if (trimmed.slice(0, i) === name) {
      return decodeURIComponent(trimmed.slice(i + 1));
    }
  }
  return undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = public_site_origin(request);

  console.log('[vk/callback] start', {
    has_code: Boolean(url.searchParams.get('code') || url.searchParams.get('payload')),
    origin,
  });

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
    }

    const { code, device_id, state } = read_vk_callback_params(url);
    const vk_error = url.searchParams.get('error');
    const expected_state = get_cookie(request, 'vk_oauth_state');
    const code_verifier = get_cookie(request, 'vk_code_verifier');
    const return_to = sanitize_auth_return_path(get_cookie(request, 'vk_return_to'));
    const saved_redirect = get_cookie(request, 'vk_redirect_uri');
    const redirect_uri = saved_redirect || `${origin}/auth/vk/callback`;

    if (vk_error) {
      const res = NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(vk_error)}`, origin)
      );
      return clear_vk_cookies(res);
    }

    if (!code || !device_id || !state || !expected_state || !code_verifier) {
      console.error('[vk/callback] missing params', {
        code: Boolean(code),
        device_id: Boolean(device_id),
        state: Boolean(state),
        expected_state: Boolean(expected_state),
        code_verifier: Boolean(code_verifier),
      });
      const res = NextResponse.redirect(new URL('/login?error=vk_missing_params', origin));
      return clear_vk_cookies(res);
    }

    if (state !== expected_state) {
      const res = NextResponse.redirect(new URL('/login?error=vk_state_mismatch', origin));
      return clear_vk_cookies(res);
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
    const session = await upsert_vk_supabase_user({
      vk_user,
      anonymous_user_id: null,
    });

    const next = return_to;
    // Токены кладём в sessionStorage и сразу на /auth/callback —
    // fetch /api/auth/claim-session за nginx часто падает → session_claim_failed
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>вход…</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f3f3;font-family:system-ui,sans-serif;color:#555">
  <p>входим…</p>
  <script>
  (function () {
    var payload = ${JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      next,
      user_id: session.user_id,
    })};
    try {
      sessionStorage.setItem(
        'yoboba_vk_session',
        JSON.stringify({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
          user_id: payload.user_id,
        })
      );
    } catch (e) {
      location.replace('/login?error=' + encodeURIComponent('не удалось сохранить сессию'));
      return;
    }
    // best-effort: cookies для SSR, не блокируем вход если упадёт
    try {
      fetch('/api/auth/claim-session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
    location.replace('/auth/callback?sync=1&next=' + encodeURIComponent(payload.next || '/'));
  })();
  </script>
</body>
</html>`;

    console.log('[vk/callback] handoff html', { next, user_id: session.user_id });
    const res = new NextResponse(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
    return clear_vk_cookies(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vk_auth_failed';
    console.error('[vk/callback] error', message, err);
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, origin)
    );
    return clear_vk_cookies(res);
  }
}
