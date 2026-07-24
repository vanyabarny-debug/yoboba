import { NextResponse } from 'next/server';
import {
  create_code_challenge,
  create_code_verifier,
  create_oauth_state,
} from '@/lib/pkce';
import {
  is_vk_auth_configured,
  public_site_origin,
  vk_authorize_origin,
  vk_authorize_url,
  vk_cookies_secure,
  vk_default_scope,
  vk_redirect_uri,
} from '@/lib/vk-auth-config';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = public_site_origin(request);
  const return_to = url.searchParams.get('returnTo') || '/';
  const safe_return = return_to.startsWith('/') ? return_to : '/';

  const cookie_opts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: vk_cookies_secure(),
    maxAge: 600,
    path: '/',
  };

  try {
    if (!is_vk_auth_configured()) {
      return NextResponse.redirect(new URL('/login?error=vk_not_configured', origin));
    }

    const state = create_oauth_state();
    const verifier = create_code_verifier();
    const challenge = await create_code_challenge(verifier);

    const redirect_uri = vk_redirect_uri(origin);
    const auth_url = new URL(vk_authorize_url);
    auth_url.searchParams.set('client_id', process.env.NEXT_PUBLIC_VK_CLIENT_ID!);
    auth_url.searchParams.set('redirect_uri', redirect_uri);
    auth_url.searchParams.set('response_type', 'code');
    auth_url.searchParams.set('scope', vk_default_scope);
    auth_url.searchParams.set('state', state);
    auth_url.searchParams.set('code_challenge', challenge);
    auth_url.searchParams.set('code_challenge_method', 'S256');
    // PWA без Referer — явный origin из SITE_URL (как в кабинете VK)
    auth_url.searchParams.set('origin', vk_authorize_origin(origin));

    const res = NextResponse.redirect(auth_url.toString());
    res.cookies.set('vk_oauth_state', state, cookie_opts);
    res.cookies.set('vk_code_verifier', verifier, cookie_opts);
    res.cookies.set('vk_return_to', safe_return, cookie_opts);
    res.cookies.set('vk_redirect_uri', redirect_uri, cookie_opts);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'vk_init_failed';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, origin)
    );
  }
}
