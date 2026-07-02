import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') || url.searchParams.get('returnTo') || '/';

  const destination = next.startsWith('/') ? next : '/';

  if (code) {
    const supabase = await create_server_client();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
      );
    }
    return NextResponse.redirect(new URL(destination, url.origin));
  }

  if (token_hash && type) {
    const supabase = await create_server_client();
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change',
    });
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
      );
    }
    return NextResponse.redirect(new URL(destination, url.origin));
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', url.origin));
}
