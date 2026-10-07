import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';

async function with_timeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function update_session(request: NextRequest) {
  let supabase_response = NextResponse.next({ request });

  // без валидных ключей не создаём клиент — иначе createServerClient бросает
  // исключение и роняет весь сайт (500 на всех маршрутах через middleware)
  if (!is_supabase_configured()) {
    return supabase_response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies_to_set) {
          cookies_to_set.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabase_response = NextResponse.next({ request });
          cookies_to_set.forEach(({ name, value, options }) =>
            supabase_response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // если supabase недоступен с VPS — не держим весь сайт 10+ секунд
  await with_timeout(supabase.auth.getUser(), 1500);

  return supabase_response;
}
