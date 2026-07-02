import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  create_code_challenge,
  create_code_verifier,
  create_oauth_state,
} from '@/lib/pkce';
import {
  is_vk_auth_configured,
  vk_authorize_url,
  vk_default_scope,
  vk_redirect_uri,
} from '@/lib/vk-auth-config';

const cookie_opts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 600,
  path: '/',
};

export async function GET(request: Request) {
  if (!is_vk_auth_configured()) {
    return NextResponse.json({ error: 'vk auth not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const return_to = url.searchParams.get('returnTo') || '/';
  const safe_return = return_to.startsWith('/') ? return_to : '/';

  const state = create_oauth_state();
  const verifier = create_code_verifier();
  const challenge = await create_code_challenge(verifier);

  const store = await cookies();
  store.set('vk_oauth_state', state, cookie_opts);
  store.set('vk_code_verifier', verifier, cookie_opts);
  store.set('vk_return_to', safe_return, cookie_opts);

  const redirect_uri = vk_redirect_uri(url.origin);
  const auth_url = new URL(vk_authorize_url);
  auth_url.searchParams.set('client_id', process.env.NEXT_PUBLIC_VK_CLIENT_ID!);
  auth_url.searchParams.set('redirect_uri', redirect_uri);
  auth_url.searchParams.set('response_type', 'code');
  auth_url.searchParams.set('scope', vk_default_scope);
  auth_url.searchParams.set('state', state);
  auth_url.searchParams.set('code_challenge', challenge);
  auth_url.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(auth_url.toString());
}
