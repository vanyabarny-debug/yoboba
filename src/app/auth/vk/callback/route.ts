import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { create_server_client } from '@/lib/supabase/server';
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const device_id = url.searchParams.get('device_id');
  const state = url.searchParams.get('state');
  const vk_error = url.searchParams.get('error');

  const store = await cookies();
  const expected_state = store.get('vk_oauth_state')?.value;
  const code_verifier = store.get('vk_code_verifier')?.value;
  const return_to = store.get('vk_return_to')?.value || '/';

  if (vk_error) {
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(vk_error)}`, url.origin)
    );
    return clear_vk_cookies(res);
  }

  if (!code || !device_id || !state || !expected_state || !code_verifier) {
    const res = NextResponse.redirect(new URL('/login?error=vk_missing_params', url.origin));
    return clear_vk_cookies(res);
  }

  if (state !== expected_state) {
    const res = NextResponse.redirect(new URL('/login?error=vk_state_mismatch', url.origin));
    return clear_vk_cookies(res);
  }

  try {
    const access_token = await exchange_vk_code({
      code,
      device_id,
      code_verifier,
      origin: url.origin,
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
    const res = NextResponse.redirect(new URL(destination, url.origin));
    return clear_vk_cookies(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vk_auth_failed';
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, url.origin)
    );
    return clear_vk_cookies(res);
  }
}
