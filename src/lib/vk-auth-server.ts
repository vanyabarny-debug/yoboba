import { createClient } from '@supabase/supabase-js';
import {
  vk_auth_email,
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

export async function exchange_vk_code(input: {
  code: string;
  device_id: string;
  code_verifier: string;
  origin?: string;
}) {
  const client_id = process.env.NEXT_PUBLIC_VK_CLIENT_ID;
  if (!client_id) {
    throw new Error('VK client_id не настроен');
  }

  // VK ID web + PKCE: client_secret в обмене кода не нужен
  // (если передать неверный secret — часто приходит «client_id is invalid»)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id,
    redirect_uri: vk_redirect_uri(input.origin),
    code_verifier: input.code_verifier,
    device_id: input.device_id,
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
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'vk token exchange failed');
  }

  return json.access_token;
}

export async function fetch_vk_user(access_token: string): Promise<vk_user_info> {
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
    user?: vk_user_info;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.user?.user_id) {
    throw new Error(json.error_description || json.error || 'vk user info failed');
  }

  return json.user;
}

async function find_user_id_by_vk(vk_user_id: string) {
  const admin = service_client();
  const email = vk_auth_email(vk_user_id);

  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const match = listed.users.find(
    (u) => u.email === email || u.user_metadata?.vk_id === vk_user_id
  );
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
  return parts.join(' ').trim() || 'гость';
}

function normalize_phone(raw?: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
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

  let user_id = await find_user_id_by_vk(vk_id);
  const phone = normalize_phone(input.vk_user.phone);
  const metadata = {
    vk_id,
    provider: 'vk',
    full_name: name,
    first_name: input.vk_user.first_name || null,
    last_name: input.vk_user.last_name || null,
    phone: phone,
    avatar_url: input.vk_user.avatar || null,
  };

  if (!user_id) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) {
      throw new Error(error?.message || 'не удалось создать пользователя');
    }
    user_id = data.user.id;
  } else {
    await admin.auth.admin.updateUserById(user_id, {
      user_metadata: metadata,
    });
  }

  const profile_row: {
    id: string;
    name: string;
    phone?: string;
    updated_at: string;
  } = {
    id: user_id,
    name,
    updated_at: new Date().toISOString(),
  };
  if (phone) profile_row.phone = phone;

  await admin.from('profiles').upsert(profile_row, { onConflict: 'id' });

  if (input.anonymous_user_id && input.anonymous_user_id !== user_id) {
    await merge_cart(input.anonymous_user_id, user_id);
    await admin.auth.admin.deleteUser(input.anonymous_user_id);
  }

  const { data: link, error: link_error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (link_error || !link.properties?.hashed_token) {
    throw new Error(link_error?.message || 'не удалось создать сессию');
  }

  return {
    user_id,
    email,
    token_hash: link.properties.hashed_token,
  };
}
