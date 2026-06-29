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

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const is_admin_route = path.startsWith('/admin');
  const is_barista_route = path.startsWith('/barista');
  const is_seller_route = path.startsWith('/seller');
  const is_staff_login = path === '/admin/login';

  if (!is_admin_route && !is_barista_route && !is_seller_route) {
    return NextResponse.next();
  }

  if (is_staff_login) {
    // #region agent log
    fetch(`${request.nextUrl.origin}/api/debug-log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: '470d82',
        location: 'middleware.ts:staff-login',
        message: 'admin login page request',
        data: { path, cookieRole: request.cookies.get(session_cookie)?.value || null },
        hypothesisId: 'H2',
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.next();
  }

  const cookie_role = request.cookies.get(session_cookie)?.value;

  // cookie-вход персонала работает всегда (и без supabase)
  if (staff_cookie_allows(path, cookie_role)) {
    return NextResponse.next();
  }

  if (!is_supabase_live()) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const response = await update_session(request);

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
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (is_admin_route && profile?.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (is_barista_route && !['barista', 'admin'].includes(profile?.role || '')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (is_seller_route && !['seller', 'admin'].includes(profile?.role || '')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/barista/:path*', '/seller/:path*'],
};
