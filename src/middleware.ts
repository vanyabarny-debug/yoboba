import { NextResponse, type NextRequest } from 'next/server';
import { update_session } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { session_cookie } from '@/lib/session';

function is_supabase_live() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return Boolean(url && key && !url.includes('your-project'));
}

function staff_cookie_allows(path: string, role: string | undefined) {
  if (!role) return false;
  if (path.startsWith('/admin') && path !== '/admin/login') return role === 'admin';
  if (path.startsWith('/seller')) return ['seller', 'admin'].includes(role);
  if (path.startsWith('/barista')) return ['barista', 'admin'].includes(role);
  return false;
}

function copy_cookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const code = request.nextUrl.searchParams.get('code');
  const token_hash = request.nextUrl.searchParams.get('token_hash');

  // email/magiclink → /auth/callback; VK OAuth держит свой PKCE в cookies
  // на /auth/vk/callback — не перехватывать, иначе Supabase ищет чужой verifier
  const is_vk_oauth =
    path.startsWith('/auth/vk/') || path.startsWith('/api/auth/vk');
  if ((code || token_hash) && path !== '/auth/callback' && !is_vk_oauth) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

  // yoSquad PWA: start_url = /?app=squad (корень), иначе iOS показывает адресную строку
  // при переходе с /admin/login → /seller
  if (path === '/' && request.nextUrl.searchParams.get('app') === 'squad') {
    const role = request.cookies.get(session_cookie)?.value;
    const target =
      role === 'seller' || role === 'barista'
        ? '/seller'
        : role === 'admin'
          ? '/admin'
          : '/admin/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  const is_admin_route = path.startsWith('/admin');
  const is_barista_route = path.startsWith('/barista');
  const is_seller_route = path.startsWith('/seller');
  const is_staff_area = is_admin_route || is_barista_route || is_seller_route;
  const is_staff_login = path === '/admin/login';

  const session_response = await update_session(request);

  if (!is_staff_area || is_staff_login) {
    return session_response;
  }

  const cookie_role = request.cookies.get(session_cookie)?.value;

  if (staff_cookie_allows(path, cookie_role)) {
    return session_response;
  }

  if (!is_supabase_live()) {
    const redirect = NextResponse.redirect(new URL('/admin/login', request.url));
    copy_cookies(session_response, redirect);
    return redirect;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const redirect = NextResponse.redirect(new URL('/admin/login', request.url));
    copy_cookies(session_response, redirect);
    return redirect;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (is_admin_route && profile?.role !== 'admin') {
    const redirect = NextResponse.redirect(new URL('/', request.url));
    copy_cookies(session_response, redirect);
    return redirect;
  }

  if (is_barista_route && !['barista', 'admin'].includes(profile?.role || '')) {
    const redirect = NextResponse.redirect(new URL('/', request.url));
    copy_cookies(session_response, redirect);
    return redirect;
  }

  if (is_seller_route && !['seller', 'admin'].includes(profile?.role || '')) {
    const redirect = NextResponse.redirect(new URL('/', request.url));
    copy_cookies(session_response, redirect);
    return redirect;
  }

  return session_response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
