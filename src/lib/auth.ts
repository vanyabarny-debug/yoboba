import { createBrowserClient } from '@supabase/ssr';
import { sanitize_auth_return_path } from '@/lib/auth-return';
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
  avatar_url?: string | null;
  role: user_role;
};

export type auth_state = {
  user_id: string | null;
  is_anonymous: boolean;
  is_permanent: boolean;
  is_guest: boolean;
  profile: profile | null;
};

function is_guest_user(user: {
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown> | null;
}) {
  if (user.is_anonymous === true) return true;
  if (user.user_metadata?.is_guest === true) return true;
  const email = (user.email || '').toLowerCase();
  return email.endsWith('@guest.yoboba.auth');
}

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

function hydrate_profile(
  user: {
    id: string;
    user_metadata?: Record<string, unknown> | null;
  },
  row: profile | null
): profile {
  const meta = user.user_metadata || {};
  const meta_name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    [meta.first_name, meta.last_name]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join(' ')
      .trim() ||
    '';
  const meta_phone =
    typeof meta.phone === 'string' && meta.phone.trim() ? meta.phone.trim() : '';
  const meta_avatar =
    typeof meta.avatar_url === 'string' && meta.avatar_url.trim()
      ? meta.avatar_url.trim()
      : '';

  const name = (row?.name || '').trim() || meta_name || null;
  const phone = row?.phone || meta_phone || null;

  return {
    id: row?.id || user.id,
    phone,
    name,
    bonus_balance: row?.bonus_balance || 0,
    avatar_emoji: row?.avatar_emoji || null,
    avatar_bg: row?.avatar_bg ?? null,
    avatar_url: row?.avatar_url || meta_avatar || null,
    role: row?.role || 'user',
  };
}

let finish_vk_once: Promise<void> | null = null;

async function finish_vk_browser_session() {
  if (!finish_vk_once) {
    finish_vk_once = (async () => {
      try {
        const res = await fetch('/api/auth/finish-vk', {
          method: 'POST',
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          ok?: boolean;
          session?: Session | null;
        };
        if (body.ok && body.session) {
          await apply_session(body.session);
        }
      } catch {
        /* нет pending vk-сессии */
      }
    })();
  }
  await finish_vk_once;
}

export async function get_auth_state(): Promise<auth_state> {
  if (!is_supabase_configured()) {
    return {
      user_id: null,
      is_anonymous: false,
      is_permanent: false,
      is_guest: false,
      profile: null,
    };
  }

  await finish_vk_browser_session();

  const supabase = get_client();
  const { data: { user: browser_user } } = await supabase.auth.getUser();

  if (browser_user && !browser_user.is_anonymous && !is_guest_user(browser_user)) {
    const row = await get_profile();
    return {
      user_id: browser_user.id,
      is_anonymous: false,
      is_guest: false,
      is_permanent: true,
      profile: hydrate_profile(browser_user, row),
    };
  }

  try {
    const res = await fetch('/api/auth/profile', { credentials: 'same-origin' });
    if (res.ok) {
      const body = (await res.json()) as {
        user: { id: string; is_anonymous: boolean; is_guest?: boolean } | null;
        profile: profile | null;
      };

      if (body.user) {
        const is_guest = body.user.is_guest === true || body.user.is_anonymous;
        return {
          user_id: body.user.id,
          is_anonymous: body.user.is_anonymous,
          is_guest,
          is_permanent: !body.user.is_anonymous && !is_guest,
          profile: body.profile,
        };
      }
    }
  } catch {
    /* нет серверной сессии */
  }

  if (!browser_user) {
    return {
      user_id: null,
      is_anonymous: false,
      is_permanent: false,
      is_guest: false,
      profile: null,
    };
  }

  const profile = hydrate_profile(browser_user, await get_profile());
  const is_anonymous = browser_user.is_anonymous === true;
  const is_guest = is_guest_user(browser_user);

  return {
    user_id: browser_user.id,
    is_anonymous,
    is_guest,
    is_permanent: !is_anonymous && !is_guest,
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
  const safe_return = sanitize_auth_return_path(return_path);
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

  const next = encodeURIComponent(sanitize_auth_return_path(return_path));
  // redirect_uri всегда из NEXT_PUBLIC_SITE_URL на сервере — не подмешиваем clientOrigin
  window.location.assign(`/api/auth/vk?returnTo=${next}`);
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
