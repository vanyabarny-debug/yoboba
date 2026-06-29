import { NextResponse, type NextRequest } from 'next/server';
import { update_session } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { session_cookie } from '@/lib/session';

function is_supabase_live() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return Boolean(url && key && !url.includes('your-project'));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const is_admin_route = path.startsWith('/admin');
  const is_barista_route = path.startsWith('/barista');
  const is_admin_login = path === '/admin/login';

  if (!is_admin_route && !is_barista_route) {
    return NextResponse.next();
  }

  if (is_admin_login) {
    return NextResponse.next();
  }

  if (!is_supabase_live()) {
    const role = request.cookies.get(session_cookie)?.value;
    if (is_admin_route && role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    if (is_barista_route && !['barista', 'admin'].includes(role || '')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
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

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/barista/:path*'],
};
