import { createClient } from '@supabase/supabase-js';
import {
  vk_auth_email,
  vk_public_info_url,
  vk_redirect_uri,
  vk_token_url,
  vk_user_info_url,
} from '@/lib/vk-auth-config';

export type vk_user_info = {
  user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  phone?: string;
  phone_number?: string;
  verified_phone?: string;
  birthday?: string;
};

function service_client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function wrap_fetch_error(target: string, err: unknown): never {
  const cause =
    err instanceof Error
      ? `${err.message}${err.cause instanceof Error ? `: ${err.cause.message}` : ''}`
      : String(err);
  throw new Error(`не удалось связаться с ${target} (${cause})`);
}

function decode_jwt_payload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pick_phone_raw(...candidates: unknown[]): string {
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    // маскированный +7 *** ***-**-00 нам не подходит как полный номер
    if (trimmed.includes('*')) continue;
    return trimmed;
  }
  return '';
}

export async function exchange_vk_code(input: {
  code: string;
  device_id: string;
  code_verifier: string;
  state: string;
  /** точный redirect_uri из authorize (обязательно совпадение) */
  redirect_uri?: string;
  /** @deprecated используй redirect_uri */
  origin?: string;
}) {
  const client_id = process.env.NEXT_PUBLIC_VK_CLIENT_ID;
  if (!client_id) {
    throw new Error('VK client_id не настроен');
  }

  const redirect_uri =
    input.redirect_uri ||
    (input.origin ? vk_redirect_uri(input.origin) : vk_redirect_uri(process.env.NEXT_PUBLIC_SITE_URL || ''));

  // VK ID web + PKCE: client_secret в обмене кода не нужен
  // (если передать неверный secret — часто приходит «client_id is invalid»)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id,
    redirect_uri,
    code_verifier: input.code_verifier,
    device_id: input.device_id,
    state: input.state,
  });

  let res: Response;
  try {
    res = await fetch(vk_token_url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    wrap_fetch_error('id.vk.ru', err);
  }

  const json = (await res.json()) as {
    access_token?: string;
    id_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'vk token exchange failed');
  }

  const granted_scope = json.scope || '';
  if (!granted_scope.split(/\s+/).includes('phone')) {
    console.warn(
      '[vk] access token без scope phone — в кабинете VK ID включите доступ «телефон» для приложения'
    );
  }

  return {
    access_token: json.access_token,
    id_token: json.id_token ?? null,
    scope: granted_scope,
  };
}

export async function fetch_vk_user(
  access_token: string,
  id_token?: string | null
): Promise<vk_user_info> {
  const client_id = process.env.NEXT_PUBLIC_VK_CLIENT_ID;
  if (!client_id) {
    throw new Error('VK client_id не настроен');
  }

  let res: Response;
  try {
    res = await fetch(vk_user_info_url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token, client_id }),
    });
  } catch (err) {
    wrap_fetch_error('id.vk.ru/user_info', err);
  }

  const json = (await res.json()) as {
    user?: vk_user_info & Record<string, unknown>;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.user?.user_id) {
    throw new Error(json.error_description || json.error || 'vk user info failed');
  }

  const user = json.user;
  const jwt_payload = id_token ? decode_jwt_payload(id_token) : null;

  let phone = pick_phone_raw(
    user.phone,
    user.phone_number,
    user.verified_phone,
    jwt_payload?.phone,
    jwt_payload?.phone_number,
    jwt_payload?.verified_phone
  );

  // fallback: public_info по id_token (маскированный — только если больше ничего нет)
  if (!phone && id_token) {
    try {
      const pub = await fetch(vk_public_info_url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token, client_id }),
      });
      const pub_json = (await pub.json()) as {
        user?: { phone?: string };
      };
      if (pub.ok && pub_json.user?.phone) {
        const masked = pick_phone_raw(pub_json.user.phone);
        if (masked) phone = masked;
      }
    } catch {
      /* ignore */
    }
  }

  if (!phone) {
    console.warn('[vk] phone missing after user_info/id_token — проверьте scope phone в VK ID');
  } else {
    console.log('[vk] phone received', { digits: phone.replace(/\D/g, '').length });
  }

  return {
    ...user,
    user_id: String(user.user_id),
    phone: phone || undefined,
    birthday: typeof user.birthday === 'string' ? user.birthday : undefined,
  };
}

async function find_user_id_by_email(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  // GoTrue admin filter by email — быстрее listUsers
  const res = await fetch(
    `${url.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
    }
  );
  if (!res.ok) return null;

  const json = (await res.json()) as { users?: { id: string; email?: string }[] };
  const match = json.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

async function merge_cart(from_id: string, to_id: string) {
  if (from_id === to_id) return;

  const admin = service_client();
  const { data: rows } = await admin.from('cart_items').select('*').eq('user_id', from_id);
  if (!rows?.length) return;

  for (const row of rows) {
    const { data: existing } = await admin
      .from('cart_items')
      .select('quantity')
      .eq('user_id', to_id)
      .eq('menu_id', row.menu_id)
      .maybeSingle();

    const quantity = (existing?.quantity || 0) + row.quantity;
    await admin.from('cart_items').upsert(
      {
        user_id: to_id,
        menu_id: row.menu_id,
        quantity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,menu_id' }
    );
  }

  await admin.from('cart_items').delete().eq('user_id', from_id);
}

function display_name(info: vk_user_info) {
  const parts = [info.first_name, info.last_name].filter(Boolean);
  const joined = parts.join(' ').trim();
  if (joined) return joined;
  // не «гость» — иначе путается с гостевой сессией в шапке
  return `id${info.user_id}`;
}

function normalize_phone(raw?: string | null) {
  if (!raw) return null;
  if (raw.includes('*')) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return raw.trim().startsWith('+') ? raw.trim() : `+${digits}`;
}

export async function upsert_vk_supabase_user(input: {
  vk_user: vk_user_info;
  anonymous_user_id?: string | null;
}) {
  const admin = service_client();
  const vk_id = input.vk_user.user_id;
  const email = input.vk_user.email?.trim() || vk_auth_email(vk_id);
  const name = display_name(input.vk_user);

  let user_id = await find_user_id_by_email(email);
  // если пользователь ранее логинился через synthetic vk-email — тоже найдём
  if (!user_id && email !== vk_auth_email(vk_id)) {
    user_id = await find_user_id_by_email(vk_auth_email(vk_id));
  }
  const phone = normalize_phone(input.vk_user.phone);
  const metadata = {
    vk_id,
    provider: 'vk',
    is_guest: false,
    full_name: name,
    first_name: input.vk_user.first_name || null,
    last_name: input.vk_user.last_name || null,
    phone: phone,
    avatar_url: input.vk_user.avatar || null,
    birthday: input.vk_user.birthday || null,
    vk_email:
      input.vk_user.email?.trim() && !input.vk_user.email.includes('@auth.yoboba')
        ? input.vk_user.email.trim()
        : null,
  };

  if (!user_id) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(phone ? { phone, phone_confirm: true } : {}),
      user_metadata: metadata,
    });

    if (error || !data.user) {
      // уже есть / конфликт телефона — ищем ещё раз или создаём без phone
      const existing =
        (await find_user_id_by_email(email)) ||
        (await find_user_id_by_email(vk_auth_email(vk_id)));

      if (existing) {
        user_id = existing;
        await admin.auth.admin.updateUserById(user_id, {
          user_metadata: metadata,
          ...(phone ? { phone, phone_confirm: true } : {}),
        });
      } else if (phone) {
        const retry = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: metadata,
        });
        if (retry.error || !retry.data.user) {
          throw new Error(retry.error?.message || error?.message || 'не удалось создать пользователя');
        }
        user_id = retry.data.user.id;
      } else {
        throw new Error(error?.message || 'не удалось создать пользователя');
      }
    } else {
      user_id = data.user.id;
    }
  } else {
    await admin.auth.admin.updateUserById(user_id, {
      user_metadata: metadata,
      ...(phone ? { phone, phone_confirm: true } : {}),
    });
  }

  // телефон из VK обновляем при каждом входе (если VK его отдал)
  const { random_avatar_emoji } = await import('@/lib/avatar-emoji');
  const { data: existing_profile } = await admin
    .from('profiles')
    .select('avatar_emoji')
    .eq('id', user_id)
    .maybeSingle();

  const profile_row: {
    id: string;
    name: string;
    phone?: string | null;
    avatar_emoji?: string;
    updated_at: string;
  } = {
    id: user_id,
    name,
    updated_at: new Date().toISOString(),
  };
  if (phone) {
    profile_row.phone = phone;
  }
  if (!existing_profile?.avatar_emoji) {
    profile_row.avatar_emoji = random_avatar_emoji();
  }

  await admin.from('profiles').upsert(profile_row, { onConflict: 'id' });

  // если телефон пришёл — дополнительно force-update (upsert может не трогать null→value в некоторых кейсах)
  if (phone) {
    await admin
      .from('profiles')
      .update({ phone, updated_at: new Date().toISOString() })
      .eq('id', user_id);
  }

  if (input.anonymous_user_id && input.anonymous_user_id !== user_id) {
    // только мержим корзину — удаление anon не блокирует вход (иначе nginx 502)
    await merge_cart(input.anonymous_user_id, user_id).catch(() => {});
  }

  const { data: link, error: link_error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (link_error || !link.properties?.hashed_token) {
    throw new Error(link_error?.message || 'не удалось создать сессию');
  }

  // убеждаемся, что профиль реально есть
  const { data: profile_check } = await admin
    .from('profiles')
    .select('id, name')
    .eq('id', user_id)
    .maybeSingle();

  if (!profile_check) {
    await admin.from('profiles').upsert(
      {
        id: user_id,
        name,
        phone: phone || null,
        avatar_emoji: random_avatar_emoji(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } else if (!profile_check.name) {
    await admin
      .from('profiles')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', user_id);
  }

  // гасим magiclink сразу на сервере — в URL hashed_token часто портится / «expires»
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // как в /api/auth/guest: generateLink(magiclink) + verifyOtp(type: email)
  const { data: verified, error: verify_error } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'email',
  });

  if (verify_error || !verified.session) {
    throw new Error(verify_error?.message || 'не удалось создать сессию');
  }

  return {
    user_id,
    email,
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  };
}
