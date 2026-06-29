import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function create_server_client() {
  const cookie_store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookie_store.getAll();
        },
        setAll(cookies_to_set) {
          try {
            cookies_to_set.forEach(({ name, value, options }) =>
              cookie_store.set(name, value, options)
            );
          } catch {
            // серверный компонент — set может быть недоступен
          }
        },
      },
    }
  );
}
