import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { create_server_client } from '@/lib/supabase/server';
import { public_site_origin } from '@/lib/vk-auth-config';
import {
  exchange_vk_code,
  fetch_vk_user,
  upsert_vk_supabase_user,
} from '@/lib/vk-auth-server';

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
        type?: string;
      };
      return {
        code: payload.code ?? null,
        device_id: payload.device_id ?? null,
        state: payload.state ?? null,
      };
    } catch {
      /* fall through to flat params */
    }
  }

  return {
    code: url.searchParams.get('code'),
    device_id: url.searchParams.get('device_id'),
    state: url.searchParams.get('state'),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = public_site_origin(request);
  const { code, device_id, state } = read_vk_callback_params(url);
  const vk_error = url.searchParams.get('error');

  const store = await cookies();
  const expected_state = store.get('vk_oauth_state')?.value;
  const code_verifier = store.get('vk_code_verifier')?.value;
  const return_to = store.get('vk_return_to')?.value || '/';

  if (vk_error) {
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(vk_error)}`, origin)
    );
    return clear_vk_cookies(res);
  }

  if (!code || !device_id || !state || !expected_state || !code_verifier) {
    const res = NextResponse.redirect(new URL('/login?error=vk_missing_params', origin));
    return clear_vk_cookies(res);
  }

  if (state !== expected_state) {
    const res = NextResponse.redirect(new URL('/login?error=vk_state_mismatch', origin));
    return clear_vk_cookies(res);
  }

  try {
    const access_token = await exchange_vk_code({
      code,
      device_id,
      code_verifier,
      origin,
    });
    const vk_user = await fetch_vk_user(access_token);

    const supabase = await create_server_client();
    const { data: { user: current_user } } = await supabase.auth.getUser();
    const anonymous_user_id =
      current_user?.is_anonymous === true ? current_user.id : null;

    const session = await upsert_vk_supabase_user({
      vk_user,
      anonymous_user_id,
    });

    const { error: verify_error } = await supabase.auth.verifyOtp({
      token_hash: session.token_hash,
      type: 'email',
    });

    if (verify_error) {
      throw verify_error;
    }

    const destination = return_to.startsWith('/') ? return_to : '/';
    const res = NextResponse.redirect(new URL(destination, origin));
    return clear_vk_cookies(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vk_auth_failed';
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, origin)
    );
    return clear_vk_cookies(res);
  }
}
