import { createBrowserClient } from '@supabase/ssr';
import { is_supabase_configured } from '@/lib/supabase/config';
import { is_vk_auth_configured } from '@/lib/vk-auth-config';
import type { Session } from '@supabase/supabase-js';

export type user_role = 'user' | 'barista' | 'admin';

export type profile = {
  id: string;
  phone: string | null;
  name: string | null;
  bonus_balance: number;
  avatar_emoji: string | null;
  avatar_bg: string | null;
  role: user_role;
};

export type auth_state = {
  user_id: string | null;
  is_anonymous: boolean;
  is_permanent: boolean;
  profile: profile | null;
};

function get_client() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function apply_session(session: Session | null) {
  if (!session) return;
  const supabase = get_client();
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

async function ensure_guest_session() {
  const res = await fetch('/api/auth/guest', {
    method: 'POST',
    credentials: 'same-origin',
  });
  const body = (await res.json()) as {
    error?: string;
    user_id?: string;
    session?: Session | null;
  };

  if (!res.ok) {
    return { user: null, error: new Error(body.error || 'guest session failed') };
  }

  if (body.session) {
    await apply_session(body.session);
  }

  const supabase = get_client();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return { user, error: null };

  return {
    user: null,
    error: error || new Error('guest session failed'),
  };
}

export async function ensure_anonymous_session() {
  if (!is_supabase_configured()) {
    return { user: null, error: new Error('supabase not configured') };
  }

  const supabase = get_client();
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) {
    return { user: existing.user, error: null };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (data.user) {
    return { user: data.user, error: null };
  }

  const anon_disabled =
    error?.message?.toLowerCase().includes('anonymous') ?? false;
  if (anon_disabled || error) {
    return ensure_guest_session();
  }

  return { user: null, error };
}

export async function get_auth_state(): Promise<auth_state> {
  if (!is_supabase_configured()) {
    return { user_id: null, is_anonymous: false, is_permanent: false, profile: null };
  }

  try {
    const res = await fetch('/api/auth/profile', { credentials: 'same-origin' });
    if (res.ok) {
      const body = (await res.json()) as {
        user: { id: string; is_anonymous: boolean } | null;
        profile: profile | null;
      };

      if (body.user) {
        return {
          user_id: body.user.id,
          is_anonymous: body.user.is_anonymous,
          is_permanent: !body.user.is_anonymous,
          profile: body.profile,
        };
      }
    }
  } catch {
    /* fallback to browser client */
  }

  const supabase = get_client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { user_id: null, is_anonymous: false, is_permanent: false, profile: null };
  }

  const profile = await get_profile();
  const is_anonymous = user.is_anonymous === true;

  return {
    user_id: user.id,
    is_anonymous,
    is_permanent: !is_anonymous,
    profile,
  };
}

function auth_site_origin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export async function sign_in_with_email(email: string, return_path = '/') {
  const supabase = get_client();
  const normalized = email.trim().toLowerCase();
  const safe_return = return_path.startsWith('/') ? return_path : '/';
  const origin = auth_site_origin();
  const redirect_to = `${origin}/auth/callback?next=${encodeURIComponent(safe_return)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirect_to,
    },
  });

  return { error };
}

export async function verify_email_otp(email: string, token: string) {
  const supabase = get_client();
  const normalized = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.verifyOtp({
    email: normalized,
    token: token.trim(),
    type: 'email',
  });

  return { data, error };
}

export function start_vk_sign_in(return_path = '/') {
  if (!is_vk_auth_configured()) {
    return { error: new Error('vk auth not configured') };
  }

  const next = encodeURIComponent(return_path);
  window.location.href = `/api/auth/vk?returnTo=${next}`;
  return { error: null };
}

export async function sign_in_with_otp(phone: string) {
  const supabase = get_client();
  const formatted = phone.startsWith('+') ? phone : `+7${phone.replace(/\D/g, '')}`;

  const { error } = await supabase.auth.signInWithOtp({
    phone: formatted,
  });

  return { error };
}

export async function verify_otp(phone: string, token: string) {
  const supabase = get_client();
  const formatted = phone.startsWith('+') ? phone : `+7${phone.replace(/\D/g, '')}`;

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formatted,
    token,
    type: 'sms',
  });

  return { data, error };
}

export async function sign_out() {
  const supabase = get_client();
  return supabase.auth.signOut();
}

export async function get_session() {
  const supabase = get_client();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function get_profile(): Promise<profile | null> {
  const supabase = get_client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, phone, name, bonus_balance, avatar_emoji, avatar_bg, role')
    .eq('id', user.id)
    .single();

  return data;
}

export async function update_profile(input: { name?: string; phone?: string }) {
  const res = await fetch('/api/auth/profile', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as { profile?: profile; error?: string };
  if (!res.ok || !body.profile) {
    return {
      profile: null,
      error: new Error(body.error || 'не удалось сохранить'),
    };
  }
  return { profile: body.profile, error: null };
}
