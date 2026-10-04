import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { read_durable_json, write_durable_json } from '@/lib/durable-json';
import { get_sellers } from '@/lib/sellers-server';

const store_key = 'admin-account';
const history_limit = 80;
const default_login = 'admin';
const default_password = 'admin';

export type admin_login_event = {
  id: string;
  at: string;
  device: string;
  browser: string;
  ip: string;
};

type stored_account = {
  login: string;
  salt: string;
  password_hash: string;
  logins: admin_login_event[];
};

function empty_account(): stored_account {
  return { login: default_login, salt: '', password_hash: '', logins: [] };
}

function is_event(value: unknown): value is admin_login_event {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<admin_login_event>;
  return typeof row.id === 'string' && typeof row.at === 'string' && typeof row.device === 'string';
}

function parse_account(raw: unknown): stored_account {
  if (!raw || typeof raw !== 'object') return empty_account();
  const row = raw as Partial<stored_account>;
  const login = typeof row.login === 'string' ? row.login.trim().toLowerCase() : '';
  return {
    login: login || default_login,
    salt: typeof row.salt === 'string' ? row.salt : '',
    password_hash: typeof row.password_hash === 'string' ? row.password_hash : '',
    logins: Array.isArray(row.logins) ? row.logins.filter(is_event).slice(0, history_limit) : [],
  };
}

async function read_account() {
  return parse_account(await read_durable_json<unknown>(store_key, null));
}

function hash_password(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString('hex');
}

function hashes_match(password: string, salt: string, hash: string) {
  if (!salt || !hash) return false;
  const next = Buffer.from(hash_password(password, salt), 'hex');
  const prev = Buffer.from(hash, 'hex');
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function password_matches(account: stored_account, login: string, password: string) {
  const normalized = login.trim().toLowerCase();
  if (normalized !== account.login) return false;
  if (!account.password_hash) {
    return account.login === default_login && password === default_password;
  }
  return hashes_match(password, account.salt, account.password_hash);
}

export function describe_admin_client(request: Request) {
  const ua = request.headers.get('user-agent') || '';
  let device = 'неизвестное устройство';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Mac OS X/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/CrOS/.test(ua)) device = 'Chromebook';
  else if (/Linux/.test(ua)) device = 'Linux';

  let browser = 'браузер';
  if (/YaBrowser/.test(ua)) browser = 'Яндекс';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
  const ip = forwarded.split(',')[0]?.trim() || '—';
  return { device, browser, ip };
}

export async function verify_admin_login(login: string, password: string) {
  const account = await read_account();
  return password_matches(account, login, password);
}

export async function record_admin_login(request: Request) {
  const account = await read_account();
  const client = describe_admin_client(request);
  const event: admin_login_event = {
    id: `log_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    at: new Date().toISOString(),
    device: client.device,
    browser: client.browser,
    ip: client.ip,
  };
  account.logins = [event, ...account.logins].slice(0, history_limit);
  await write_durable_json(store_key, account);
  return event;
}

export async function read_admin_account_public() {
  const account = await read_account();
  return { login: account.login, logins: account.logins };
}

export async function update_admin_account(input: {
  current_password: string;
  login: string;
  new_password: string;
}) {
  const account = await read_account();
  if (!password_matches(account, account.login, input.current_password)) {
    return { ok: false as const, error: 'неверный текущий пароль' };
  }

  const login = input.login.trim().toLowerCase();
  if (login.length < 2 || login.length > 40 || /\s/.test(login)) {
    return { ok: false as const, error: 'логин: от 2 до 40 символов, без пробелов' };
  }

  const sellers = await get_sellers();
  if (sellers.some((seller) => seller.login.toLowerCase() === login)) {
    return { ok: false as const, error: 'такой логин уже есть у сотрудника' };
  }

  const next_password = input.new_password || input.current_password;
  if (next_password.length < 4) {
    return { ok: false as const, error: 'пароль короче 4 символов' };
  }

  const salt = randomBytes(16).toString('hex');
  account.login = login;
  account.salt = salt;
  account.password_hash = hash_password(next_password, salt);
  await write_durable_json(store_key, account);
  return { ok: true as const, login };
}
