import { create_server_client } from '@/lib/supabase/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { normalize_phone } from '@/lib/phone';

export type gift_actor = {
  id: string;
  name: string;
  phone: string | null;
};

export async function resolve_gift_actor(
  _request: Request,
  body?: {
    sender_id?: string;
    sender_name?: string;
    sender_phone?: string | null;
    user_id?: string;
    phone?: string | null;
  }
): Promise<gift_actor | null> {
  if (is_supabase_configured()) {
    try {
      const supabase = await create_server_client();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && !user.is_anonymous) {
        const admin = create_service_client();
        const { data: profile } = await admin
          .from('profiles')
          .select('id, name, phone')
          .eq('id', user.id)
          .maybeSingle();
        const meta = user.user_metadata as { name?: string; phone?: string } | undefined;
        return {
          id: user.id,
          name: (profile?.name || meta?.name || '').trim() || 'гость',
          phone: normalize_phone(profile?.phone) || normalize_phone(meta?.phone),
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  const id = String(body?.sender_id || body?.user_id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(body?.sender_name || '').trim() || 'гость',
    phone: normalize_phone(body?.sender_phone || body?.phone || null),
  };
}
