import { NextResponse } from 'next/server';
import { seller_id_cookie, seller_name_cookie, session_cookie } from '@/lib/session';

export const staff_proof_cookie = 'yoboba_staff';

const staff_roles = ['admin', 'barista', 'seller'] as const;
type staff_role = (typeof staff_roles)[number];

export type staff_claims = {
  role: staff_role;
  seller_id: string;
  name: string;
  exp: number;
};

type cookie_jar = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string): unknown;
  delete(name: string): unknown;
};

function secret_bytes() {
  const raw = process.env.STAFF_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

function bytes_to_b64url(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64url_to_bytes(value: string) {
  try {
    const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
    const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function timing_safe_equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(data: string) {
  const key_bytes = secret_bytes();
  if (!key_bytes) return null;
  const raw = new Uint8Array(key_bytes.byteLength);
  raw.set(key_bytes);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

export function base_cookie_options(max_age = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    path: '/',
    maxAge: max_age,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export async function sign_staff_token(input: {
  role: staff_role;
  seller_id?: string;
  name?: string;
  max_age_sec?: number;
}) {
  const exp = Math.floor(Date.now() / 1000) + (input.max_age_sec ?? 60 * 60 * 24 * 7);
  const payload = JSON.stringify({
    v: 1,
    r: input.role,
    sid: (input.seller_id || '').slice(0, 80),
    n: (input.name || '').slice(0, 80),
    exp,
  });
  const body = bytes_to_b64url(new TextEncoder().encode(payload));
  const sig = await hmac(body);
  if (!sig) return null;
  return `${body}.${bytes_to_b64url(sig)}`;
}

export async function verify_staff_token(token: string | undefined | null): Promise<staff_claims | null> {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = b64url_to_bytes(token.slice(dot + 1));
  const expected = await hmac(body);
  if (!sig || !expected || !timing_safe_equal(sig, expected)) return null;
  const payload_bytes = b64url_to_bytes(body);
  if (!payload_bytes) return null;
  let parsed: { v?: number; r?: string; sid?: string; n?: string; exp?: number };
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload_bytes));
  } catch {
    return null;
  }
  if (parsed.v !== 1 || !staff_roles.includes(parsed.r as staff_role)) return null;
  if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return {
    role: parsed.r as staff_role,
    seller_id: typeof parsed.sid === 'string' ? parsed.sid : '',
    name: typeof parsed.n === 'string' ? parsed.n : '',
    exp: parsed.exp,
  };
}

function drop_staff_cookies(jar: cookie_jar) {
  jar.delete(session_cookie);
  jar.delete(seller_id_cookie);
  jar.delete(seller_name_cookie);
  jar.delete(staff_proof_cookie);
  jar.delete('yoboba_admin');
}

/** Подпись — единственное доказательство роли. Чужую cookie с role=admin запрос больше не видит. */
export async function bind_staff_request(jar: cookie_jar) {
  const claims = await verify_staff_token(jar.get(staff_proof_cookie)?.value);
  if (claims) {
    jar.set(session_cookie, claims.role);
    if (claims.seller_id) jar.set(seller_id_cookie, claims.seller_id);
    else jar.delete(seller_id_cookie);
    if (claims.name) jar.set(seller_name_cookie, claims.name);
    else jar.delete(seller_name_cookie);
    jar.delete('yoboba_admin');
    return claims;
  }

  const role = jar.get(session_cookie)?.value;
  const legacy = jar.get('yoboba_admin')?.value === '1';
  if (legacy || role === 'admin' || role === 'seller' || role === 'barista') {
    drop_staff_cookies(jar);
  }
  return null;
}

export async function apply_staff_cookies(
  res: NextResponse,
  input: { role: staff_role; seller_id?: string | null; name?: string | null }
) {
  const token = await sign_staff_token({
    role: input.role,
    seller_id: input.seller_id || '',
    name: input.name || '',
  });
  if (!token) return false;
  const opts = base_cookie_options();
  res.cookies.set(session_cookie, input.role, opts);
  res.cookies.set(staff_proof_cookie, token, opts);
  if (input.seller_id) {
    res.cookies.set(seller_id_cookie, input.seller_id, opts);
    res.cookies.set(seller_name_cookie, input.name || '', opts);
  } else {
    res.cookies.set(seller_id_cookie, '', { ...opts, maxAge: 0 });
    res.cookies.set(seller_name_cookie, '', { ...opts, maxAge: 0 });
  }
  res.cookies.set('yoboba_admin', '', { ...opts, maxAge: 0 });
  return true;
}

export function clear_staff_cookies(res: NextResponse) {
  const opts = base_cookie_options(0);
  res.cookies.set(session_cookie, '', opts);
  res.cookies.set(staff_proof_cookie, '', opts);
  res.cookies.set(seller_id_cookie, '', opts);
  res.cookies.set(seller_name_cookie, '', opts);
  res.cookies.set('yoboba_admin', '', opts);
}
