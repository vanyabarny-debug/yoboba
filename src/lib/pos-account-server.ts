import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { read_durable_json, write_durable_json } from '@/lib/durable-json';
import { read_admin_account_public } from '@/lib/admin-account-server';
import { get_sellers } from '@/lib/sellers-server';

const store_key = 'pos-account';
const default_login = 'kassa';
const default_password = 'kassa';

type stored_account = {
  login: string;
  salt: string;
  password_hash: string;
};

function empty_account(): stored_account {
  return { login: default_login, salt: '', password_hash: '' };
}

function parse_account(raw: unknown): stored_account {
  if (!raw || typeof raw !== 'object') return empty_account();
  const row = raw as Partial<stored_account>;
  const login = typeof row.login === 'string' ? row.login.trim().toLowerCase() : '';
  return {
    login: login || default_login,
    salt: typeof row.salt === 'string' ? row.salt : '',
    password_hash: typeof row.password_hash === 'string' ? row.password_hash : '',
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

export async function verify_pos_login(login: string, password: string) {
  const account = await read_account();
  return password_matches(account, login, password);
}

export async function read_pos_account_public() {
  const account = await read_account();
  return { login: account.login };
}

export async function update_pos_account(input: {
  current_password: string;
  login: string;
  new_password: string;
}) {
  const account = await read_account();
  if (!password_matches(account, account.login, input.current_password)) {
    return { ok: false as const, error: 'неверный текущий пароль кассы' };
  }

  const login = input.login.trim().toLowerCase();
  if (login.length < 2 || login.length > 40 || /\s/.test(login)) {
    return { ok: false as const, error: 'логин: от 2 до 40 символов, без пробелов' };
  }

  const admin = await read_admin_account_public();
  if (admin.login.toLowerCase() === login) {
    return { ok: false as const, error: 'такой логин уже у админа' };
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
